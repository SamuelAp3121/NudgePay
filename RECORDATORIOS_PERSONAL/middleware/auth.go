package middleware

import (
	"database/sql"
	"invoice-reminder/config"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// SessionCookieName es el nombre de la cookie HttpOnly que identifica la sesión.
const SessionCookieName = "ir_session"

// AuthMiddleware autentica la petición de dos formas:
//  1. Cookie de sesión HttpOnly (la que usa el panel web).
//  2. Header X-API-Key (solo para integraciones / scripts).
//
// Deja en el contexto: usuario_id, usuario_email y plan.
func AuthMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// 1) Sesión por cookie
		if token := c.Cookies(SessionCookieName); token != "" {
			var usuarioID, email string
			var plan sql.NullString
			err := config.DB.QueryRow(
				`SELECT u.id, u.email, u.plan
				   FROM sesiones s
				   JOIN usuarios u ON u.id = s.usuario_id
				  WHERE s.token = $1 AND s.expira_en > CURRENT_TIMESTAMP`,
				token,
			).Scan(&usuarioID, &email, &plan)

			if err == nil {
				c.Locals("usuario_id", usuarioID)
				c.Locals("usuario_email", email)
				c.Locals("plan", planOrFree(plan))
				return c.Next()
			}
			if err != sql.ErrNoRows {
				return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error validando la sesión"})
			}
			// Token inválido o expirado: se ignora y se intenta con la API Key.
		}

		// 2) API Key (integraciones)
		apiKey := strings.TrimSpace(c.Get("X-API-Key"))
		if apiKey == "" {
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "No autenticado. Inicia sesión o envía el header X-API-Key."})
		}

		var usuarioID, email string
		var plan sql.NullString
		err := config.DB.QueryRow(
			`SELECT id, email, plan FROM usuarios WHERE api_key = $1`,
			apiKey,
		).Scan(&usuarioID, &email, &plan)
		if err == sql.ErrNoRows {
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "API Key inválida"})
		}
		if err != nil {
			return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error validando la API Key"})
		}

		c.Locals("usuario_id", usuarioID)
		c.Locals("usuario_email", email)
		c.Locals("plan", planOrFree(plan))
		return c.Next()
	}
}

func planOrFree(plan sql.NullString) string {
	if plan.String == "" {
		return "free"
	}
	return plan.String
}
