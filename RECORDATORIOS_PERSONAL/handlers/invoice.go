package handlers

import (
	"database/sql"
	"invoice-reminder/config"
	"invoice-reminder/models"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// MaxCuotas es el máximo de cuotas por factura.
const MaxCuotas = 60

// ListarFacturas devuelve todas las facturas del usuario autenticado con sus totales de cuotas.
// GET /api/v1/facturas
func ListarFacturas(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	query := `SELECT f.id, f.usuario_id, f.cliente_nombre, f.cliente_email, COALESCE(f.concepto, ''),
	                 f.monto, COALESCE(f.moneda, 'COP'), COALESCE(f.cuotas, 1),
	                 f.fecha_vencimiento, f.estado, f.notificado, f.creado_en,
	                 f.pago_link, f.pago_qr, f.pago_transfer,
	                 COALESCE(f.banco_nombre, ''), COALESCE(f.banco_cuenta, ''), COALESCE(f.banco_titular, ''),
	                 COALESCE(f.qr_payload, ''), COALESCE(f.token_publico, ''),
	                 COALESCE(c.pagadas, 0), COALESCE(c.pagado, 0)
	          FROM facturas f
	          LEFT JOIN (
	              SELECT factura_id,
	                     COUNT(*) FILTER (WHERE estado = 'pagada') AS pagadas,
	                     COALESCE(SUM(monto) FILTER (WHERE estado = 'pagada'), 0) AS pagado
	                FROM cuotas
	               GROUP BY factura_id
	          ) c ON c.factura_id = f.id
	          WHERE f.usuario_id = $1
	          ORDER BY f.fecha_vencimiento ASC, f.creado_en DESC`

	rows, err := config.DB.Query(query, usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener las facturas", "detalle": err.Error()})
	}
	defer rows.Close()

	facturas := []models.Factura{}
	for rows.Next() {
		var f models.Factura
		var usuario sql.NullString
		var pagado float64
		if err := rows.Scan(&f.ID, &usuario, &f.ClienteNombre, &f.ClienteEmail, &f.Concepto,
			&f.Monto, &f.Moneda, &f.Cuotas, &f.FechaVencimiento, &f.Estado, &f.Notificado, &f.CreadoEn,
			&f.PagoLink, &f.PagoQR, &f.PagoTransfer,
			&f.BancoNombre, &f.BancoCuenta, &f.BancoTitular, &f.QRPayload, &f.TokenPublico,
			&f.CuotasPagadas, &pagado); err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error leyendo las facturas", "detalle": err.Error()})
		}
		f.UsuarioID = usuario.String
		completarTotales(&f, pagado)
		facturas = append(facturas, f)
	}

	return c.JSON(fiber.Map{"facturas": facturas, "total": len(facturas)})
}

// completarTotales rellena los campos calculados de una factura.
func completarTotales(f *models.Factura, pagado float64) {
	if f.Cuotas <= 0 {
		f.Cuotas = 1
	}
	f.MontoCuota = redondear2(f.Monto / float64(f.Cuotas))
	f.MontoPagado = redondear2(pagado)
	f.MontoPendiente = redondear2(f.Monto - pagado)
}

// CrearFactura registra una factura (pago único o por cuotas) para el usuario autenticado.
// POST /api/v1/facturas
func CrearFactura(c *fiber.Ctx) error {
	var f models.Factura
	if err := c.BodyParser(&f); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	// El dueño de la factura SIEMPRE es el usuario de la sesión (nunca el body).
	usuarioID, _ := c.Locals("usuario_id").(string)

	f.ClienteNombre = strings.TrimSpace(f.ClienteNombre)
	f.ClienteEmail = strings.TrimSpace(strings.ToLower(f.ClienteEmail))
	f.Concepto = strings.TrimSpace(f.Concepto)

	if f.ClienteNombre == "" || f.ClienteEmail == "" || f.Monto <= 0 || f.FechaVencimiento == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "cliente_nombre, cliente_email, monto (> 0) y fecha_vencimiento son obligatorios"})
	}
	if len([]rune(f.Concepto)) > 300 {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El concepto no puede superar 300 caracteres"})
	}

	moneda, ok := normalizarMoneda(f.Moneda)
	if !ok {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Moneda no soportada. Usa COP, USD, EUR, MXN, ARS, CLP, PEN o BRL."})
	}
	f.Moneda = moneda

	if f.Cuotas <= 0 {
		f.Cuotas = 1
	}
	if f.Cuotas > MaxCuotas {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El número de cuotas no puede superar 60"})
	}

	// Validar la fecha de la primera cuota.
	primeraFecha, err := time.Parse("2006-01-02", f.FechaVencimiento)
	if err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "fecha_vencimiento debe tener formato YYYY-MM-DD"})
	}

	f.Monto = redondear2(f.Monto)

	// Si no se indica ningún medio de pago, se habilita el enlace de pago por defecto.
	if !f.PagoLink && !f.PagoQR && !f.PagoTransfer {
		f.PagoLink = true
	}

	token, err := generarTokenPublico()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar el enlace de pago"})
	}
	f.TokenPublico = token

	tx, err := config.DB.Begin()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo iniciar la transacción"})
	}
	defer tx.Rollback()

	query := `INSERT INTO facturas (usuario_id, cliente_nombre, cliente_email, concepto, monto, moneda, cuotas,
	                               fecha_vencimiento, pago_link, pago_qr, pago_transfer,
	                               banco_nombre, banco_cuenta, banco_titular, qr_payload, token_publico)
	          VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11, NULLIF($12, ''), NULLIF($13, ''), NULLIF($14, ''), NULLIF($15, ''), $16)
	          RETURNING id, estado, notificado, creado_en`

	err = tx.QueryRow(query, usuarioID, f.ClienteNombre, f.ClienteEmail, f.Concepto, f.Monto, f.Moneda, f.Cuotas,
		f.FechaVencimiento, f.PagoLink, f.PagoQR, f.PagoTransfer,
		strings.TrimSpace(f.BancoNombre), strings.TrimSpace(f.BancoCuenta), strings.TrimSpace(f.BancoTitular),
		strings.TrimSpace(f.QRPayload), f.TokenPublico).
		Scan(&f.ID, &f.Estado, &f.Notificado, &f.CreadoEn)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo registrar la factura", "detalle": err.Error()})
	}

	// Generar las cuotas: una por mes a partir de la fecha indicada.
	montos := calcularCuotas(f.Monto, f.Cuotas)
	for i := 0; i < f.Cuotas; i++ {
		fecha := primeraFecha.AddDate(0, i, 0).Format("2006-01-02")
		if _, err := tx.Exec(
			`INSERT INTO cuotas (factura_id, numero, monto, fecha_vencimiento) VALUES ($1, $2, $3, $4)`,
			f.ID, i+1, montos[i], fecha,
		); err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron crear las cuotas", "detalle": err.Error()})
		}
	}

	if err := tx.Commit(); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo guardar la factura", "detalle": err.Error()})
	}

	f.UsuarioID = usuarioID
	completarTotales(&f, 0)

	return c.Status(http.StatusCreated).JSON(fiber.Map{"mensaje": "Factura registrada exitosamente", "factura": f})
}

// ObtenerCuotas devuelve las cuotas de una factura del usuario.
// GET /api/v1/facturas/:id/cuotas
func ObtenerCuotas(c *fiber.Ctx) error {
	id := c.Params("id")
	usuarioID, _ := c.Locals("usuario_id").(string)

	var existe string
	if err := config.DB.QueryRow(`SELECT id FROM facturas WHERE id = $1 AND usuario_id = $2`, id, usuarioID).Scan(&existe); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}

	rows, err := config.DB.Query(
		`SELECT id, factura_id, numero, monto, fecha_vencimiento, estado, notificado,
		        to_char(pagada_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'), COALESCE(metodo_pago, ''),
		        COALESCE(referencia_pago, '')
		   FROM cuotas WHERE factura_id = $1 ORDER BY numero ASC`,
		id,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener las cuotas", "detalle": err.Error()})
	}
	defer rows.Close()

	cuotas := []models.Cuota{}
	for rows.Next() {
		var cu models.Cuota
		var pagadaEn sql.NullString
		if err := rows.Scan(&cu.ID, &cu.FacturaID, &cu.Numero, &cu.Monto, &cu.FechaVencimiento, &cu.Estado, &cu.Notificado, &pagadaEn, &cu.MetodoPago, &cu.ReferenciaPago); err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error leyendo las cuotas", "detalle": err.Error()})
		}
		if pagadaEn.Valid {
			cu.PagadaEn = &pagadaEn.String
		}
		cuotas = append(cuotas, cu)
	}

	return c.JSON(fiber.Map{"cuotas": cuotas, "total": len(cuotas)})
}

// MarcarPagada marca TODAS las cuotas de una factura como pagadas.
// POST /api/v1/facturas/:id/pagar
func MarcarPagada(c *fiber.Ctx) error {
	id := c.Params("id")
	usuarioID, _ := c.Locals("usuario_id").(string)

	var existe string
	if err := config.DB.QueryRow(`SELECT id FROM facturas WHERE id = $1 AND usuario_id = $2`, id, usuarioID).Scan(&existe); err != nil {
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

	return c.JSON(fiber.Map{"mensaje": "Factura marcada como pagada", "id": id, "estado": "pagada"})
}

// EliminarFactura borra una factura (y sus cuotas) del usuario.
// DELETE /api/v1/facturas/:id
func EliminarFactura(c *fiber.Ctx) error {
	id := c.Params("id")
	usuarioID, _ := c.Locals("usuario_id").(string)

	res, err := config.DB.Exec(`DELETE FROM facturas WHERE id = $1 AND usuario_id = $2`, id, usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error al eliminar la factura", "detalle": err.Error()})
	}

	affected, _ := res.RowsAffected()
	if affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}

	return c.SendStatus(http.StatusNoContent)
}
