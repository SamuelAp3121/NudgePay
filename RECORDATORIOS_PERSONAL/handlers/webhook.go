package handlers

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"invoice-reminder/config"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// WompiEvent es el evento que envia Wompi a nuestro webhook.
type WompiEvent struct {
	Event string `json:"event"`
	Data  struct {
		Transaction struct {
			ID                string `json:"id"`
			Status            string `json:"status"`
			Reference         string `json:"reference"`
			AmountInCents     int64  `json:"amount_in_cents"`
			Currency          string `json:"currency"`
			PaymentMethodType string `json:"payment_method_type"`
			PaymentMethod     struct {
				Type string `json:"type"`
			} `json:"payment_method"`
		} `json:"transaction"`
	} `json:"data"`
	Signature struct {
		Checksum   string   `json:"checksum"`
		Properties []string `json:"properties"`
	} `json:"signature"`
	Timestamp int64 `json:"timestamp"`
}

// HandleWebhook recibe los eventos de la pasarela (Wompi) y concilia el pago.
// HandleWebhookVerification responde la verificación de webhook de Meta
// (WhatsApp Cloud API): GET /webhook con hub.mode, hub.verify_token y
// hub.challenge. Meta exige que el endpoint devuelva el challenge tal cual
// cuando el verify token coincide.
//
// Variables: WHATSAPP_VERIFY_TOKEN (el valor que usted ponga en Meta y aquí).
func HandleWebhookVerification(c *fiber.Ctx) error {
	mode := c.Query("hub.mode")
	token := c.Query("hub.verify_token")
	challenge := c.Query("hub.challenge")

	esperado := strings.TrimSpace(os.Getenv("WHATSAPP_VERIFY_TOKEN"))

	if mode == "subscribe" && esperado != "" && token == esperado && challenge != "" {
		log.Println("Webhook de Meta verificado correctamente")
		return c.SendString(challenge)
	}

	log.Printf("Verificación de webhook de Meta rechazada (mode=%s, token_ok=%v)", mode, token == esperado && esperado != "")
	return c.SendStatus(http.StatusForbidden)
}

// POST /webhook
//
// La referencia de la transaccion debe tener el formato: <factura_id>:<numero_cuota>
func HandleWebhook(c *fiber.Ctx) error {
	body := c.Body()
	if len(body) == 0 {
		body = []byte(c.FormValue(""))
	}

	var event WompiEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Webhook: JSON invalido (%d bytes): %v", len(body), err)
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON invalido"})
	}

	// Evento de Meta (WhatsApp Business): {"object":"whatsapp_business_account",...}
	// No coincide con la estructura de Wompi (Event quedaria vacio). Se registra
	// y se confirma con 200 para que Meta no reintente durante 7 dias.
	var meta struct {
		Object string `json:"object"`
	}
	_ = json.Unmarshal(body, &meta)
	if meta.Object == "whatsapp_business_account" {
		log.Printf("Webhook Meta (WhatsApp) recibido: %d bytes", len(body))
		return c.JSON(fiber.Map{"mensaje": "Evento de WhatsApp recibido"})
	}

	// 1) Verificar la firma si hay secreto configurado.
	if secret := strings.TrimSpace(os.Getenv("WOMPI_EVENTS_SECRET")); secret != "" {
		if !firmaValida(event, secret) {
			log.Printf("Webhook con firma invalida (ref=%s)", event.Data.Transaction.Reference)
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "Firma invalida"})
		}
	} else {
		log.Println("AVISO: WOMPI_EVENTS_SECRET no configurado, se acepta el webhook sin verificar firma (solo desarrollo)")
	}

	tx := event.Data.Transaction
	if tx.Status != "APPROVED" {
		return c.JSON(fiber.Map{"mensaje": "Evento ignorado", "estado": tx.Status})
	}

	// 2) Suscripción Pro: la referencia empieza por PRO- (insensible a mayúsculas,
	// por si Wompi la transforma). Si no empieza por PRO- pero existe en la tabla
	// suscripciones, también se intenta activar (protege referencias legadas).
	referencia := strings.TrimSpace(tx.Reference)
	esSuscripcion := strings.HasPrefix(strings.ToUpper(referencia), "PRO-")
	if !esSuscripcion {
		var existe bool
		_ = config.DB.QueryRow(`SELECT EXISTS (SELECT 1 FROM suscripciones WHERE referencia = $1)`, referencia).Scan(&existe)
		esSuscripcion = existe
	}
	if esSuscripcion {
		encontrada, err := ActivarSuscripcion(referencia, tx.ID)
		if err != nil {
			log.Printf("Webhook: error activando suscripción (ref=%s, tx=%s): %v", referencia, tx.ID, err)
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo activar la suscripción", "detalle": err.Error()})
		}
		if !encontrada {
			log.Printf("Webhook: suscripción no encontrada (ref=%s, tx=%s)", referencia, tx.ID)
			return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Suscripción no encontrada"})
		}
		log.Printf("Plan Pro activado por webhook (ref=%s, tx=%s)", referencia, tx.ID)
		return c.JSON(fiber.Map{"mensaje": "Suscripción activada", "referencia": referencia})
	}

	// 3) Referencia de cuota: <factura_id>:<numero_cuota>
	partes := strings.Split(tx.Reference, ":")
	if len(partes) != 2 {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Referencia invalida, se espera <factura_id>:<cuota>"})
	}
	facturaID, numero := partes[0], partes[1]

	// 4) Idempotencia: si la transaccion ya se proceso, no hacer nada.
	var yaProcesada bool
	_ = config.DB.QueryRow(`SELECT EXISTS (SELECT 1 FROM pagos WHERE referencia = $1)`, tx.ID).Scan(&yaProcesada)
	if yaProcesada {
		return c.JSON(fiber.Map{"mensaje": "Transaccion ya procesada"})
	}

	// 5) Marcar la cuota como pagada.
	res, err := config.DB.Exec(
		`UPDATE cuotas SET estado = 'pagada', pagada_en = CURRENT_TIMESTAMP,
		        metodo_pago = 'pasarela', referencia_pago = $3
		  WHERE factura_id = $1 AND numero = $2 AND estado <> 'pagada'`,
		facturaID, numero, tx.ID,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la cuota", "detalle": err.Error()})
	}
	affected, _ := res.RowsAffected()

	// 6) Guardar el pago (auditoria) aunque la cuota ya estuviera pagada.
	_, _ = config.DB.Exec(
		`INSERT INTO pagos (factura_id, cuota_numero, referencia, pasarela, estado, monto, moneda, metodo)
		 VALUES ($1, $2, $3, 'wompi', $4, $5, $6, $7)
		 ON CONFLICT (referencia) DO NOTHING`,
		facturaID, numero, tx.ID, tx.Status, float64(tx.AmountInCents)/100, tx.Currency, metodoWompi(tx.PaymentMethod.Type, tx.PaymentMethodType),
	)

	actualizarEstadoFactura(facturaID)

	log.Printf("Pago aprobado %s (factura %s, cuota %s, cuotas actualizadas: %d)", tx.ID, facturaID, numero, affected)

	return c.JSON(fiber.Map{"mensaje": "Pago registrado", "factura_id": facturaID, "cuota": numero})
}

// metodoWompi devuelve el tipo de pago reportado por Wompi.
func metodoWompi(tipo, tipoAlternativo string) string {
	if tipo != "" {
		return tipo
	}
	return tipoAlternativo
}

// firmaValida comprueba el checksum de Wompi:
// SHA256( valores de las propiedades + timestamp + secreto de eventos ).
func firmaValida(event WompiEvent, secret string) bool {
	tx := event.Data.Transaction

	valores := map[string]string{
		"transaction.id":              tx.ID,
		"transaction.status":          tx.Status,
		"transaction.amount_in_cents": strconv.FormatInt(tx.AmountInCents, 10),
		"transaction.currency":        tx.Currency,
		"transaction.reference":       tx.Reference,
	}

	var cadena strings.Builder
	for _, prop := range event.Signature.Properties {
		cadena.WriteString(valores[prop])
	}
	cadena.WriteString(strconv.FormatInt(event.Timestamp, 10))
	cadena.WriteString(secret)

	sum := sha256.Sum256([]byte(cadena.String()))
	esperado := hex.EncodeToString(sum[:])

	return strings.EqualFold(esperado, strings.TrimSpace(event.Signature.Checksum))
}

// ListarPagos devuelve el historial de pagos de una factura del usuario.
// GET /api/v1/facturas/:id/pagos
func ListarPagos(c *fiber.Ctx) error {
	id := c.Params("id")
	usuarioID, _ := c.Locals("usuario_id").(string)

	var existe string
	if err := config.DB.QueryRow(`SELECT id FROM facturas WHERE id = $1 AND usuario_id = $2`, id, usuarioID).Scan(&existe); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}

	rows, err := config.DB.Query(
		`SELECT id, cuota_numero, referencia, pasarela, estado, monto, moneda, metodo,
		        to_char(creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF')
		   FROM pagos WHERE factura_id = $1 ORDER BY creado_en DESC`,
		id,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener los pagos"})
	}
	defer rows.Close()

	pagos := []fiber.Map{}
	for rows.Next() {
		var pid, pasarela, estado, moneda, metodo, creado string
		var cuotaNumero int
		var monto float64
		var referencia sql.NullString
		if err := rows.Scan(&pid, &cuotaNumero, &referencia, &pasarela, &estado, &monto, &moneda, &metodo, &creado); err != nil {
			continue
		}
		pagos = append(pagos, fiber.Map{
			"id": pid, "cuota": cuotaNumero, "referencia": referencia.String, "pasarela": pasarela,
			"estado": estado, "monto": monto, "moneda": moneda, "metodo": metodo, "creado_en": creado,
		})
	}

	return c.JSON(fiber.Map{"pagos": pagos, "total": len(pagos)})
}