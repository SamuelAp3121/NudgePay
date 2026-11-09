package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"invoice-reminder/config"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// PlanProPrecioCentavos es el precio mensual del plan Pro en centavos de COP.
const PlanProPrecioCentavos = 1990000 // $19.900 COP

// PlanProPrecioUSD es el precio de referencia en USD (el que se muestra en la UI).
const PlanProPrecioUSD = 19

// Suscripcion es una suscripción Pro comprada a través de la pasarela.
type Suscripcion struct {
	Referencia string  `json:"referencia"`
	Estado     string  `json:"estado"`
	Monto      float64 `json:"monto"`
	Moneda     string  `json:"moneda"`
	CreadoEn   string  `json:"creado_en"`
	PagadaEn   *string `json:"pagada_en"`
}

// wompiConfig devuelve las llaves de Wompi desde el entorno.
func wompiConfig() (publicKey, integritySecret string, configurado bool) {
	publicKey = strings.TrimSpace(os.Getenv("WOMPI_PUBLIC_KEY"))
	integritySecret = strings.TrimSpace(os.Getenv("WOMPI_INTEGRITY_SECRET"))
	configurado = publicKey != "" && integritySecret != "" &&
		!strings.HasPrefix(publicKey, "pub_test_tu") && !strings.HasPrefix(integritySecret, "prod_integrity_tu")
	return
}

// firmaIntegridad calcula SHA256(referencia + montoEnCentavos + moneda + secreto).
func firmaIntegridad(referencia string, montoCentavos int, moneda, secreto string) string {
	cadena := fmt.Sprintf("%s%d%s%s", referencia, montoCentavos, moneda, secreto)
	suma := sha256.Sum256([]byte(cadena))
	return hex.EncodeToString(suma[:])
}

// ObtenerSuscripcion devuelve el plan actual y el historial de suscripciones.
// GET /api/v1/billing/suscripcion
func ObtenerSuscripcion(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	perfil, err := perfilUsuario(usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cargar el perfil"})
	}

	rows, err := config.DB.Query(
		`SELECT referencia, estado, monto, moneda,
		        to_char(creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        to_char(pagada_en, 'YYYY-MM-DD"T"HH24:MI:SSOF')
		   FROM suscripciones WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 12`,
		usuarioID,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cargar el historial"})
	}
	defer rows.Close()

	historial := []Suscripcion{}
	for rows.Next() {
		var s Suscripcion
		var pagadaEn sql.NullString
		if err := rows.Scan(&s.Referencia, &s.Estado, &s.Monto, &s.Moneda, &s.CreadoEn, &pagadaEn); err != nil {
			continue
		}
		if pagadaEn.Valid {
			s.PagadaEn = &pagadaEn.String
		}
		historial = append(historial, s)
	}

	_, _, configurado := wompiConfig()

	return c.JSON(fiber.Map{
		"usuario":       perfil,
		"precio_usd":    PlanProPrecioUSD,
		"precio_cop":    PlanProPrecioCentavos / 100,
		"pasarela":      "wompi",
		"configurada":   configurado,
		"suscripciones": historial,
		"moneda":        "COP",
	})
}

// CrearCheckout genera los datos firmados para abrir el checkout de Wompi.
// POST /api/v1/billing/checkout  { "plan": "pro" }
func CrearCheckout(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	publicKey, integritySecret, configurado := wompiConfig()
	if !configurado {
		return c.Status(http.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "La pasarela de pago no está configurada. Define WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET en el backend.",
		})
	}

	// ¿Ya es Pro? No se permite doble cobro.
	var plan sql.NullString
	_ = config.DB.QueryRow(`SELECT plan FROM usuarios WHERE id = $1`, usuarioID).Scan(&plan)
	if plan.String == "pro" {
		return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "Ya tienes el plan Pro activo"})
	}

	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar la referencia"})
	}
	// Referencia única con prefijo PRO. El webhook la interpreta para activar el plan.
	referencia := "PRO-" + usuarioID + "-" + hex.EncodeToString(buf)

	var email string
	_ = config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, usuarioID).Scan(&email)

	moneda := "COP"
	centavos := PlanProPrecioCentavos
	firma := firmaIntegridad(referencia, centavos, moneda, integritySecret)

	if _, err := config.DB.Exec(
		`INSERT INTO suscripciones (usuario_id, referencia, plan, estado, monto, moneda)
		 VALUES ($1, $2, 'pro', 'pendiente', $3, $4)`,
		usuarioID, referencia, float64(centavos)/100, moneda,
	); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo crear la orden", "detalle": err.Error()})
	}

	return c.JSON(fiber.Map{
		"referencia":     referencia,
		"monto_centavos": centavos,
		"moneda":         moneda,
		"public_key":     publicKey,
		"signature":      firma,
		"redirect_url":   strings.TrimSpace(os.Getenv("FRONTEND_URL")) + "/billing?pago=ok",
		"email":          email,
	})
}

// ActivarSuscripcion marca la suscripción como pagada y sube al usuario a Pro.
// Se usa desde el webhook (o desde el panel para pruebas con el modo simulación).
func ActivarSuscripcion(referencia, transaccionID string) (bool, error) {
	var usuarioID string
	var estado string
	err := config.DB.QueryRow(
		`SELECT usuario_id, estado FROM suscripciones WHERE referencia = $1`,
		referencia,
	).Scan(&usuarioID, &estado)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if estado == "pagada" {
		return true, nil // idempotente
	}

	if _, err := config.DB.Exec(
		`UPDATE suscripciones SET estado = 'pagada', pagada_en = CURRENT_TIMESTAMP, transaccion = NULLIF($2, '')
		  WHERE referencia = $1`,
		referencia, transaccionID,
	); err != nil {
		return false, err
	}

	// Vigencia: 1 mes desde el pago.
	_, err = config.DB.Exec(
		`UPDATE usuarios SET plan = 'pro', plan_expira_en = CURRENT_TIMESTAMP + INTERVAL '1 month' WHERE id = $1`,
		usuarioID,
	)
	if err != nil {
		return false, err
	}

	return true, nil
}

// SimularPagoPro activa el plan sin pasarela (solo desarrollo / pruebas QA).
// POST /api/v1/billing/simular  { "referencia": "PRO-..." }
func SimularPagoPro(c *fiber.Ctx) error {
	if strings.TrimSpace(os.Getenv("ALLOW_BILLING_SIMULATION")) != "true" {
		return c.Status(http.StatusForbidden).JSON(fiber.Map{"error": "La simulación de pagos está deshabilitada"})
	}

	usuarioID, _ := c.Locals("usuario_id").(string)

	var body struct {
		Referencia string `json:"referencia"`
	}
	_ = c.BodyParser(&body)

	var dueno string
	if err := config.DB.QueryRow(`SELECT usuario_id FROM suscripciones WHERE referencia = $1`, strings.TrimSpace(body.Referencia)).Scan(&dueno); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Suscripción no encontrada"})
	}
	if dueno != usuarioID {
		return c.Status(http.StatusForbidden).JSON(fiber.Map{"error": "Esta suscripción no te pertenece"})
	}

	ok, err := ActivarSuscripcion(body.Referencia, "simulado-"+time.Now().Format("20060102150405"))
	if err != nil || !ok {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo activar el plan"})
	}

	perfil, _ := perfilUsuario(usuarioID)
	return c.JSON(fiber.Map{"mensaje": "Plan Pro activado (simulación)", "usuario": perfil})
}

// CancelarSuscripcion vuelve al plan gratuito al final del periodo.
// POST /api/v1/billing/cancelar
func CancelarSuscripcion(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	res, err := config.DB.Exec(
		`UPDATE usuarios SET plan = 'free', plan_expira_en = NULL WHERE id = $1 AND plan = 'pro'`,
		usuarioID,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cancelar el plan"})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "No tienes un plan Pro activo"})
	}

	perfil, _ := perfilUsuario(usuarioID)
	return c.JSON(fiber.Map{"mensaje": "Suscripción cancelada", "usuario": perfil})
}
