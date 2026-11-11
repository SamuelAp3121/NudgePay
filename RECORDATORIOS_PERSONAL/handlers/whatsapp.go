package handlers

import (
	"database/sql"
	"errors"
	"invoice-reminder/config"
	"invoice-reminder/services"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ============================================================================
// WHATSAPP — configuración del usuario y envío de recordatorios
//
// Cada usuario puede conectar su propia cuenta de WhatsApp Business (Meta
// Cloud API). Si no la configura, se usan las credenciales globales del .env.
// ============================================================================

// CanalesRecordatorio son los valores válidos de facturas.canal_recordatorio.
var CanalesRecordatorio = map[string]bool{
	"email":    true,
	"whatsapp": true,
	"ambos":    true,
}

// normalizarCanal valida el canal de recordatorio de una factura.
func normalizarCanal(canal string) (string, bool) {
	valor := strings.ToLower(strings.TrimSpace(canal))
	if valor == "" {
		return "email", true
	}
	if !CanalesRecordatorio[valor] {
		return "", false
	}
	return valor, true
}

// configWhatsAppDelUsuario devuelve las credenciales del usuario y, si no las
// tiene completas, cae a las globales del entorno.
func configWhatsAppDelUsuario(usuarioID string) services.WhatsAppConfig {
	global := services.WhatsAppConfigDesdeEntorno()

	var token, phoneID, plantilla, idioma sql.NullString
	var activo bool
	err := config.DB.QueryRow(
		`SELECT COALESCE(whatsapp_token, ''), COALESCE(whatsapp_phone_number_id, ''),
		        COALESCE(whatsapp_template_name, ''), COALESCE(whatsapp_template_lang, ''),
		        COALESCE(whatsapp_activo, FALSE)
		   FROM usuarios WHERE id = $1`,
		usuarioID,
	).Scan(&token, &phoneID, &plantilla, &idioma, &activo)
	if err != nil {
		return global
	}

	cfg := global
	if strings.TrimSpace(token.String) != "" {
		cfg.Token = strings.TrimSpace(token.String)
	}
	if strings.TrimSpace(phoneID.String) != "" {
		cfg.PhoneNumberID = strings.TrimSpace(phoneID.String)
	}
	if strings.TrimSpace(plantilla.String) != "" {
		cfg.TemplateName = strings.TrimSpace(plantilla.String)
	}
	if strings.TrimSpace(idioma.String) != "" {
		cfg.TemplateLang = strings.TrimSpace(idioma.String)
	}
	return cfg
}

// ObtenerConfigWhatsApp devuelve la configuración de WhatsApp del usuario.
// GET /api/v1/whatsapp/config
func ObtenerConfigWhatsApp(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var telefono, token, phoneID, plantilla, idioma sql.NullString
	var activo bool
	err := config.DB.QueryRow(
		`SELECT COALESCE(whatsapp_telefono, ''), COALESCE(whatsapp_token, ''),
		        COALESCE(whatsapp_phone_number_id, ''), COALESCE(whatsapp_template_name, ''),
		        COALESCE(whatsapp_template_lang, ''), COALESCE(whatsapp_activo, FALSE)
		   FROM usuarios WHERE id = $1`,
		usuarioID,
	).Scan(&telefono, &token, &phoneID, &plantilla, &idioma, &activo)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cargar la configuración", "detalle": err.Error()})
	}

	global := services.WhatsAppConfigDesdeEntorno()

	return c.JSON(fiber.Map{
		"telefono":        telefono.String,
		"phone_number_id": phoneID.String,
		"template_name":   plantilla.String,
		"template_lang":   idioma.String,
		"activo":          activo,
		// El token nunca se devuelve completo: solo si existe.
		"token_configurado":  strings.TrimSpace(token.String) != "",
		"usando_global":      strings.TrimSpace(token.String) == "" || strings.TrimSpace(phoneID.String) == "",
		"global_configurado": global.Configurado(),
		"global_template":    global.TemplateName,
		"global_lang":        global.TemplateLang,
	})
}

// ActualizarConfigWhatsApp guarda las credenciales de WhatsApp del usuario.
// PUT /api/v1/whatsapp/config
func ActualizarConfigWhatsApp(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var body struct {
		Telefono      string `json:"telefono"`
		Token         string `json:"token"`
		PhoneNumberID string `json:"phone_number_id"`
		TemplateName  string `json:"template_name"`
		TemplateLang  string `json:"template_lang"`
		Activo        *bool  `json:"activo"`
		BorrarToken   bool   `json:"borrar_token"`
	}

	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	telefono := strings.TrimSpace(body.Telefono)
	if telefono != "" && !services.TelefonoValido(telefono) {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{
			"error": "Teléfono inválido. Usa el formato internacional sin '+', por ejemplo 573001234567.",
		})
	}

	activo := false
	if body.Activo != nil {
		activo = *body.Activo
	}

	// El token solo se sobrescribe si llega uno nuevo (o si se pide borrarlo).
	token := strings.TrimSpace(body.Token)
	if body.BorrarToken {
		token = ""
	}

	query := `UPDATE usuarios SET
	            whatsapp_telefono = NULLIF($2, ''),
	            whatsapp_phone_number_id = NULLIF($3, ''),
	            whatsapp_template_name = NULLIF($4, ''),
	            whatsapp_template_lang = NULLIF($5, ''),
	            whatsapp_activo = $6
	          WHERE id = $1`
	args := []any{usuarioID, telefono, strings.TrimSpace(body.PhoneNumberID),
		strings.TrimSpace(body.TemplateName), strings.TrimSpace(body.TemplateLang), activo}

	if token != "" || body.BorrarToken {
		query = `UPDATE usuarios SET
		            whatsapp_telefono = NULLIF($2, ''),
		            whatsapp_phone_number_id = NULLIF($3, ''),
		            whatsapp_template_name = NULLIF($4, ''),
		            whatsapp_template_lang = NULLIF($5, ''),
		            whatsapp_activo = $6,
		            whatsapp_token = NULLIF($7, '')
		          WHERE id = $1`
		args = append(args, token)
	}

	res, err := config.DB.Exec(query, args...)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo guardar la configuración", "detalle": err.Error()})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}

	return c.JSON(fiber.Map{"mensaje": "Configuración de WhatsApp guardada", "activo": activo})
}

// EnviarWhatsAppPrueba envía un mensaje de prueba al número indicado.
// POST /api/v1/whatsapp/test  { "telefono": "573001234567" }
func EnviarWhatsAppPrueba(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var body struct {
		Telefono string `json:"telefono"`
	}
	_ = c.BodyParser(&body)

	telefono := strings.TrimSpace(body.Telefono)
	if telefono == "" {
		// Si no se indica, se usa el teléfono guardado en la cuenta.
		_ = config.DB.QueryRow(`SELECT COALESCE(whatsapp_telefono, '') FROM usuarios WHERE id = $1`, usuarioID).Scan(&telefono)
	}
	if telefono == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Indica un número de WhatsApp para la prueba"})
	}

	cfg := configWhatsAppDelUsuario(usuarioID)
	if err := services.EnviarWhatsAppPrueba(cfg, telefono); err != nil {
		if errors.Is(err, services.ErrWhatsAppNoConfigurado) {
			return c.Status(http.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "No se pudo enviar el mensaje de prueba", "detalle": err.Error()})
	}

	return c.JSON(fiber.Map{"mensaje": "Mensaje de prueba enviado por WhatsApp", "telefono": telefono})
}

// EnviarRecordatorioWhatsAppFactura envía ahora el recordatorio de la próxima
// cuota pendiente de una factura por WhatsApp.
// POST /api/v1/facturas/:id/recordatorio-whatsapp
func EnviarRecordatorioWhatsAppFactura(c *fiber.Ctx) error {
	id := c.Params("id")
	usuarioID, _ := c.Locals("usuario_id").(string)
	plan, _ := c.Locals("plan").(string)

	var nombre, email, telefono, concepto, estado, moneda, tokenPublico string
	var montoTotal float64
	var cuotas int
	err := config.DB.QueryRow(
		`SELECT cliente_nombre, cliente_email, COALESCE(cliente_telefono, ''), COALESCE(concepto, ''),
		        estado, monto, COALESCE(moneda, 'COP'), COALESCE(cuotas, 1), COALESCE(token_publico, '')
		   FROM facturas WHERE id = $1 AND usuario_id = $2`,
		id, usuarioID,
	).Scan(&nombre, &email, &telefono, &concepto, &estado, &montoTotal, &moneda, &cuotas, &tokenPublico)
	if err == sql.ErrNoRows {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando la factura", "detalle": err.Error()})
	}

	if estado == "pagada" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "La factura ya está pagada"})
	}
	if strings.TrimSpace(telefono) == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Esta factura no tiene teléfono de WhatsApp del cliente"})
	}

	// Próxima cuota pendiente.
	var cuotaID string
	var numero int
	var montoCuota float64
	var vencimiento string
	err = config.DB.QueryRow(
		`SELECT id, numero, monto, fecha_vencimiento FROM cuotas
		  WHERE factura_id = $1 AND estado <> 'pagada'
		  ORDER BY fecha_vencimiento ASC, numero ASC LIMIT 1`,
		id,
	).Scan(&cuotaID, &numero, &montoCuota, &vencimiento)
	if err == sql.ErrNoRows {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "La factura no tiene cuotas pendientes"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando las cuotas", "detalle": err.Error()})
	}

	// Límite del plan gratuito (mismo cupo que el email).
	if plan != "pro" {
		if usados := RecordatoriosUsadosMes(usuarioID); usados >= LimiteRecordatoriosFree {
			return c.Status(http.StatusPaymentRequired).JSON(fiber.Map{
				"error": "Límite del plan gratuito alcanzado (20 recordatorios/mes). Actualiza a Pro para continuar.",
			})
		}
	}

	cfg := configWhatsAppDelUsuario(usuarioID)
	datos := services.DatosWhatsApp{
		ClienteNombre: nombre,
		Monto:         montoCuota,
		Moneda:        moneda,
		Fecha:         vencimiento,
		CuotaNumero:   numero,
		CuotasTotal:   cuotas,
		MontoTotal:    montoTotal,
		Concepto:      concepto,
		EnlacePago:    EnlacePagoPublico(tokenPublico),
	}

	if err := services.EnviarRecordatorioWhatsApp(cfg, telefono, datos); err != nil {
		_ = RegistrarRecordatorioCanal(usuarioID, id, cuotaID, telefono, "whatsapp", "fallido", err.Error())
		if errors.Is(err, services.ErrWhatsAppNoConfigurado) {
			return c.Status(http.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "No se pudo enviar el WhatsApp", "detalle": err.Error()})
	}

	if err := RegistrarRecordatorioCanal(usuarioID, id, cuotaID, telefono, "whatsapp", "enviado", ""); err != nil {
		log.Printf("⚠️  No se pudo registrar el recordatorio de WhatsApp (usuario %s): %v", usuarioID, err)
	}

	_, _ = config.DB.Exec(`UPDATE cuotas SET notificado = true WHERE factura_id = $1 AND numero = $2`, id, numero)
	_, _ = config.DB.Exec(`UPDATE facturas SET notificado = true WHERE id = $1`, id)

	return c.JSON(fiber.Map{
		"mensaje":  "Recordatorio enviado por WhatsApp",
		"id":       id,
		"telefono": telefono,
		"cuota":    numero,
	})
}

// EnlacePagoPublico arma la URL del portal de pago del cliente.
func EnlacePagoPublico(token string) string {
	if strings.TrimSpace(token) == "" {
		return ""
	}
	base := strings.TrimSpace(os.Getenv("FRONTEND_URL"))
	if base == "" {
		return ""
	}
	return strings.TrimRight(base, "/") + "/pay/" + token
}
