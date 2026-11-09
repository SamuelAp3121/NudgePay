package handlers

import (
	"database/sql"
	"errors"
	"invoice-reminder/config"
	"invoice-reminder/services"
	"log"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
)

// EnviarRecordatorio envía ahora mismo el recordatorio de la próxima cuota pendiente de una factura.
// POST /api/v1/facturas/:id/recordatorio
func EnviarRecordatorio(c *fiber.Ctx) error {
	id := c.Params("id")
	usuarioID, _ := c.Locals("usuario_id").(string)
	plan, _ := c.Locals("plan").(string)

	var nombre, email, estado, moneda string
	var montoTotal float64
	var cuotas int
	err := config.DB.QueryRow(
		`SELECT cliente_nombre, cliente_email, estado, monto, COALESCE(moneda, 'COP'), COALESCE(cuotas, 1)
		   FROM facturas WHERE id = $1 AND usuario_id = $2`,
		id, usuarioID,
	).Scan(&nombre, &email, &estado, &montoTotal, &moneda, &cuotas)
	if err == sql.ErrNoRows {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Factura no encontrada"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando la factura", "detalle": err.Error()})
	}

	if estado == "pagada" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "La factura ya está pagada"})
	}

	// Próxima cuota pendiente (la de vencimiento más cercano).
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

	// Límite del plan gratuito: recordatorios enviados en el mes en curso.
	// Se cuenta el histórico, así que borrar facturas NO devuelve cupo.
	if plan != "pro" {
		if usados := RecordatoriosUsadosMes(usuarioID); usados >= LimiteRecordatoriosFree {
			return c.Status(http.StatusPaymentRequired).JSON(fiber.Map{
				"error": "Límite del plan gratuito alcanzado (20 recordatorios/mes). Actualiza a Pro para continuar.",
			})
		}
	}

	plantilla := PlantillaDelUsuario(usuarioID)

	datos := services.DatosRecordatorio{
		ClienteNombre: nombre,
		Monto:         montoCuota,
		Moneda:        moneda,
		Fecha:         vencimiento,
		CuotaNumero:   numero,
		CuotasTotal:   cuotas,
		MontoTotal:    montoTotal,
	}

	if err := services.EnviarRecordatorioEmail(email, datos, plantilla); err != nil {
		if errors.Is(err, services.ErrEmailNoConfigurado) {
			return c.Status(http.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "No se pudo enviar el email", "detalle": err.Error()})
	}

	// Histórico de consumo (fuente de verdad del plan).
	if err := RegistrarRecordatorioEnviado(usuarioID, id, cuotaID, email); err != nil {
		log.Printf("⚠️  No se pudo registrar el recordatorio enviado (usuario %s): %v", usuarioID, err)
	}

	_, _ = config.DB.Exec(`UPDATE cuotas SET notificado = true WHERE factura_id = $1 AND numero = $2`, id, numero)
	_, _ = config.DB.Exec(`UPDATE facturas SET notificado = true WHERE id = $1`, id)

	return c.JSON(fiber.Map{
		"mensaje":         "Recordatorio enviado",
		"id":              id,
		"email":           email,
		"cuota":           numero,
		"enviado":         time.Now().Format(time.RFC3339),
		"mensaje_enviado": services.RenderizarPlantilla(plantilla, datos),
	})
}

// EnviarEmailPrueba envía un correo de prueba al email del usuario autenticado.
// POST /api/v1/email/test
func EnviarEmailPrueba(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var email string
	if err := config.DB.QueryRow(`SELECT email FROM usuarios WHERE id = $1`, usuarioID).Scan(&email); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo obtener el email del usuario"})
	}

	if err := services.EnviarEmailPrueba(email); err != nil {
		if errors.Is(err, services.ErrEmailNoConfigurado) {
			return c.Status(http.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "No se pudo enviar el email de prueba", "detalle": err.Error()})
	}

	return c.JSON(fiber.Map{"mensaje": "Email de prueba enviado", "email": email})
}
