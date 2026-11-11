package handlers

import (
	"database/sql"
	"invoice-reminder/config"
	"invoice-reminder/services"
	"net/http"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// ============================================================================
// WHATSAPP — panel de administración
//
// Permite ver el estado del canal, los envíos (éxitos y fallos) y probar la
// configuración global. Todas las rutas viven bajo /api/v1/admin/whatsapp.
// ============================================================================

// AdminWhatsAppResumen devuelve el estado y las métricas del canal WhatsApp.
// GET /api/v1/admin/whatsapp/resumen
func AdminWhatsAppResumen(c *fiber.Ctx) error {
	global := services.WhatsAppConfigDesdeEntorno()

	resumen := fiber.Map{
		"configurado":   global.Configurado(),
		"phone_number_id": global.PhoneNumberID,
		"api_version":   global.APIVersion,
		"template_name": global.TemplateName,
		"template_lang": global.TemplateLang,
	}

	var enviadosMes, fallidosMes, totalEnviados, totalFallidos int
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados
		  WHERE canal = 'whatsapp' AND estado = 'enviado'
		    AND date_trunc('month', enviado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
	).Scan(&enviadosMes)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados
		  WHERE canal = 'whatsapp' AND estado = 'fallido'
		    AND date_trunc('month', enviado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
	).Scan(&fallidosMes)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados WHERE canal = 'whatsapp' AND estado = 'enviado'`,
	).Scan(&totalEnviados)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados WHERE canal = 'whatsapp' AND estado = 'fallido'`,
	).Scan(&totalFallidos)

	var usuariosConWhatsApp, facturasConWhatsApp int
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM usuarios WHERE COALESCE(whatsapp_activo, FALSE) = TRUE`,
	).Scan(&usuariosConWhatsApp)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM facturas WHERE canal_recordatorio IN ('whatsapp', 'ambos')`,
	).Scan(&facturasConWhatsApp)

	resumen["envios"] = fiber.Map{
		"mes_enviados": enviadosMes,
		"mes_fallidos": fallidosMes,
		"total_enviados": totalEnviados,
		"total_fallidos": totalFallidos,
	}
	resumen["usuarios_activos"] = usuariosConWhatsApp
	resumen["facturas_whatsapp"] = facturasConWhatsApp

	// Últimos envíos para la tabla del panel.
	envios := []fiber.Map{}
	rows, err := config.DB.Query(
		`SELECT r.id, COALESCE(r.email_destino, ''), COALESCE(r.canal, 'email'),
		        COALESCE(r.estado, 'enviado'), COALESCE(r.error, ''),
		        to_char(r.enviado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        COALESCE(u.email, ''), COALESCE(r.factura_id::text, '')
		   FROM recordatorios_enviados r
		   LEFT JOIN usuarios u ON u.id = r.usuario_id
		  WHERE r.canal = 'whatsapp'
		  ORDER BY r.enviado_en DESC LIMIT 10`,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, destino, canal, estado, mensajeError, fecha, emailDueno, facturaID string
			if err := rows.Scan(&id, &destino, &canal, &estado, &mensajeError, &fecha, &emailDueno, &facturaID); err != nil {
				continue
			}
			envios = append(envios, fiber.Map{
				"id": id, "destino": destino, "canal": canal, "estado": estado,
				"error": mensajeError, "enviado_en": fecha,
				"usuario_email": emailDueno, "factura_id": facturaID,
			})
		}
	}
	resumen["ultimos_envios"] = envios

	return c.JSON(resumen)
}

// AdminListarEnviosWhatsApp lista el histórico de envíos por WhatsApp.
// GET /api/v1/admin/whatsapp/envios?q=&estado=&page=&limit=
func AdminListarEnviosWhatsApp(c *fiber.Ctx) error {
	page, limit, offset := parsePaginacion(c)
	q := strings.TrimSpace(c.Query("q"))
	estado := strings.TrimSpace(c.Query("estado"))

	where := []string{"r.canal = 'whatsapp'"}
	args := []any{}
	n := 1

	if q != "" {
		where = append(where, "(COALESCE(r.email_destino, '') ILIKE $"+strconv.Itoa(n)+" OR u.email ILIKE $"+strconv.Itoa(n)+")")
		args = append(args, "%"+q+"%")
		n++
	}
	if estado == "enviado" || estado == "fallido" {
		where = append(where, "COALESCE(r.estado, 'enviado') = $"+strconv.Itoa(n))
		args = append(args, estado)
		n++
	}
	condicion := strings.Join(where, " AND ")

	var total int
	if err := config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados r
		   LEFT JOIN usuarios u ON u.id = r.usuario_id
		  WHERE `+condicion, args...,
	).Scan(&total); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron contar los envíos", "detalle": err.Error()})
	}

	rows, err := config.DB.Query(
		`SELECT r.id, COALESCE(r.email_destino, ''), COALESCE(r.estado, 'enviado'),
		        COALESCE(r.error, ''), to_char(r.enviado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        COALESCE(u.id::text, ''), COALESCE(u.email, ''), COALESCE(r.factura_id::text, '')
		   FROM recordatorios_enviados r
		   LEFT JOIN usuarios u ON u.id = r.usuario_id
		  WHERE `+condicion+`
		  ORDER BY r.enviado_en DESC
		  LIMIT $`+strconv.Itoa(n)+` OFFSET $`+strconv.Itoa(n+1),
		append(args, limit, offset)...,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener los envíos", "detalle": err.Error()})
	}
	defer rows.Close()

	envios := []fiber.Map{}
	for rows.Next() {
		var id, destino, estadoEnvio, mensajeError, fecha, usuarioID, emailDueno, facturaID string
		if err := rows.Scan(&id, &destino, &estadoEnvio, &mensajeError, &fecha, &usuarioID, &emailDueno, &facturaID); err != nil {
			continue
		}
		envios = append(envios, fiber.Map{
			"id": id, "destino": destino, "estado": estadoEnvio, "error": mensajeError,
			"enviado_en": fecha, "usuario_id": usuarioID, "usuario_email": emailDueno,
			"factura_id": facturaID,
		})
	}

	return c.JSON(fiber.Map{
		"envios": envios, "total": total, "page": page, "limit": limit,
		"paginas": (total + limit - 1) / limit,
	})
}

// AdminEnviarWhatsAppPrueba envía un mensaje de prueba con la configuración global.
// POST /api/v1/admin/whatsapp/test  { "telefono": "573001234567" }
func AdminEnviarWhatsAppPrueba(c *fiber.Ctx) error {
	var body struct {
		Telefono string `json:"telefono"`
	}
	_ = c.BodyParser(&body)

	telefono := strings.TrimSpace(body.Telefono)
	if telefono == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Indica un número de WhatsApp para la prueba"})
	}

	cfg := services.WhatsAppConfigDesdeEntorno()
	if err := services.EnviarWhatsAppPrueba(cfg, telefono); err != nil {
		return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "No se pudo enviar el mensaje de prueba", "detalle": err.Error()})
	}

	registrarAuditoria(c, "whatsapp_prueba", "sistema", "", fiber.Map{"telefono": telefono})
	return c.JSON(fiber.Map{"mensaje": "Mensaje de prueba enviado", "telefono": telefono})
}

// AdminActualizarWhatsAppUsuario activa o desactiva el WhatsApp de una cuenta
// y permite fijar su teléfono (soporte).
// PATCH /api/v1/admin/usuarios/:id/whatsapp  { "activo": true, "telefono": "..." }
func AdminActualizarWhatsAppUsuario(c *fiber.Ctx) error {
	id := c.Params("id")

	var body struct {
		Activo   *bool  `json:"activo"`
		Telefono string `json:"telefono"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	telefono := strings.TrimSpace(body.Telefono)
	if telefono != "" && !services.TelefonoValido(telefono) {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Teléfono inválido. Usa el formato internacional sin '+', por ejemplo 573001234567."})
	}

	var email string
	if err := config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, id).Scan(&email); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}

	activo := false
	if body.Activo != nil {
		activo = *body.Activo
	}

	if _, err := config.DB.Exec(
		`UPDATE usuarios SET whatsapp_activo = $2, whatsapp_telefono = NULLIF($3, '') WHERE id = $1`,
		id, activo, telefono,
	); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar WhatsApp", "detalle": err.Error()})
	}

	registrarAuditoria(c, "whatsapp_usuario", "usuario", id, fiber.Map{
		"email": email, "activo": activo, "telefono": telefono,
	})
	return c.JSON(fiber.Map{"mensaje": "WhatsApp actualizado", "id": id, "activo": activo})
}

// whatsappDelUsuario devuelve el estado de WhatsApp de una cuenta (uso interno).
func whatsappDelUsuario(usuarioID string) (activo bool, telefono string) {
	var tel sql.NullString
	_ = config.DB.QueryRow(
		`SELECT COALESCE(whatsapp_activo, FALSE), COALESCE(whatsapp_telefono, '') FROM usuarios WHERE id = $1`,
		usuarioID,
	).Scan(&activo, &tel)
	return activo, tel.String
}
