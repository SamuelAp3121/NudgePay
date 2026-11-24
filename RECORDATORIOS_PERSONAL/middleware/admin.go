package middleware

import (
	"invoice-reminder/config"
	"log"
	"net/http"
	"sync"

	"github.com/gofiber/fiber/v2"
)

// RolAdmin es el valor de usuarios.rol que habilita el panel de administración.
const RolAdmin = "admin"

// warnAdminUnaVez evita inundar los logs: el aviso de migración sale una sola vez por proceso.
var warnAdminUnaVez sync.Once

// AdminMiddleware exige que la petición venga de un administrador.
// Debe usarse SIEMPRE después de AuthMiddleware (que deja "rol" en el contexto).
func AdminMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Si la base no tiene la columna rol (migración pendiente), nadie puede
		// ser admin. Se avisa una sola vez para que el fallo sea diagnosable
		// sin llenar los logs en cada petición al panel.
		if !config.MigracionAdminAplicada() {
			warnAdminUnaVez.Do(func() {
				log.Println("AdminMiddleware bloqueado: falta la migración admin en la base de datos. Aplica fix_admin_migration.sql (o migracion_produccion.sql) y reinicia el backend.")
			})
			return c.Status(http.StatusForbidden).JSON(fiber.Map{
				"error": "Panel no disponible: falta aplicar la migración admin en la base de datos.",
			})
		}
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
