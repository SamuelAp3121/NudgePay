package middleware

import (
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// CORS permite que el frontend (Next.js) consuma la API desde otro origen.
// Orígenes permitidos: variable CORS_ORIGINS (separados por coma) o, por defecto,
// los puertos típicos de desarrollo de Next.js.
func CORS() fiber.Handler {
	allowed := os.Getenv("CORS_ORIGINS")
	if allowed == "" {
		allowed = "https://toquepay.vercel.app"
	}

	origins := map[string]bool{}
	for _, origin := range strings.Split(allowed, ",") {
		if trimmed := strings.TrimSpace(origin); trimmed != "" {
			origins[trimmed] = true
		}
	}

	return func(c *fiber.Ctx) error {
		origin := c.Get("Origin")

		if origin != "" && origins[origin] {
			c.Set("Access-Control-Allow-Origin", origin)
			c.Set("Vary", "Origin")
			c.Set("Access-Control-Allow-Credentials", "true")
			c.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Set("Access-Control-Allow-Headers", "Content-Type, Accept, X-API-Key")
			c.Set("Access-Control-Max-Age", "86400")
		}

		if c.Method() == fiber.MethodOptions {
			return c.SendStatus(fiber.StatusNoContent)
		}

		return c.Next()
	}
}
