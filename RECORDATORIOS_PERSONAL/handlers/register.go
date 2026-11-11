package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"invoice-reminder/config"
	"invoice-reminder/services"
	"log"
	"net/http"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
)

var emailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`)

// generarAPIKey crea una clave aleatoria con el formato ir_live_<32 hex>.
// Se mantiene para integraciones por API, pero el panel web ya no la usa.
func generarAPIKey() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "ir_live_" + hex.EncodeToString(buf), nil
}

// GenerarAPIKey expone la generación de claves para herramientas de administración.
func GenerarAPIKey() (string, error) {
	return generarAPIKey()
}

// RegistrarUsuario crea una cuenta con email + contraseña y abre la sesión.
// POST /api/v1/register  { "email": "...", "password": "..." }
func RegistrarUsuario(c *fiber.Ctx) error {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El email es obligatorio"})
	}
	if !emailRegex.MatchString(email) {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "El email no es válido"})
	}
	if err := validarPassword(body.Password); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	// ¿Ya existe?
	var existenteID string
	err := config.DB.QueryRow(`SELECT id FROM usuarios WHERE lower(email) = $1`, email).Scan(&existenteID)
	if err == nil {
		return c.Status(http.StatusConflict).JSON(fiber.Map{
			"error": "Este correo ya está registrado. Inicia sesión o recupera tu contraseña.",
		})
	}
	if err != sql.ErrNoRows {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando el usuario", "detalle": err.Error()})
	}

	passwordHash, err := hashearPassword(body.Password)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo procesar la contraseña"})
	}

	apiKey, err := generarAPIKey()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar la API Key"})
	}

	var id string
	err = config.DB.QueryRow(
		`INSERT INTO usuarios (email, api_key, password_hash, plan) VALUES ($1, $2, $3, 'free') RETURNING id`,
		email, apiKey, passwordHash,
	).Scan(&id)
	if err != nil {
		// Carrera: otro request registró el mismo email entre el SELECT y el INSERT.
		if strings.Contains(err.Error(), "duplicate key") {
			return c.Status(http.StatusConflict).JSON(fiber.Map{"error": "Este correo ya está registrado."})
		}
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo crear el usuario", "detalle": err.Error()})
	}

	// Email de bienvenida (no bloquea el registro si falla).
	go func() {
		if err := services.EnviarBienvenidaEmail(email); err != nil {
			log.Printf("⚠️  No se pudo enviar el email de bienvenida a %s: %v", email, err)
		}
	}()

	// Sesión iniciada automáticamente tras el registro.
	token, err := crearSesion(id)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Cuenta creada, pero no se pudo iniciar sesión. Inicia sesión manualmente."})
	}
	setSessionCookie(c, token)

	perfil, _ := perfilUsuario(id)

	return c.Status(http.StatusCreated).JSON(fiber.Map{
		"mensaje": "Usuario registrado exitosamente",
		"usuario": perfil,
	})
}
