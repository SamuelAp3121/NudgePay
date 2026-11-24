package handlers

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"invoice-reminder/config"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ============================================================================
// REPORTES — resumen de cobros y exportación CSV.
//
// Free NO tiene acceso (402). Pro ve el resumen general + CSV básico.
// Business además recibe efectividad, aging de deuda y tasa de recuperación.
//
// GET  /api/v1/reportes/resumen  → métricas del mes (y rango opcional)
// GET  /api/v1/reportes/csv      → descarga CSV de facturas con filtros
// ============================================================================

// rangoReporte lee ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD. Por defecto: mes en curso.
func rangoReporte(c *fiber.Ctx) (time.Time, time.Time) {
	hoy := time.Now()
	inicioMes := time.Date(hoy.Year(), hoy.Month(), 1, 0, 0, 0, 0, hoy.Location())
	finMes := inicioMes.AddDate(0, 1, -1)

	desde := inicioMes
	if v := strings.TrimSpace(c.Query("desde")); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			desde = t
		}
	}
	hasta := finMes
	if v := strings.TrimSpace(c.Query("hasta")); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			hasta = t
		}
	}
	if hasta.Before(desde) {
		desde, hasta = hasta, desde
	}
	return desde, hasta
}

// chequearReportes bloquea el acceso al plan Free con 402 + mensaje de upgrade.
func chequearReportes(c *fiber.Ctx) (string, bool) {
	plan, _ := c.Locals("plan").(string)
	plan = NormalizarPlan(plan)
	if !PuedeVerReportes(plan) {
		_ = c.Status(http.StatusPaymentRequired).JSON(fiber.Map{
			"error": "Los reportes son del plan Pro en adelante. Actualiza tu plan para ver el resumen de cobros y exportar a CSV.",
			"plan":  plan,
		})
		return plan, false
	}
	return plan, true
}

// ObtenerResumenReportes devuelve las métricas de cobro del usuario.
// GET /api/v1/reportes/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
func ObtenerResumenReportes(c *fiber.Ctx) error {
	plan, ok := chequearReportes(c)
	if !ok {
		return nil
	}
	usuarioID, _ := c.Locals("usuario_id").(string)
	desde, hasta := rangoReporte(c)
	desdeStr, hastaStr := desde.Format("2006-01-02"), hasta.Format("2006-01-02")

	var facturasTotal, facturasPendientes, facturasPagadas int
	var montoFacturado, montoPendiente, montoCobrado float64
	_ = config.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM facturas
		  WHERE usuario_id = $1 AND creado_en::date BETWEEN $2 AND $3`,
		usuarioID, desdeStr, hastaStr,
	).Scan(&facturasTotal, &montoFacturado)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(monto), 0) FROM facturas
		  WHERE usuario_id = $1 AND estado <> 'pagada' AND creado_en::date BETWEEN $2 AND $3`,
		usuarioID, desdeStr, hastaStr,
	).Scan(&facturasPendientes, &montoPendiente)
	_ = config.DB.QueryRow(
		`SELECT COUNT(*), COALESCE(SUM(c.monto), 0) FROM cuotas c
		  JOIN facturas f ON f.id = c.factura_id
		 WHERE f.usuario_id = $1 AND c.estado = 'pagada'
		   AND c.pagada_en::date BETWEEN $2 AND $3`,
		usuarioID, desdeStr, hastaStr,
	).Scan(&facturasPagadas, &montoCobrado)

	var recordatoriosEmail, recordatoriosWhatsApp int
	var tasaRecuperacion float64
	if config.MigracionWhatsAppAplicada() {
		_ = config.DB.QueryRow(
			`SELECT COUNT(*) FROM recordatorios_enviados
			  WHERE usuario_id = $1 AND COALESCE(canal, 'email') = 'email'
			    AND enviado_en::date BETWEEN $2 AND $3`,
			usuarioID, desdeStr, hastaStr,
		).Scan(&recordatoriosEmail)
		_ = config.DB.QueryRow(
			`SELECT COUNT(*) FROM recordatorios_enviados
			  WHERE usuario_id = $1 AND canal = 'whatsapp' AND COALESCE(estado, 'enviado') = 'enviado'
			    AND enviado_en::date BETWEEN $2 AND $3`,
			usuarioID, desdeStr, hastaStr,
		).Scan(&recordatoriosWhatsApp)
	} else {
		_ = config.DB.QueryRow(
			`SELECT COUNT(*) FROM recordatorios_enviados
			  WHERE usuario_id = $1 AND enviado_en::date BETWEEN $2 AND $3`,
			usuarioID, desdeStr, hastaStr,
		).Scan(&recordatoriosEmail)
	}
	if montoFacturado > 0 {
		tasaRecuperacion = redondear2(montoCobrado / montoFacturado * 100)
	}

	resumen := fiber.Map{
		"desde":                    desdeStr,
		"hasta":                    hastaStr,
		"plan":                     plan,
		"facturas_total":           facturasTotal,
		"facturas_pendientes":      facturasPendientes,
		"cuotas_cobradas":          facturasPagadas,
		"monto_facturado":          redondear2(montoFacturado),
		"monto_pendiente":          redondear2(montoPendiente),
		"monto_cobrado":            redondear2(montoCobrado),
		"tasa_recuperacion_pct":    tasaRecuperacion,
		"recordatorios_email":      recordatoriosEmail,
		"recordatorios_whatsapp":   recordatoriosWhatsApp,
		"recordatorios_total":      recordatoriosEmail + recordatoriosWhatsApp,
	}

	// Business: detalle extra — efectividad por canal y antigüedad de la deuda.
	if NormalizarPlan(plan) == PlanBusiness {
		var vencidas int
		var montoVencido float64
		_ = config.DB.QueryRow(
			`SELECT COUNT(DISTINCT f.id), COALESCE(SUM(f.monto - COALESCE(p.pagado, 0)), 0)
			   FROM facturas f
			   LEFT JOIN (SELECT factura_id, SUM(monto) AS pagado FROM cuotas
			               WHERE estado = 'pagada' GROUP BY factura_id) p ON p.factura_id = f.id
			  WHERE f.usuario_id = $1 AND f.estado <> 'pagada'
			    AND f.fecha_vencimiento < CURRENT_DATE`,
			usuarioID,
		).Scan(&vencidas, &montoVencido)

		var porVencer7 int
		var montoPorVencer7 float64
		_ = config.DB.QueryRow(
			`SELECT COUNT(*), COALESCE(SUM(c.monto), 0) FROM cuotas c
			  JOIN facturas f ON f.id = c.factura_id
			 WHERE f.usuario_id = $1 AND c.estado <> 'pagada' AND f.estado <> 'pagada'
			   AND c.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`,
			usuarioID,
		).Scan(&porVencer7, &montoPorVencer7)

		resumen["facturas_vencidas"] = vencidas
		resumen["monto_vencido"] = redondear2(montoVencido)
		resumen["cuotas_por_vencer_7d"] = porVencer7
		resumen["monto_por_vencer_7d"] = redondear2(montoPorVencer7)
		resumen["ventana_auto_dias"] = VentanaAutoDias(plan)

		// Top deudores (top 5 por monto pendiente).
		top := []fiber.Map{}
		rows, err := config.DB.Query(
			`SELECT f.cliente_nombre, f.cliente_email,
			        COUNT(*) AS n, COALESCE(SUM(f.monto - COALESCE(p.pagado, 0)), 0) AS pendiente
			   FROM facturas f
			   LEFT JOIN (SELECT factura_id, SUM(monto) AS pagado FROM cuotas
			               WHERE estado = 'pagada' GROUP BY factura_id) p ON p.factura_id = f.id
			  WHERE f.usuario_id = $1 AND f.estado <> 'pagada'
			  GROUP BY f.cliente_nombre, f.cliente_email
			  ORDER BY pendiente DESC LIMIT 5`,
			usuarioID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var nombre, email string
				var n int
				var pendiente float64
				if err := rows.Scan(&nombre, &email, &n, &pendiente); err == nil {
					top = append(top, fiber.Map{
						"cliente": nombre, "email": email,
						"facturas": n, "pendiente": redondear2(pendiente),
					})
				}
			}
		}
		resumen["top_deudores"] = top
	}

	return c.JSON(fiber.Map{"resumen": resumen})
}

// ExportarReporteCSV descarga las facturas del rango como CSV.
// GET /api/v1/reportes/csv?desde=&hasta=&estado=pendiente|pagada
func ExportarReporteCSV(c *fiber.Ctx) error {
	_, ok := chequearReportes(c)
	if !ok {
		return nil
	}
	usuarioID, _ := c.Locals("usuario_id").(string)
	desde, hasta := rangoReporte(c)
	desdeStr, hastaStr := desde.Format("2006-01-02"), hasta.Format("2006-01-02")
	estado := strings.ToLower(strings.TrimSpace(c.Query("estado")))

	where := "f.usuario_id = $1 AND f.creado_en::date BETWEEN $2 AND $3"
	args := []any{usuarioID, desdeStr, hastaStr}
	n := 4
	if estado == "pendiente" || estado == "pagada" {
		where += " AND f.estado = $" + strconv.Itoa(n)
		args = append(args, estado)
		n++
	}

	query := `SELECT f.cliente_nombre, f.cliente_email, COALESCE(f.concepto, ''),
	                 f.monto, COALESCE(f.moneda, 'COP'), COALESCE(f.cuotas, 1),
	                 f.fecha_vencimiento, f.estado,
	                 COALESCE(c.pagadas, 0), COALESCE(c.pagado, 0),
	                 to_char(f.creado_en, 'YYYY-MM-DD')
	            FROM facturas f
	            LEFT JOIN (SELECT factura_id,
	                              COUNT(*) FILTER (WHERE estado = 'pagada') AS pagadas,
	                              COALESCE(SUM(monto) FILTER (WHERE estado = 'pagada'), 0) AS pagado
	                         FROM cuotas GROUP BY factura_id) c ON c.factura_id = f.id
	           WHERE ` + where + `
	           ORDER BY f.creado_en DESC`

	rows, err := config.DB.Query(query, args...)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar el reporte", "detalle": err.Error()})
	}
	defer rows.Close()

	var sb strings.Builder
	w := csv.NewWriter(&sb)
	_ = w.Write([]string{"cliente", "email", "concepto", "monto", "moneda", "cuotas",
		"cuotas_pagadas", "monto_pagado", "monto_pendiente", "fecha_vencimiento", "estado", "creada_en"})

	for rows.Next() {
		var nombre, email, moneda, vencimiento, estadoF, creada string
		var monto, pagado float64
		var cuotas, pagadas int
		var conceptoNull sql.NullString
		if err := rows.Scan(&nombre, &email, &conceptoNull, &monto, &moneda, &cuotas,
			&vencimiento, &estadoF, &pagadas, &pagado, &creada); err != nil {
			continue
		}
		pendiente := redondear2(monto - pagado)
		_ = w.Write([]string{
			nombre, email, conceptoNull.String,
			fmt.Sprintf("%.2f", monto), moneda, strconv.Itoa(cuotas),
			strconv.Itoa(pagadas), fmt.Sprintf("%.2f", pagado),
			fmt.Sprintf("%.2f", pendiente), vencimiento, estadoF, creada,
		})
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar el CSV"})
	}

	nombreArchivo := fmt.Sprintf("toquepay-reporte-%s_%s.csv", desdeStr, hastaStr)
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="`+nombreArchivo+`"`)
	return c.SendString("\xef\xbb\xbf" + sb.String()) // BOM para que Excel abra los tildes
}
