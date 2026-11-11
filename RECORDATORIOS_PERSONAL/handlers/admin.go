package handlers

import (
	"database/sql"
	"encoding/json"
	"invoice-reminder/config"
	"invoice-reminder/middleware"
	"invoice-reminder/services"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ============================================================================
// PANEL DE ADMINISTRACIÓN (soporte)
//
// Todas las rutas de este archivo viven bajo /api/v1/admin y están protegidas
// por AuthMiddleware + AdminMiddleware. Ninguna de ellas modifica el
// comportamiento de los endpoints normales del usuario.
// ============================================================================

// AdminCookieName guarda el token de sesión del admin mientras impersona a un
// usuario, para poder restaurarlo al salir.
const AdminCookieName = "ir_admin_session"

// registrarAuditoria guarda en admin_auditoria cada acción sensible del admin.
// Nunca interrumpe la operación principal si falla.
func registrarAuditoria(c *fiber.Ctx, accion, entidad, entidadID string, detalle fiber.Map) {
	adminID, _ := c.Locals("usuario_id").(string)
	adminEmail, _ := c.Locals("usuario_email").(string)
	var payload []byte
	if detalle != nil {
		payload, _ = json.Marshal(detalle)
	}
	_, err := config.DB.Exec(
		`INSERT INTO admin_auditoria (admin_id, admin_email, accion, entidad, entidad_id, detalle)
		 VALUES (NULLIF($1, '')::uuid, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6)`,
		adminID, adminEmail, accion, entidad, entidadID, payload,
	)
	if err != nil {
		log.Printf("AVISO: no se pudo registrar la auditoría (%s): %v", accion, err)
	}
}

// parsePaginacion lee ?page y ?limit con valores por defecto seguros.
func parsePaginacion(c *fiber.Ctx) (page, limit, offset int) {
	page, _ = strconv.Atoi(c.Query("page", "1"))
	limit, _ = strconv.Atoi(c.Query("limit", "25"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 25
	}
	return page, limit, (page - 1) * limit
}

// ============================================================================
// 1. MÉTRICAS GLOBALES
// ============================================================================

// AdminResumen devuelve las métricas globales del negocio para el panel.
// GET /api/v1/admin/resumen
func AdminResumen(c *fiber.Ctx) error {
	resumen := fiber.Map{}

	var usuarios, usuariosPro, usuariosSuspendidos, usuariosNuevosMes int
	_ = config.DB.QueryRow(`SELECT COUNT(*) FROM usuarios`).Scan(&usuarios)
	_ = config.DB.QueryRow(`SELECT COUNT(*) FROM usuarios WHERE plan = 'pro'`).Scan(&usuariosPro)
	_ = config.DB.QueryRow(`SELECT COUNT(*) FROM usuarios WHERE suspendido = TRUE`).Scan(&usuariosSuspendidos)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM usuarios WHERE date_trunc('month', creado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
	).Scan(&usuariosNuevosMes)

	var facturas, facturasPendientes int
	var montoPendiente, montoCobrado float64
	_ = config.DB.QueryRow(`SELECT COUNT(*) FROM facturas`).Scan(&facturas)
	_ = config.DB.QueryRow(`SELECT COUNT(*) FROM facturas WHERE estado <> 'pagada'`).Scan(&facturasPendientes)
	_ = config.DB.QueryRow(
		`SELECT COALESCE(SUM(monto), 0) FROM facturas WHERE estado <> 'pagada'`,
	).Scan(&montoPendiente)
	_ = config.DB.QueryRow(
		`SELECT COALESCE(SUM(monto), 0) FROM cuotas WHERE estado = 'pagada'`,
	).Scan(&montoCobrado)

	var recordatoriosMes int
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados
		  WHERE date_trunc('month', enviado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
	).Scan(&recordatoriosMes)

	var suscripcionesPagadas, suscripcionesPendientes int
	var ingresosSuscripciones float64
	_ = config.DB.QueryRow(`SELECT COUNT(*) FROM suscripciones WHERE estado = 'pagada'`).Scan(&suscripcionesPagadas)
	_ = config.DB.QueryRow(`SELECT COUNT(*) FROM suscripciones WHERE estado = 'pendiente'`).Scan(&suscripcionesPendientes)
	_ = config.DB.QueryRow(
		`SELECT COALESCE(SUM(monto), 0) FROM suscripciones WHERE estado = 'pagada'`,
	).Scan(&ingresosSuscripciones)

	var pagosAprobados int
	var montoPagos float64
	_ = config.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM pagos WHERE estado = 'APPROVED'`,
	).Scan(&pagosAprobados, &montoPagos)

	resumen["usuarios"] = fiber.Map{
		"total":       usuarios,
		"pro":         usuariosPro,
		"free":        usuarios - usuariosPro,
		"suspendidos": usuariosSuspendidos,
		"nuevos_mes":  usuariosNuevosMes,
	}
	resumen["facturas"] = fiber.Map{
		"total":           facturas,
		"pendientes":      facturasPendientes,
		"monto_pendiente": redondear2(montoPendiente),
		"monto_cobrado":   redondear2(montoCobrado),
	}
	resumen["recordatorios_mes"] = recordatoriosMes
	resumen["suscripciones"] = fiber.Map{
		"pagadas":    suscripcionesPagadas,
		"pendientes": suscripcionesPendientes,
		"ingresos":   redondear2(ingresosSuscripciones),
		"precio_cop": PlanProPrecioCentavos / 100,
		"precio_usd": PlanProPrecioUSD,
	}
	resumen["pagos"] = fiber.Map{
		"aprobados": pagosAprobados,
		"monto":     redondear2(montoPagos),
	}

	// Recordatorios por canal (email vs WhatsApp) del mes en curso.
	var recordatoriosEmail, recordatoriosWhatsApp, whatsappFallidos int
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados
		  WHERE COALESCE(canal, 'email') = 'email'
		    AND date_trunc('month', enviado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
	).Scan(&recordatoriosEmail)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados
		  WHERE canal = 'whatsapp' AND COALESCE(estado, 'enviado') = 'enviado'
		    AND date_trunc('month', enviado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
	).Scan(&recordatoriosWhatsApp)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados
		  WHERE canal = 'whatsapp' AND estado = 'fallido'
		    AND date_trunc('month', enviado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
	).Scan(&whatsappFallidos)

	resumen["canales"] = fiber.Map{
		"email_mes":    recordatoriosEmail,
		"whatsapp_mes": recordatoriosWhatsApp,
		"whatsapp_fallidos_mes": whatsappFallidos,
		"whatsapp_configurado":  services.WhatsAppConfigurado(),
	}

	// Últimos usuarios registrados (para el panel de inicio).
	recientes := []fiber.Map{}
	rows, err := config.DB.Query(
		`SELECT id, email, COALESCE(plan, 'free'), COALESCE(rol, 'usuario'), suspendido,
		        to_char(creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF')
		   FROM usuarios ORDER BY creado_en DESC LIMIT 5`,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, email, plan, rol, creado string
			var suspendido bool
			if err := rows.Scan(&id, &email, &plan, &rol, &suspendido, &creado); err != nil {
				continue
			}
			recientes = append(recientes, fiber.Map{
				"id": id, "email": email, "plan": plan, "rol": rol,
				"suspendido": suspendido, "creado_en": creado,
			})
		}
	}
	resumen["usuarios_recientes"] = recientes

	return c.JSON(resumen)
}

// ============================================================================
// 2. USUARIOS
// ============================================================================

// AdminListarUsuarios lista todas las cuentas con búsqueda y filtros.
// GET /api/v1/admin/usuarios?q=&plan=&rol=&suspendido=&page=&limit=
func AdminListarUsuarios(c *fiber.Ctx) error {
	page, limit, offset := parsePaginacion(c)
	q := strings.TrimSpace(c.Query("q"))
	plan := strings.TrimSpace(c.Query("plan"))
	rol := strings.TrimSpace(c.Query("rol"))
	suspendido := strings.TrimSpace(c.Query("suspendido"))

	where := []string{"1 = 1"}
	args := []any{}
	n := 1

	if q != "" {
		where = append(where, "(u.email ILIKE $"+strconv.Itoa(n)+" OR u.id::text = $"+strconv.Itoa(n+1)+")")
		args = append(args, "%"+q+"%", q)
		n += 2
	}
	if plan == "free" || plan == "pro" {
		where = append(where, "COALESCE(u.plan, 'free') = $"+strconv.Itoa(n))
		args = append(args, plan)
		n++
	}
	if rol == "admin" || rol == "usuario" {
		where = append(where, "COALESCE(u.rol, 'usuario') = $"+strconv.Itoa(n))
		args = append(args, rol)
		n++
	}
	if suspendido == "true" || suspendido == "false" {
		where = append(where, "u.suspendido = $"+strconv.Itoa(n))
		args = append(args, suspendido == "true")
		n++
	}

	condicion := strings.Join(where, " AND ")

	var total int
	if err := config.DB.QueryRow(`SELECT COUNT(*) FROM usuarios u WHERE `+condicion, args...).Scan(&total); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron contar los usuarios", "detalle": err.Error()})
	}

	query := `SELECT u.id, u.email, COALESCE(u.plan, 'free'), COALESCE(u.rol, 'usuario'),
	                 u.suspendido, COALESCE(u.suspendido_motivo, ''),
	                 to_char(u.creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
	                 to_char(u.plan_expira_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
	                 to_char(u.ultimo_acceso, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
	                 (SELECT COUNT(*) FROM facturas f WHERE f.usuario_id = u.id),
	                 (SELECT COUNT(*) FROM facturas f WHERE f.usuario_id = u.id AND f.estado <> 'pagada'),
	                 (SELECT COUNT(*) FROM recordatorios_enviados r
	                   WHERE r.usuario_id = u.id
	                     AND date_trunc('month', r.enviado_en) = date_trunc('month', CURRENT_TIMESTAMP))
	            FROM usuarios u
	           WHERE ` + condicion + `
	           ORDER BY u.creado_en DESC
	           LIMIT $` + strconv.Itoa(n) + ` OFFSET $` + strconv.Itoa(n+1)
	args = append(args, limit, offset)

	rows, err := config.DB.Query(query, args...)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener los usuarios", "detalle": err.Error()})
	}
	defer rows.Close()

	usuarios := []fiber.Map{}
	for rows.Next() {
		var id, email, planActual, rolActual, creado, motivo string
		var expira, ultimoAcceso sql.NullString
		var suspendido bool
		var facturas, pendientes, recordatorios int
		if err := rows.Scan(&id, &email, &planActual, &rolActual, &suspendido, &motivo,
			&creado, &expira, &ultimoAcceso, &facturas, &pendientes, &recordatorios); err != nil {
			continue
		}
		usuarios = append(usuarios, fiber.Map{
			"id": id, "email": email, "plan": planActual, "rol": rolActual,
			"suspendido": suspendido, "suspendido_motivo": motivo,
			"creado_en": creado, "plan_expira_en": expira.String, "ultimo_acceso": ultimoAcceso.String,
			"facturas": facturas, "facturas_pendientes": pendientes,
			"recordatorios_mes": recordatorios,
		})
	}

	return c.JSON(fiber.Map{
		"usuarios": usuarios,
		"total":    total,
		"page":     page,
		"limit":    limit,
		"paginas":  (total + limit - 1) / limit,
	})
}

// AdminDetalleUsuario devuelve la ficha completa de una cuenta para soporte.
// GET /api/v1/admin/usuarios/:id
func AdminDetalleUsuario(c *fiber.Ctx) error {
	id := c.Params("id")

	var email, planActual, rolActual, motivo, plantilla string
	var waTelefono, waPhoneID, waPlantilla, waIdioma string
	var suspendido, waActivo bool
	var creado string
	var expira, ultimoAcceso sql.NullString
	err := config.DB.QueryRow(
		`SELECT email, COALESCE(plan, 'free'), COALESCE(rol, 'usuario'), suspendido,
		        COALESCE(suspendido_motivo, ''), COALESCE(plantilla_mensaje, ''),
		        to_char(creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        to_char(plan_expira_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        to_char(ultimo_acceso, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        COALESCE(whatsapp_telefono, ''), COALESCE(whatsapp_phone_number_id, ''),
		        COALESCE(whatsapp_template_name, ''), COALESCE(whatsapp_template_lang, ''),
		        COALESCE(whatsapp_activo, FALSE)
		   FROM usuarios WHERE id = $1`,
		id,
	).Scan(&email, &planActual, &rolActual, &suspendido, &motivo, &plantilla, &creado, &expira, &ultimoAcceso,
		&waTelefono, &waPhoneID, &waPlantilla, &waIdioma, &waActivo)
	if err == sql.ErrNoRows {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cargar el usuario", "detalle": err.Error()})
	}

	usuario := fiber.Map{
		"id": id, "email": email, "plan": planActual, "rol": rolActual,
		"suspendido": suspendido, "suspendido_motivo": motivo,
		"plantilla_mensaje": plantilla, "creado_en": creado,
		"plan_expira_en": expira.String, "ultimo_acceso": ultimoAcceso.String,
		"recordatorios_usados": RecordatoriosUsadosMes(id),
		"limite_recordatorios": limiteDelPlan(planActual),
		"whatsapp": fiber.Map{
			"activo": waActivo, "telefono": waTelefono, "phone_number_id": waPhoneID,
			"template_name": waPlantilla, "template_lang": waIdioma,
		},
	}

	// Facturas del usuario (con totales de cuotas).
	facturas := []fiber.Map{}
	rows, err := config.DB.Query(
		`SELECT f.id, f.cliente_nombre, f.cliente_email, COALESCE(f.concepto, ''),
		        f.monto, COALESCE(f.moneda, 'COP'), COALESCE(f.cuotas, 1),
		        f.fecha_vencimiento, f.estado, f.notificado,
		        to_char(f.creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        COALESCE(c.pagadas, 0), COALESCE(c.pagado, 0)
		   FROM facturas f
		   LEFT JOIN (
		       SELECT factura_id,
		              COUNT(*) FILTER (WHERE estado = 'pagada') AS pagadas,
		              COALESCE(SUM(monto) FILTER (WHERE estado = 'pagada'), 0) AS pagado
		         FROM cuotas GROUP BY factura_id
		   ) c ON c.factura_id = f.id
		  WHERE f.usuario_id = $1
		  ORDER BY f.fecha_vencimiento ASC, f.creado_en DESC`,
		id,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var fid, nombre, mail, concepto, moneda, vencimiento, estado, creada string
			var monto, pagado float64
			var cuotas, pagadas int
			var notificado bool
			if err := rows.Scan(&fid, &nombre, &mail, &concepto, &monto, &moneda, &cuotas,
				&vencimiento, &estado, &notificado, &creada, &pagadas, &pagado); err != nil {
				continue
			}
			facturas = append(facturas, fiber.Map{
				"id": fid, "cliente_nombre": nombre, "cliente_email": mail, "concepto": concepto,
				"monto": monto, "moneda": moneda, "cuotas": cuotas, "cuotas_pagadas": pagadas,
				"monto_pagado": redondear2(pagado), "monto_pendiente": redondear2(monto - pagado),
				"fecha_vencimiento": vencimiento, "estado": estado, "notificado": notificado,
				"creado_en": creada,
			})
		}
	}

	// Suscripciones.
	suscripciones := []fiber.Map{}
	rowsS, err := config.DB.Query(
		`SELECT referencia, plan, estado, monto, moneda, COALESCE(transaccion, ''),
		        to_char(creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        to_char(pagada_en, 'YYYY-MM-DD"T"HH24:MI:SSOF')
		   FROM suscripciones WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT 20`,
		id,
	)
	if err == nil {
		defer rowsS.Close()
		for rowsS.Next() {
			var referencia, planS, estadoS, moneda, transaccion, creada string
			var monto float64
			var pagada sql.NullString
			if err := rowsS.Scan(&referencia, &planS, &estadoS, &monto, &moneda, &transaccion, &creada, &pagada); err != nil {
				continue
			}
			suscripciones = append(suscripciones, fiber.Map{
				"referencia": referencia, "plan": planS, "estado": estadoS, "monto": monto,
				"moneda": moneda, "transaccion": transaccion, "creado_en": creada,
				"pagada_en": pagada.String,
			})
		}
	}

	// Pagos de pasarela de sus facturas.
	pagos := []fiber.Map{}
	rowsP, err := config.DB.Query(
		`SELECT p.id, p.factura_id, p.cuota_numero, COALESCE(p.referencia, ''), COALESCE(p.pasarela, ''),
		        COALESCE(p.estado, ''), COALESCE(p.monto, 0), COALESCE(p.moneda, 'COP'),
		        COALESCE(p.metodo, ''), to_char(p.creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF')
		   FROM pagos p
		   JOIN facturas f ON f.id = p.factura_id
		  WHERE f.usuario_id = $1
		  ORDER BY p.creado_en DESC LIMIT 50`,
		id,
	)
	if err == nil {
		defer rowsP.Close()
		for rowsP.Next() {
			var pid, fid, referencia, pasarela, estadoP, moneda, metodo, creadoP string
			var cuotaNumero int
			var monto float64
			if err := rowsP.Scan(&pid, &fid, &cuotaNumero, &referencia, &pasarela, &estadoP,
				&monto, &moneda, &metodo, &creadoP); err != nil {
				continue
			}
			pagos = append(pagos, fiber.Map{
				"id": pid, "factura_id": fid, "cuota": cuotaNumero, "referencia": referencia,
				"pasarela": pasarela, "estado": estadoP, "monto": monto, "moneda": moneda,
				"metodo": metodo, "creado_en": creadoP,
			})
		}
	}

	// Consumo de recordatorios de los últimos 6 meses.
	consumo := []fiber.Map{}
	rowsC, err := config.DB.Query(
		`SELECT to_char(date_trunc('month', enviado_en), 'YYYY-MM') AS mes, COUNT(*)
		   FROM recordatorios_enviados
		  WHERE usuario_id = $1 AND enviado_en >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '5 months'
		  GROUP BY 1 ORDER BY 1`,
		id,
	)
	if err == nil {
		defer rowsC.Close()
		for rowsC.Next() {
			var mes string
			var cantidad int
			if err := rowsC.Scan(&mes, &cantidad); err != nil {
				continue
			}
			consumo = append(consumo, fiber.Map{"mes": mes, "cantidad": cantidad})
		}
	}

	return c.JSON(fiber.Map{
		"usuario":       usuario,
		"facturas":      facturas,
		"suscripciones": suscripciones,
		"pagos":         pagos,
		"consumo":       consumo,
	})
}

// limiteDelPlan devuelve el límite mensual de recordatorios (-1 = ilimitado).
func limiteDelPlan(plan string) int {
	if plan == "pro" {
		return -1
	}
	return LimiteRecordatoriosFree
}

// AdminCambiarPlan sube o baja el plan de un usuario manualmente (soporte).
// PATCH /api/v1/admin/usuarios/:id/plan  { "plan": "pro"|"free", "dias": 30 }
func AdminCambiarPlan(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Plan string `json:"plan"`
		Dias int    `json:"dias"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	plan := strings.ToLower(strings.TrimSpace(body.Plan))
	if plan != "pro" && plan != "free" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El plan debe ser 'pro' o 'free'"})
	}
	if body.Dias <= 0 {
		body.Dias = 30
	}
	if body.Dias > 3650 {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El máximo es 3650 días"})
	}

	var email string
	if err := config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, id).Scan(&email); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}

	var err error
	if plan == "pro" {
		_, err = config.DB.Exec(
			`UPDATE usuarios SET plan = 'pro', plan_expira_en = CURRENT_TIMESTAMP + ($2 || ' days')::interval WHERE id = $1`,
			id, body.Dias,
		)
	} else {
		_, err = config.DB.Exec(`UPDATE usuarios SET plan = 'free', plan_expira_en = NULL WHERE id = $1`, id)
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cambiar el plan", "detalle": err.Error()})
	}

	registrarAuditoria(c, "cambiar_plan", "usuario", id, fiber.Map{
		"email": email, "plan": plan, "dias": body.Dias,
	})
	return c.JSON(fiber.Map{"mensaje": "Plan actualizado", "id": id, "plan": plan})
}

// AdminSuspenderUsuario bloquea el acceso de una cuenta sin borrarla.
// PATCH /api/v1/admin/usuarios/:id/suspender  { "suspendido": true, "motivo": "..." }
func AdminSuspenderUsuario(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Suspendido *bool  `json:"suspendido"`
		Motivo     string `json:"motivo"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	if body.Suspendido == nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Indica 'suspendido' (true/false)"})
	}

	// Un admin no puede suspenderse a sí mismo (evita quedarse fuera del panel).
	if adminID, _ := c.Locals("usuario_id").(string); adminID == id && *body.Suspendido {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "No puedes suspender tu propia cuenta"})
	}

	var email string
	if err := config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, id).Scan(&email); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}

	_, err := config.DB.Exec(
		`UPDATE usuarios SET suspendido = $2, suspendido_motivo = NULLIF($3, '') WHERE id = $1`,
		id, *body.Suspendido, strings.TrimSpace(body.Motivo),
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la cuenta", "detalle": err.Error()})
	}

	// Al suspender se cierran todas sus sesiones activas.
	if *body.Suspendido {
		_, _ = config.DB.Exec(`DELETE FROM sesiones WHERE usuario_id = $1`, id)
	}

	accion := "reactivar_usuario"
	if *body.Suspendido {
		accion = "suspender_usuario"
	}
	registrarAuditoria(c, accion, "usuario", id, fiber.Map{"email": email, "motivo": body.Motivo})
	return c.JSON(fiber.Map{"mensaje": "Cuenta actualizada", "id": id, "suspendido": *body.Suspendido})
}

// AdminCambiarRol promueve o degrada una cuenta (admin <-> usuario).
// PATCH /api/v1/admin/usuarios/:id/rol  { "rol": "admin"|"usuario" }
func AdminCambiarRol(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		Rol string `json:"rol"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	rol := strings.ToLower(strings.TrimSpace(body.Rol))
	if rol != "admin" && rol != "usuario" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El rol debe ser 'admin' o 'usuario'"})
	}
	if adminID, _ := c.Locals("usuario_id").(string); adminID == id && rol != "admin" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "No puedes quitarte el rol de administrador"})
	}

	var email string
	if err := config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, id).Scan(&email); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}
	if _, err := config.DB.Exec(`UPDATE usuarios SET rol = $2 WHERE id = $1`, id, rol); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cambiar el rol", "detalle": err.Error()})
	}

	registrarAuditoria(c, "cambiar_rol", "usuario", id, fiber.Map{"email": email, "rol": rol})
	return c.JSON(fiber.Map{"mensaje": "Rol actualizado", "id": id, "rol": rol})
}

// AdminResetPassword define una contraseña temporal para un usuario (soporte).
// POST /api/v1/admin/usuarios/:id/password  { "password_nueva": "..." }
func AdminResetPassword(c *fiber.Ctx) error {
	id := c.Params("id")
	var body struct {
		PasswordNueva string `json:"password_nueva"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}
	if err := validarPassword(body.PasswordNueva); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var email string
	if err := config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, id).Scan(&email); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}

	hash, err := hashearPassword(body.PasswordNueva)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo procesar la contraseña"})
	}
	if _, err := config.DB.Exec(`UPDATE usuarios SET password_hash = $1 WHERE id = $2`, hash, id); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la contraseña", "detalle": err.Error()})
	}
	// Cierra todas las sesiones del usuario afectado.
	_, _ = config.DB.Exec(`DELETE FROM sesiones WHERE usuario_id = $1`, id)

	registrarAuditoria(c, "reset_password", "usuario", id, fiber.Map{"email": email})
	return c.JSON(fiber.Map{"mensaje": "Contraseña restablecida. Se cerraron las sesiones del usuario."})
}

// AdminCerrarSesiones invalida todas las sesiones abiertas de un usuario.
// POST /api/v1/admin/usuarios/:id/cerrar-sesiones
func AdminCerrarSesiones(c *fiber.Ctx) error {
	id := c.Params("id")
	res, err := config.DB.Exec(`DELETE FROM sesiones WHERE usuario_id = $1`, id)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron cerrar las sesiones", "detalle": err.Error()})
	}
	cerradas, _ := res.RowsAffected()
	registrarAuditoria(c, "cerrar_sesiones", "usuario", id, fiber.Map{"sesiones": cerradas})
	return c.JSON(fiber.Map{"mensaje": "Sesiones cerradas", "sesiones": cerradas})
}

// AdminImpersonar abre una sesión como el usuario indicado (para reproducir
// incidencias de soporte). Guarda la sesión del admin en una cookie aparte.
// POST /api/v1/admin/usuarios/:id/impersonar
func AdminImpersonar(c *fiber.Ctx) error {
	id := c.Params("id")
	adminID, _ := c.Locals("usuario_id").(string)
	if adminID == id {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Ya estás en tu propia cuenta"})
	}

	var email string
	var suspendido bool
	if err := config.DB.QueryRow(`SELECT email, suspendido FROM usuarios WHERE id = $1`, id).Scan(&email, &suspendido); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}
	if suspendido {
		return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "La cuenta está suspendida. Reactívala antes de entrar."})
	}

	// Guarda la sesión actual del admin para poder volver.
	if tokenAdmin := c.Cookies(middleware.SessionCookieName); tokenAdmin != "" {
		c.Cookie(&fiber.Cookie{
			Name:     AdminCookieName,
			Value:    tokenAdmin,
			Path:     "/",
			Expires:  time.Now().Add(DuracionSesion),
			MaxAge:   int(DuracionSesion.Seconds()),
			HTTPOnly: true,
			Secure:   c.Protocol() == "https",
			SameSite: "Lax",
		})
	}

	token, err := crearSesion(id)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo abrir la sesión", "detalle": err.Error()})
	}
	setSessionCookie(c, token)

	registrarAuditoria(c, "impersonar", "usuario", id, fiber.Map{"email": email})
	return c.JSON(fiber.Map{"mensaje": "Sesión iniciada como el usuario", "email": email})
}

// AdminSalirImpersonacion restaura la sesión del administrador.
// POST /api/v1/admin/salir-impersonacion
func AdminSalirImpersonacion(c *fiber.Ctx) error {
	tokenAdmin := c.Cookies(AdminCookieName)
	if tokenAdmin == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "No hay una impersonación activa"})
	}

	// Cierra la sesión del usuario impersonado.
	if tokenActual := c.Cookies(middleware.SessionCookieName); tokenActual != "" {
		_, _ = config.DB.Exec(`DELETE FROM sesiones WHERE token = $1`, tokenActual)
	}

	// Verifica que la sesión del admin siga siendo válida.
	var adminID string
	if err := config.DB.QueryRow(
		`SELECT usuario_id FROM sesiones WHERE token = $1 AND expira_en > CURRENT_TIMESTAMP`,
		tokenAdmin,
	).Scan(&adminID); err != nil {
		c.Cookie(&fiber.Cookie{Name: AdminCookieName, Value: "", Path: "/", MaxAge: -1, HTTPOnly: true})
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "La sesión de administrador expiró. Inicia sesión de nuevo."})
	}

	setSessionCookie(c, tokenAdmin)
	c.Cookie(&fiber.Cookie{Name: AdminCookieName, Value: "", Path: "/", MaxAge: -1, HTTPOnly: true})
	return c.JSON(fiber.Map{"mensaje": "Sesión de administrador restaurada"})
}

// ============================================================================
// 3. FACTURAS Y CUOTAS (soporte de pagos)
// ============================================================================

// AdminListarFacturas lista las facturas de todos los usuarios.
// GET /api/v1/admin/facturas?q=&estado=&usuario_id=&page=&limit=
func AdminListarFacturas(c *fiber.Ctx) error {
	page, limit, offset := parsePaginacion(c)
	q := strings.TrimSpace(c.Query("q"))
	estado := strings.TrimSpace(c.Query("estado"))
	usuarioID := strings.TrimSpace(c.Query("usuario_id"))

	where := []string{"1 = 1"}
	args := []any{}
	n := 1

	if q != "" {
		where = append(where, "(f.cliente_nombre ILIKE $"+strconv.Itoa(n)+" OR f.cliente_email ILIKE $"+strconv.Itoa(n)+" OR u.email ILIKE $"+strconv.Itoa(n)+" OR f.id::text = $"+strconv.Itoa(n+1)+")")
		args = append(args, "%"+q+"%", q)
		n += 2
	}
	if estado == "pendiente" || estado == "pagada" {
		where = append(where, "f.estado = $"+strconv.Itoa(n))
		args = append(args, estado)
		n++
	}
	if usuarioID != "" {
		where = append(where, "f.usuario_id = $"+strconv.Itoa(n))
		args = append(args, usuarioID)
		n++
	}

	condicion := strings.Join(where, " AND ")

	var total int
	if err := config.DB.QueryRow(
		`SELECT COUNT(*) FROM facturas f JOIN usuarios u ON u.id = f.usuario_id WHERE `+condicion, args...,
	).Scan(&total); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron contar las facturas", "detalle": err.Error()})
	}

	query := `SELECT f.id, f.usuario_id, u.email, f.cliente_nombre, f.cliente_email,
	                 COALESCE(f.concepto, ''), f.monto, COALESCE(f.moneda, 'COP'),
	                 COALESCE(f.cuotas, 1), f.fecha_vencimiento, f.estado, f.notificado,
	                 to_char(f.creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
	                 COALESCE(f.cliente_telefono, ''), COALESCE(f.canal_recordatorio, 'email'),
	                 COALESCE(c.pagadas, 0), COALESCE(c.pagado, 0)
	            FROM facturas f
	            JOIN usuarios u ON u.id = f.usuario_id
	            LEFT JOIN (
	                SELECT factura_id,
	                       COUNT(*) FILTER (WHERE estado = 'pagada') AS pagadas,
	                       COALESCE(SUM(monto) FILTER (WHERE estado = 'pagada'), 0) AS pagado
	                  FROM cuotas GROUP BY factura_id
	            ) c ON c.factura_id = f.id
	           WHERE ` + condicion + `
	           ORDER BY f.creado_en DESC
	           LIMIT $` + strconv.Itoa(n) + ` OFFSET $` + strconv.Itoa(n+1)
	args = append(args, limit, offset)

	rows, err := config.DB.Query(query, args...)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener las facturas", "detalle": err.Error()})
	}
	defer rows.Close()

	facturas := []fiber.Map{}
	for rows.Next() {
		var fid, uid, emailDueno, nombre, mail, concepto, moneda, vencimiento, estadoF, creada string
		var telefono, canal string
		var monto, pagado float64
		var cuotas, pagadas int
		var notificado bool
		if err := rows.Scan(&fid, &uid, &emailDueno, &nombre, &mail, &concepto, &monto, &moneda,
			&cuotas, &vencimiento, &estadoF, &notificado, &creada, &telefono, &canal, &pagadas, &pagado); err != nil {
			continue
		}
		facturas = append(facturas, fiber.Map{
			"id": fid, "usuario_id": uid, "usuario_email": emailDueno,
			"cliente_nombre": nombre, "cliente_email": mail, "concepto": concepto,
			"cliente_telefono": telefono, "canal_recordatorio": canal,
			"monto": monto, "moneda": moneda, "cuotas": cuotas, "cuotas_pagadas": pagadas,
			"monto_pagado": redondear2(pagado), "monto_pendiente": redondear2(monto - pagado),
			"fecha_vencimiento": vencimiento, "estado": estadoF, "notificado": notificado,
			"creado_en": creada,
		})
	}

	return c.JSON(fiber.Map{
		"facturas": facturas, "total": total, "page": page, "limit": limit,
		"paginas": (total + limit - 1) / limit,
	})
}

// AdminCuotasFactura devuelve las cuotas de cualquier factura.
// GET /api/v1/admin/facturas/:id/cuotas
func AdminCuotasFactura(c *fiber.Ctx) error {
	id := c.Params("id")
	rows, err := config.DB.Query(
		`SELECT id, factura_id, numero, monto, fecha_vencimiento, estado, notificado,
		        to_char(pagada_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
		        COALESCE(metodo_pago, ''), COALESCE(referencia_pago, '')
		   FROM cuotas WHERE factura_id = $1 ORDER BY numero ASC`,
		id,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener las cuotas", "detalle": err.Error()})
	}
	defer rows.Close()

	cuotas := []fiber.Map{}
	for rows.Next() {
		var cid, fid, vencimiento, estado, metodo, referencia string
		var numero int
		var monto float64
		var notificado bool
		var pagada sql.NullString
		if err := rows.Scan(&cid, &fid, &numero, &monto, &vencimiento, &estado, &notificado,
			&pagada, &metodo, &referencia); err != nil {
			continue
		}
		cuotas = append(cuotas, fiber.Map{
			"id": cid, "factura_id": fid, "numero": numero, "monto": monto,
			"fecha_vencimiento": vencimiento, "estado": estado, "notificado": notificado,
			"pagada_en": pagada.String, "metodo_pago": metodo, "referencia_pago": referencia,
		})
	}
	return c.JSON(fiber.Map{"cuotas": cuotas, "total": len(cuotas)})
}

// AdminMarcarCuotaPagada registra el pago de una cuota (conciliación manual).
// POST /api/v1/admin/facturas/:id/cuotas/:numero/pagar
func AdminMarcarCuotaPagada(c *fiber.Ctx) error {
	id := c.Params("id")
	numero := c.Params("numero")
	var body struct {
		MetodoPago string `json:"metodo_pago"`
		Referencia string `json:"referencia"`
	}
	_ = c.BodyParser(&body)

	res, err := config.DB.Exec(
		`UPDATE cuotas SET estado = 'pagada', pagada_en = CURRENT_TIMESTAMP,
		        metodo_pago = $3, referencia_pago = NULLIF($4, '')
		  WHERE factura_id = $1 AND numero = $2 AND estado <> 'pagada'`,
		id, numero, normalizarMetodoPago(body.MetodoPago), strings.TrimSpace(body.Referencia),
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la cuota", "detalle": err.Error()})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Cuota no encontrada o ya pagada"})
	}
	actualizarEstadoFactura(id)

	registrarAuditoria(c, "marcar_cuota_pagada", "cuota", id+":"+numero, fiber.Map{
		"factura_id": id, "cuota": numero, "metodo": body.MetodoPago, "referencia": body.Referencia,
	})
	return c.JSON(fiber.Map{"mensaje": "Cuota marcada como pagada", "factura_id": id, "cuota": numero})
}

// AdminRevertirCuota devuelve una cuota a 'pendiente' (corrección de errores).
// POST /api/v1/admin/facturas/:id/cuotas/:numero/revertir
func AdminRevertirCuota(c *fiber.Ctx) error {
	id := c.Params("id")
	numero := c.Params("numero")

	res, err := config.DB.Exec(
		`UPDATE cuotas SET estado = 'pendiente', pagada_en = NULL, metodo_pago = NULL, referencia_pago = NULL
		  WHERE factura_id = $1 AND numero = $2 AND estado = 'pagada'`,
		id, numero,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo revertir la cuota", "detalle": err.Error()})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Cuota no encontrada o no estaba pagada"})
	}
	// La factura vuelve a pendiente si tenía todas las cuotas pagadas.
	_, _ = config.DB.Exec(`UPDATE facturas SET estado = 'pendiente' WHERE id = $1`, id)

	registrarAuditoria(c, "revertir_cuota", "cuota", id+":"+numero, fiber.Map{"factura_id": id, "cuota": numero})
	return c.JSON(fiber.Map{"mensaje": "Cuota revertida a pendiente", "factura_id": id, "cuota": numero})
}

// AdminMarcarFacturaPagada marca todas las cuotas de una factura como pagadas.
// POST /api/v1/admin/facturas/:id/pagar
func AdminMarcarFacturaPagada(c *fiber.Ctx) error {
	id := c.Params("id")
	var existe string
	if err := config.DB.QueryRow(`SELECT id FROM facturas WHERE id = $1`, id).Scan(&existe); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}
	if _, err := config.DB.Exec(
		`UPDATE cuotas SET estado = 'pagada', pagada_en = COALESCE(pagada_en, CURRENT_TIMESTAMP),
		        metodo_pago = COALESCE(metodo_pago, 'manual')
		  WHERE factura_id = $1 AND estado <> 'pagada'`,
		id,
	); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron actualizar las cuotas", "detalle": err.Error()})
	}
	if _, err := config.DB.Exec(`UPDATE facturas SET estado = 'pagada' WHERE id = $1`, id); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error al actualizar la factura", "detalle": err.Error()})
	}
	registrarAuditoria(c, "marcar_factura_pagada", "factura", id, nil)
	return c.JSON(fiber.Map{"mensaje": "Factura marcada como pagada", "id": id})
}

// AdminEliminarFactura borra una factura de cualquier usuario.
// DELETE /api/v1/admin/facturas/:id
func AdminEliminarFactura(c *fiber.Ctx) error {
	id := c.Params("id")
	res, err := config.DB.Exec(`DELETE FROM facturas WHERE id = $1`, id)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error al eliminar la factura", "detalle": err.Error()})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}
	registrarAuditoria(c, "eliminar_factura", "factura", id, nil)
	return c.SendStatus(http.StatusNoContent)
}

// ============================================================================
// 4. PAGOS DE PASARELA
// ============================================================================

// AdminListarPagos lista todos los pagos registrados por la pasarela.
// GET /api/v1/admin/pagos?q=&estado=&page=&limit=
func AdminListarPagos(c *fiber.Ctx) error {
	page, limit, offset := parsePaginacion(c)
	q := strings.TrimSpace(c.Query("q"))
	estado := strings.TrimSpace(c.Query("estado"))

	where := []string{"1 = 1"}
	args := []any{}
	n := 1
	if q != "" {
		where = append(where, "(COALESCE(p.referencia, '') ILIKE $"+strconv.Itoa(n)+" OR f.cliente_email ILIKE $"+strconv.Itoa(n)+" OR u.email ILIKE $"+strconv.Itoa(n)+")")
		args = append(args, "%"+q+"%")
		n++
	}
	if estado != "" {
		where = append(where, "p.estado = $"+strconv.Itoa(n))
		args = append(args, estado)
		n++
	}
	condicion := strings.Join(where, " AND ")

	var total int
	var montoTotal float64
	if err := config.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(p.monto), 0)
		   FROM pagos p
		   JOIN facturas f ON f.id = p.factura_id
		   JOIN usuarios u ON u.id = f.usuario_id
		  WHERE `+condicion, args...,
	).Scan(&total, &montoTotal); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron contar los pagos", "detalle": err.Error()})
	}

	query := `SELECT p.id, p.factura_id, p.cuota_numero, COALESCE(p.referencia, ''),
	                 COALESCE(p.pasarela, ''), COALESCE(p.estado, ''), COALESCE(p.monto, 0),
	                 COALESCE(p.moneda, 'COP'), COALESCE(p.metodo, ''),
	                 to_char(p.creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
	                 f.cliente_nombre, f.cliente_email, u.id, u.email
	            FROM pagos p
	            JOIN facturas f ON f.id = p.factura_id
	            JOIN usuarios u ON u.id = f.usuario_id
	           WHERE ` + condicion + `
	           ORDER BY p.creado_en DESC
	           LIMIT $` + strconv.Itoa(n) + ` OFFSET $` + strconv.Itoa(n+1)
	args = append(args, limit, offset)

	rows, err := config.DB.Query(query, args...)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener los pagos", "detalle": err.Error()})
	}
	defer rows.Close()

	pagos := []fiber.Map{}
	for rows.Next() {
		var pid, fid, referencia, pasarela, estadoP, moneda, metodo, creado string
		var clienteNombre, clienteEmail, uid, emailDueno string
		var cuotaNumero int
		var monto float64
		if err := rows.Scan(&pid, &fid, &cuotaNumero, &referencia, &pasarela, &estadoP, &monto,
			&moneda, &metodo, &creado, &clienteNombre, &clienteEmail, &uid, &emailDueno); err != nil {
			continue
		}
		pagos = append(pagos, fiber.Map{
			"id": pid, "factura_id": fid, "cuota": cuotaNumero, "referencia": referencia,
			"pasarela": pasarela, "estado": estadoP, "monto": monto, "moneda": moneda,
			"metodo": metodo, "creado_en": creado,
			"cliente_nombre": clienteNombre, "cliente_email": clienteEmail,
			"usuario_id": uid, "usuario_email": emailDueno,
		})
	}

	return c.JSON(fiber.Map{
		"pagos": pagos, "total": total, "monto_total": redondear2(montoTotal),
		"page": page, "limit": limit, "paginas": (total + limit - 1) / limit,
	})
}

// ============================================================================
// 5. SUSCRIPCIONES
// ============================================================================

// AdminListarSuscripciones lista todas las órdenes de suscripción.
// GET /api/v1/admin/suscripciones?q=&estado=&page=&limit=
func AdminListarSuscripciones(c *fiber.Ctx) error {
	page, limit, offset := parsePaginacion(c)
	q := strings.TrimSpace(c.Query("q"))
	estado := strings.TrimSpace(c.Query("estado"))

	where := []string{"1 = 1"}
	args := []any{}
	n := 1
	if q != "" {
		where = append(where, "(s.referencia ILIKE $"+strconv.Itoa(n)+" OR u.email ILIKE $"+strconv.Itoa(n)+")")
		args = append(args, "%"+q+"%")
		n++
	}
	if estado == "pendiente" || estado == "pagada" {
		where = append(where, "s.estado = $"+strconv.Itoa(n))
		args = append(args, estado)
		n++
	}
	condicion := strings.Join(where, " AND ")

	var total int
	var ingresos float64
	if err := config.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(s.monto) FILTER (WHERE s.estado = 'pagada'), 0)
		   FROM suscripciones s JOIN usuarios u ON u.id = s.usuario_id
		  WHERE `+condicion, args...,
	).Scan(&total, &ingresos); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron contar las suscripciones", "detalle": err.Error()})
	}

	query := `SELECT s.id, s.referencia, s.plan, s.estado, s.monto, COALESCE(s.moneda, 'COP'),
	                 COALESCE(s.transaccion, ''),
	                 to_char(s.creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
	                 to_char(s.pagada_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
	                 u.id, u.email, COALESCE(u.plan, 'free'),
	                 to_char(u.plan_expira_en, 'YYYY-MM-DD"T"HH24:MI:SSOF')
	            FROM suscripciones s
	            JOIN usuarios u ON u.id = s.usuario_id
	           WHERE ` + condicion + `
	           ORDER BY s.creado_en DESC
	           LIMIT $` + strconv.Itoa(n) + ` OFFSET $` + strconv.Itoa(n+1)
	args = append(args, limit, offset)

	rows, err := config.DB.Query(query, args...)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener las suscripciones", "detalle": err.Error()})
	}
	defer rows.Close()

	suscripciones := []fiber.Map{}
	for rows.Next() {
		var sid, referencia, planS, estadoS, moneda, transaccion, creada, uid, email, planUsuario, expira string
		var monto float64
		var pagada sql.NullString
		if err := rows.Scan(&sid, &referencia, &planS, &estadoS, &monto, &moneda, &transaccion,
			&creada, &pagada, &uid, &email, &planUsuario, &expira); err != nil {
			continue
		}
		suscripciones = append(suscripciones, fiber.Map{
			"id": sid, "referencia": referencia, "plan": planS, "estado": estadoS,
			"monto": monto, "moneda": moneda, "transaccion": transaccion,
			"creado_en": creada, "pagada_en": pagada.String,
			"usuario_id": uid, "usuario_email": email,
			"usuario_plan": planUsuario, "usuario_plan_expira_en": expira,
		})
	}

	return c.JSON(fiber.Map{
		"suscripciones": suscripciones, "total": total, "ingresos": redondear2(ingresos),
		"page": page, "limit": limit, "paginas": (total + limit - 1) / limit,
	})
}

// AdminActivarSuscripcion concilia manualmente una suscripción pendiente.
// POST /api/v1/admin/suscripciones/:referencia/activar
func AdminActivarSuscripcion(c *fiber.Ctx) error {
	referencia := c.Params("referencia")
	ok, err := ActivarSuscripcion(referencia, "admin-manual-"+time.Now().Format("20060102150405"))
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo activar la suscripción", "detalle": err.Error()})
	}
	if !ok {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Suscripción no encontrada"})
	}
	registrarAuditoria(c, "activar_suscripcion", "suscripcion", referencia, nil)
	return c.JSON(fiber.Map{"mensaje": "Suscripción activada y plan Pro vigente por 1 mes", "referencia": referencia})
}

// AdminCancelarSuscripcion devuelve al usuario al plan gratuito.
// POST /api/v1/admin/suscripciones/:referencia/cancelar
func AdminCancelarSuscripcion(c *fiber.Ctx) error {
	referencia := c.Params("referencia")
	var usuarioID string
	if err := config.DB.QueryRow(`SELECT usuario_id FROM suscripciones WHERE referencia = $1`, referencia).Scan(&usuarioID); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Suscripción no encontrada"})
	}
	if _, err := config.DB.Exec(
		`UPDATE usuarios SET plan = 'free', plan_expira_en = NULL WHERE id = $1`, usuarioID,
	); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cancelar el plan", "detalle": err.Error()})
	}
	registrarAuditoria(c, "cancelar_suscripcion", "suscripcion", referencia, fiber.Map{"usuario_id": usuarioID})
	return c.JSON(fiber.Map{"mensaje": "Suscripción cancelada; el usuario vuelve al plan gratuito", "referencia": referencia})
}

// ============================================================================
// 6. AUDITORÍA
// ============================================================================

// AdminAuditoria devuelve el registro de acciones de administradores.
// GET /api/v1/admin/auditoria?page=&limit=
func AdminAuditoria(c *fiber.Ctx) error {
	page, limit, offset := parsePaginacion(c)

	var total int
	if err := config.DB.QueryRow(`SELECT COUNT(*) FROM admin_auditoria`).Scan(&total); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo leer la auditoría", "detalle": err.Error()})
	}

	rows, err := config.DB.Query(
		`SELECT id, COALESCE(admin_email, ''), accion, COALESCE(entidad, ''),
		        COALESCE(entidad_id, ''), COALESCE(detalle::text, ''),
		        to_char(creado_en, 'YYYY-MM-DD"T"HH24:MI:SSOF')
		   FROM admin_auditoria
		  ORDER BY creado_en DESC
		  LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo leer la auditoría", "detalle": err.Error()})
	}
	defer rows.Close()

	registros := []fiber.Map{}
	for rows.Next() {
		var id, adminEmail, accion, entidad, entidadID, detalle, creado string
		if err := rows.Scan(&id, &adminEmail, &accion, &entidad, &entidadID, &detalle, &creado); err != nil {
			continue
		}
		registros = append(registros, fiber.Map{
			"id": id, "admin_email": adminEmail, "accion": accion, "entidad": entidad,
			"entidad_id": entidadID, "detalle": detalle, "creado_en": creado,
		})
	}

	return c.JSON(fiber.Map{
		"registros": registros, "total": total, "page": page, "limit": limit,
		"paginas": (total + limit - 1) / limit,
	})
}

// AdminEstadoSistema comprueba la configuración del backend (soporte técnico).
// GET /api/v1/admin/sistema
func AdminEstadoSistema(c *fiber.Ctx) error {
	_, _, wompiOK := wompiConfig()
	emailOK := services.EmailConfigurado()

	var dbOK bool
	if err := config.DB.Ping(); err == nil {
		dbOK = true
	}

	return c.JSON(fiber.Map{
		"base_datos":    dbOK,
		"email":         emailOK,
		"pasarela":      wompiOK,
		"whatsapp":      services.WhatsAppConfigurado(),
		"hora_servidor": time.Now().Format(time.RFC3339),
	})
}
