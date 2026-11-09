package handlers

import (
	"crypto/hmac"
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

	// 2) Suscripción Pro: la referencia empieza por PRO-
	if strings.HasPrefix(tx.Reference, "PRO-") {
		encontrada, err := ActivarSuscripcion(tx.Reference, tx.ID)
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo activar la suscripción", "detalle": err.Error()})
		}
		if !encontrada {
			return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Suscripción no encontrada"})
		}
		log.Printf("Plan Pro activado por webhook (ref=%s, tx=%s)", tx.Reference, tx.ID)
		return c.JSON(fiber.Map{"mensaje": "Suscripción activada", "referencia": tx.Reference})
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

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(cadena.String()))
	esperado := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(esperado), []byte(strings.ToLower(event.Signature.Checksum)))
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
