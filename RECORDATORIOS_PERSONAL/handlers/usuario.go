package handlers

import (
	"invoice-reminder/config"
	"net/http"

	"github.com/gofiber/fiber/v2"
)

// LimiteRecordatoriosFree es el máximo de recordatorios mensuales del plan gratuito.
const LimiteRecordatoriosFree = 20

// RecordatoriosUsadosMes cuenta los recordatorios enviados por el usuario en el mes en curso.
//
// IMPORTANTE: se cuenta sobre la tabla `recordatorios_enviados` (registro histórico),
// NO sobre `facturas.notificado`. Si se contara sobre las facturas, borrar una factura
// devolvería el cupo consumido y el usuario tendría recordatorios infinitos.
func RecordatoriosUsadosMes(usuarioID string) int {
	var usados int
	_ = config.DB.QueryRow(
		`SELECT COUNT(*) FROM recordatorios_enviados
		  WHERE usuario_id = $1
		    AND date_trunc('month', enviado_en) = date_trunc('month', CURRENT_TIMESTAMP)`,
		usuarioID,
	).Scan(&usados)
	return usados
}

// RegistrarRecordatorioEnviado guarda en el histórico cada recordatorio enviado.
// Es la fuente de verdad del consumo del plan: no se borra al eliminar facturas.
// El canal por defecto es 'email' (compatibilidad con llamadas antiguas).
func RegistrarRecordatorioEnviado(usuarioID, facturaID, cuotaID, email string) error {
	return RegistrarRecordatorioCanal(usuarioID, facturaID, cuotaID, email, "email", "enviado", "")
}

// RegistrarRecordatorioCanal guarda un recordatorio indicando canal, estado y error.
// canal: email | whatsapp. estado: enviado | fallido.
func RegistrarRecordatorioCanal(usuarioID, facturaID, cuotaID, destino, canal, estado, mensajeError string) error {
	if canal == "" {
		canal = "email"
	}
	if estado == "" {
		estado = "enviado"
	}
	_, err := config.DB.Exec(
		`INSERT INTO recordatorios_enviados (usuario_id, factura_id, cuota_id, email_destino, canal, estado, error)
		 VALUES ($1, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, $4, $5, $6, NULLIF($7, ''))`,
		usuarioID, facturaID, cuotaID, destino, canal, estado, mensajeError,
	)
	return err
}

// ObtenerPerfil devuelve los datos del usuario autenticado: plan, API Key y uso.
// GET /api/v1/me
func ObtenerPerfil(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	perfil, err := perfilUsuario(usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo obtener el perfil", "detalle": err.Error()})
	}

	return c.JSON(perfil)
}

// RegenerarAPIKey crea una API Key nueva (invalida la anterior).
// POST /api/v1/api-key/regenerar
func RegenerarAPIKey(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	nueva, err := generarAPIKey()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar la API Key"})
	}

	res, err := config.DB.Exec(`UPDATE usuarios SET api_key = $1 WHERE id = $2`, nueva, usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo guardar la API Key", "detalle": err.Error()})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}

	return c.JSON(fiber.Map{"mensaje": "API Key regenerada", "api_key": nueva})
}
