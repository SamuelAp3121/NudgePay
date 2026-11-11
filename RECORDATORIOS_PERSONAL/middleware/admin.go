package middleware

import (
	"net/http"

	"github.com/gofiber/fiber/v2"
)

// RolAdmin es el valor de usuarios.rol que habilita el panel de administración.
const RolAdmin = "admin"

// AdminMiddleware exige que la petición venga de un administrador.
// Debe usarse SIEMPRE después de AuthMiddleware (que deja "rol" en el contexto).
func AdminMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		rol, _ := c.Locals("rol").(string)
		if rol != RolAdmin {
			return c.Status(http.StatusForbidden).JSON(fiber.Map{
				"error": "Acceso restringido: se requiere rol de administrador.",
			})
		}
		return c.Next()
	}
}

// EsAdmin indica si el rol del contexto es administrador.
func EsAdmin(c *fiber.Ctx) bool {
	rol, _ := c.Locals("rol").(string)
	return rol == RolAdmin
}
