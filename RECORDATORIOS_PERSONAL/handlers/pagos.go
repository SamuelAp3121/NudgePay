package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"invoice-reminder/config"
	"invoice-reminder/models"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// generarTokenPublico crea el token del enlace público de pago del cliente.
func generarTokenPublico() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// normalizarMetodoPago valida el método con el que se registra un pago.
func normalizarMetodoPago(metodo string) string {
	switch strings.ToLower(strings.TrimSpace(metodo)) {
	case "pasarela", "wompi", "tarjeta", "pse":
		return "pasarela"
	case "transferencia", "transfer", "qr":
		return "transferencia"
	default:
		return "manual"
	}
}

// PagarCuota marca una cuota como pagada (registro manual desde el panel).
// POST /api/v1/facturas/:id/cuotas/:numero/pagar
func PagarCuota(c *fiber.Ctx) error {
	id := c.Params("id")
	numero := c.Params("numero")
	usuarioID, _ := c.Locals("usuario_id").(string)

	var body struct {
		MetodoPago string `json:"metodo_pago"`
		Referencia string `json:"referencia"`
	}
	_ = c.BodyParser(&body)

	var existe string
	if err := config.DB.QueryRow(`SELECT id FROM facturas WHERE id = $1 AND usuario_id = $2`, id, usuarioID).Scan(&existe); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}

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

	return c.JSON(fiber.Map{"mensaje": "Cuota marcada como pagada", "factura_id": id, "cuota": numero})
}

// actualizarEstadoFactura marca la factura como pagada si no quedan cuotas pendientes.
func actualizarEstadoFactura(facturaID string) {
	_, _ = config.DB.Exec(
		`UPDATE facturas SET estado = 'pagada'
		  WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM cuotas WHERE factura_id = $1 AND estado <> 'pagada')`,
		facturaID,
	)
}

// ObtenerFacturaPublica devuelve la factura y sus cuotas a partir del token público.
// GET /api/v1/public/facturas/:token
func ObtenerFacturaPublica(c *fiber.Ctx) error {
	token := c.Params("token")

	var f models.Factura
	var usuarioID sql.NullString
	var concepto, bancoNombre, bancoCuenta, bancoTitular, qrPayload sql.NullString
	err := config.DB.QueryRow(
		`SELECT f.id, f.usuario_id, f.cliente_nombre, f.cliente_email, f.concepto, f.monto,
		        COALESCE(f.moneda, 'COP'), COALESCE(f.cuotas, 1), f.fecha_vencimiento, f.estado,
		        f.pago_link, f.pago_qr, f.pago_transfer, f.banco_nombre, f.banco_cuenta,
		        f.banco_titular, f.qr_payload, f.token_publico, u.email
		   FROM facturas f
		   JOIN usuarios u ON u.id = f.usuario_id
		  WHERE f.token_publico = $1`,
		token,
	).Scan(&f.ID, &usuarioID, &f.ClienteNombre, &f.ClienteEmail, &concepto, &f.Monto,
		&f.Moneda, &f.Cuotas, &f.FechaVencimiento, &f.Estado,
		&f.PagoLink, &f.PagoQR, &f.PagoTransfer, &bancoNombre, &bancoCuenta,
		&bancoTitular, &qrPayload, &f.TokenPublico, &f.ClienteEmail)
	if err == sql.ErrNoRows {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Enlace de pago no válido"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando la factura", "detalle": err.Error()})
	}

	f.UsuarioID = usuarioID.String
	f.Concepto = concepto.String
	f.BancoNombre = bancoNombre.String
	f.BancoCuenta = bancoCuenta.String
	f.BancoTitular = bancoTitular.String
	f.QRPayload = qrPayload.String

	rows, err := config.DB.Query(
		`SELECT id, factura_id, numero, monto, fecha_vencimiento, estado, notificado,
		        to_char(pagada_en, 'YYYY-MM-DD"T"HH24:MI:SSOF'), COALESCE(metodo_pago, ''),
		        COALESCE(referencia_pago, '')
		   FROM cuotas WHERE factura_id = $1 ORDER BY numero ASC`,
		f.ID,
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudieron obtener las cuotas"})
	}
	defer rows.Close()

	cuotas := []models.Cuota{}
	var pagado float64
	for rows.Next() {
		var cu models.Cuota
		var pagadaEn sql.NullString
		if err := rows.Scan(&cu.ID, &cu.FacturaID, &cu.Numero, &cu.Monto, &cu.FechaVencimiento,
			&cu.Estado, &cu.Notificado, &pagadaEn, &cu.MetodoPago, &cu.ReferenciaPago); err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error leyendo las cuotas"})
		}
		if pagadaEn.Valid {
			cu.PagadaEn = &pagadaEn.String
		}
		if cu.Estado == "pagada" {
			pagado += cu.Monto
		}
		cuotas = append(cuotas, cu)
	}

	completarTotales(&f, pagado)

	return c.JSON(fiber.Map{"factura": f, "cuotas": cuotas})
}

// PagarCuotaPublica registra el pago de una cuota desde el portal del cliente.
// POST /api/v1/public/facturas/:token/cuotas/:numero/pagar
func PagarCuotaPublica(c *fiber.Ctx) error {
	token := c.Params("token")
	numero := c.Params("numero")

	var body struct {
		MetodoPago string `json:"metodo_pago"`
		Referencia string `json:"referencia"`
	}
	_ = c.BodyParser(&body)

	var facturaID string
	if err := config.DB.QueryRow(`SELECT id FROM facturas WHERE token_publico = $1`, token).Scan(&facturaID); err != nil {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Enlace de pago no válido"})
	}

	res, err := config.DB.Exec(
		`UPDATE cuotas SET estado = 'pagada', pagada_en = CURRENT_TIMESTAMP,
		        metodo_pago = $3, referencia_pago = NULLIF($4, '')
		  WHERE factura_id = $1 AND numero = $2 AND estado <> 'pagada'`,
		facturaID, numero, normalizarMetodoPago(body.MetodoPago), strings.TrimSpace(body.Referencia),
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo registrar el pago", "detalle": err.Error()})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Cuota no encontrada o ya pagada"})
	}

	actualizarEstadoFactura(facturaID)

	return c.JSON(fiber.Map{"mensaje": "Pago registrado. El comercio lo verificará.", "cuota": numero})
}
