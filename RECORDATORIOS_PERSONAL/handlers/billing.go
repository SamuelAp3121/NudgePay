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

// planesPublicos es el catálogo que ve la UI: límites y precios por plan.
func planesPublicos(precioProCOP int, precioBusinessCOP int) []fiber.Map {
	return []fiber.Map{
		{
			"id":                      PlanFree,
			"nombre":                  "Gratuito",
			"precio_cop":              0,
			"recordatorios_mes":       LimiteRecordatoriosFree,
			"facturas_pendientes":     LimiteFacturasFree,
			"max_cuotas":              MaxCuotasFree,
			"whatsapp":                false,
			"plantilla":               false,
			"reportes":                false,
			"recordatorios_automaticos": "1 día antes",
		},
		{
			"id":                      PlanPro,
			"nombre":                  "Pro",
			"precio_cop":              precioProCOP,
			"recordatorios_mes":       -1,
			"facturas_pendientes":     -1,
			"max_cuotas":              MaxCuotasPro,
			"whatsapp":                true,
			"plantilla":               true,
			"reportes":                true,
			"recordatorios_automaticos": "7, 3 y 1 día antes",
		},
		{
			"id":                      PlanBusiness,
			"nombre":                  "Business",
			"precio_cop":              precioBusinessCOP,
			"recordatorios_mes":       -1,
			"facturas_pendientes":     -1,
			"max_cuotas":              MaxCuotasBusiness,
			"whatsapp":                true,
			"plantilla":               true,
			"reportes":                true,
			"reportes_avanzados":      true,
			"recordatorios_automaticos": "7 días antes + seguimiento",
		},
	}
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
		"precio_business_cop": PlanBusinessPrecioCentavos / 100,
		"precio_business_usd": PlanBusinessPrecioUSD,
		"pasarela":      "wompi",
		"configurada":   configurado,
		"suscripciones": historial,
		"moneda":        "COP",
		"planes":        planesPublicos(PlanProPrecioCentavos/100, PlanBusinessPrecioCentavos/100),
	})
}

// precioPlanCentavos devuelve el precio en centavos del plan de pago.
func precioPlanCentavos(plan string) (int, bool) {
	switch NormalizarPlan(plan) {
	case PlanPro:
		return PlanProPrecioCentavos, true
	case PlanBusiness:
		return PlanBusinessPrecioCentavos, true
	default:
		return 0, false
	}
}

// prefijoPlan es el prefijo de referencia de la pasarela (PRO- / BUS-).
func prefijoPlan(plan string) string {
	if NormalizarPlan(plan) == PlanBusiness {
		return "BUS-"
	}
	return "PRO-"
}

// CrearCheckout genera los datos firmados para abrir el checkout de Wompi.
// POST /api/v1/billing/checkout  { "plan": "pro" | "business" }
func CrearCheckout(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var body struct {
		Plan string `json:"plan"`
	}
	_ = c.BodyParser(&body)
	planPedido := NormalizarPlan(body.Plan)
	if planPedido == PlanFree {
		// Por defecto (o plan inválido) se vende Pro para no romper clientes viejos.
		if strings.TrimSpace(body.Plan) != "" {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El plan debe ser 'pro' o 'business'"})
		}
		planPedido = PlanPro
	}

	publicKey, integritySecret, configurado := wompiConfig()
	if !configurado {
		return c.Status(http.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "La pasarela de pago no está configurada. Define WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET en el backend.",
		})
	}

	centavos, ok := precioPlanCentavos(planPedido)
	if !ok {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Plan no válido"})
	}

	// Si ya tiene ese plan (o uno superior), no se permite doble cobro.
	var planActual sql.NullString
	_ = config.DB.QueryRow(`SELECT plan FROM usuarios WHERE id = $1`, usuarioID).Scan(&planActual)
	actual := NormalizarPlan(planActual.String)
	if actual == planPedido {
		return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "Ya tienes el plan " + NombrePlan(actual) + " activo"})
	}
	if actual == PlanBusiness && planPedido == PlanPro {
		return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "Ya tienes el plan Business activo, que incluye todo lo de Pro"})
	}

	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar la referencia"})
	}
	// Referencia única con prefijo PRO-/BUS-. El webhook la interpreta para activar el plan.
	referencia := prefijoPlan(planPedido) + usuarioID + "-" + hex.EncodeToString(buf)

	var email string
	_ = config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, usuarioID).Scan(&email)

	moneda := "COP"
	firma := firmaIntegridad(referencia, centavos, moneda, integritySecret)

	if _, err := config.DB.Exec(
		`INSERT INTO suscripciones (usuario_id, referencia, plan, estado, monto, moneda)
		 VALUES ($1, $2, $3, 'pendiente', $4, $5)`,
		usuarioID, referencia, planPedido, float64(centavos)/100, moneda,
	); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo crear la orden", "detalle": err.Error()})
	}

	return c.JSON(fiber.Map{
		"referencia":     referencia,
		"plan":           planPedido,
		"monto_centavos": centavos,
		"moneda":         moneda,
		"public_key":     publicKey,
		"signature":      firma,
		"redirect_url":   strings.TrimSpace(os.Getenv("FRONTEND_URL")) + "/billing?pago=ok",
		"email":          email,
	})
}

// ActivarSuscripcion marca la suscripción como pagada y sube al usuario al
// plan comprado (pro o business). Se usa desde el webhook (o desde el panel
// para pruebas con el modo simulación).
func ActivarSuscripcion(referencia, transaccionID string) (bool, error) {
	var usuarioID string
	var estado string
	var planSuscripcion sql.NullString
	err := config.DB.QueryRow(
		`SELECT usuario_id, estado, plan FROM suscripciones WHERE referencia = $1`,
		referencia,
	).Scan(&usuarioID, &estado, &planSuscripcion)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if estado == "pagada" {
		return true, nil // idempotente
	}

	planDestino := NormalizarPlan(planSuscripcion.String)
	if planDestino == PlanFree {
		// Suscripciones legadas sin plan: eran Pro.
		planDestino = PlanPro
	}

	if _, err := config.DB.Exec(
		`UPDATE suscripciones SET estado = 'pagada', pagada_en = CURRENT_TIMESTAMP, transaccion = NULLIF($2, ''), plan = $3
		  WHERE referencia = $1`,
		referencia, transaccionID, planDestino,
	); err != nil {
		return false, err
	}

	// Vigencia: 1 mes desde el pago.
	_, err = config.DB.Exec(
		`UPDATE usuarios SET plan = $2, plan_expira_en = CURRENT_TIMESTAMP + INTERVAL '1 month' WHERE id = $1`,
		usuarioID, planDestino,
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
	planActivado, _ := perfil["plan"].(string)
	return c.JSON(fiber.Map{"mensaje": "Plan " + NombrePlan(planActivado) + " activado (simulación)", "usuario": perfil})
}

// CancelarSuscripcion vuelve al plan gratuito al final del periodo.
// POST /api/v1/billing/cancelar
func CancelarSuscripcion(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	res, err := config.DB.Exec(
		`UPDATE usuarios SET plan = 'free', plan_expira_en = NULL WHERE id = $1 AND plan IN ('pro', 'business')`,
		usuarioID,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cancelar el plan"})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "No tienes un plan de pago activo"})
	}

	perfil, _ := perfilUsuario(usuarioID)
	return c.JSON(fiber.Map{"mensaje": "Suscripción cancelada", "usuario": perfil})
}
