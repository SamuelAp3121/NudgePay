package handlers

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"invoice-reminder/config"
	"invoice-reminder/services"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// DuracionCodigo es cuánto tiempo es válido un código de recuperación.
const DuracionCodigo = 15 * time.Minute

// MaxIntentosCodigo limita los intentos fallidos por código.
const MaxIntentosCodigo = 5

// generarCodigo crea un código numérico de 6 dígitos.
func generarCodigo() (string, error) {
	max := big.NewInt(1000000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	codigo := n.String()
	for len(codigo) < 6 {
		codigo = "0" + codigo
	}
	return codigo, nil
}

// SolicitarRecuperacion envía un código de 6 dígitos al email indicado.
// POST /api/v1/auth/forgot-password  { "email": "..." }
// Responde 200 siempre para no revelar si el email existe.
func SolicitarRecuperacion(c *fiber.Ctx) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || !emailRegex.MatchString(email) {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Introduce un email válido"})
	}

	respuesta := fiber.Map{
		"mensaje": "Si el correo está registrado, recibirás un código de recuperación en unos segundos.",
	}

	var usuarioID string
	err := config.DB.QueryRow(`SELECT id FROM usuarios WHERE lower(email) = $1`, email).Scan(&usuarioID)
	if err == sql.ErrNoRows {
		return c.JSON(respuesta)
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando el usuario"})
	}

	codigo, err := generarCodigo()
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo generar el código"})
	}

	// Invalida códigos anteriores y guarda el nuevo.
	_, _ = config.DB.Exec(`UPDATE codigos_recuperacion SET usado = true WHERE usuario_id = $1 AND usado = false`, usuarioID)
	_, err = config.DB.Exec(
		`INSERT INTO codigos_recuperacion (usuario_id, codigo, expira_en) VALUES ($1, $2, $3)`,
		usuarioID, codigo, time.Now().Add(DuracionCodigo),
	)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo guardar el código", "detalle": err.Error()})
	}

	if err := services.EnviarCodigoRecuperacionEmail(email, codigo, int(DuracionCodigo.Minutes())); err != nil {
		if errors.Is(err, services.ErrEmailNoConfigurado) {
			return c.Status(http.StatusServiceUnavailable).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "No se pudo enviar el código por email", "detalle": err.Error()})
	}

	return c.JSON(respuesta)
}

// RestablecerPassword valida el código y define la nueva contraseña.
// POST /api/v1/auth/reset-password  { "email": "...", "codigo": "123456", "password_nueva": "..." }
func RestablecerPassword(c *fiber.Ctx) error {
	var body struct {
		Email         string `json:"email"`
		Codigo        string `json:"codigo"`
		PasswordNueva string `json:"password_nueva"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	codigo := strings.TrimSpace(body.Codigo)

	if email == "" || codigo == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Email y código son obligatorios"})
	}
	if err := validarPassword(body.PasswordNueva); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var usuarioID string
	err := config.DB.QueryRow(`SELECT id FROM usuarios WHERE lower(email) = $1`, email).Scan(&usuarioID)
	if err == sql.ErrNoRows {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Código inválido o expirado"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando el usuario"})
	}

	var codigoID string
	var intentos int
	err = config.DB.QueryRow(
		`SELECT id, intentos FROM codigos_recuperacion
		  WHERE usuario_id = $1 AND codigo = $2 AND usado = false AND expira_en > CURRENT_TIMESTAMP
		  ORDER BY creado_en DESC LIMIT 1`,
		usuarioID, codigo,
	).Scan(&codigoID, &intentos)
	if err == sql.ErrNoRows {
		// Cuenta el intento fallido sobre el último código activo.
		_, _ = config.DB.Exec(
			`UPDATE codigos_recuperacion SET intentos = intentos + 1
			  WHERE id = (SELECT id FROM codigos_recuperacion
			               WHERE usuario_id = $1 AND usado = false
			               ORDER BY creado_en DESC LIMIT 1)`,
			usuarioID,
		)
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Código inválido o expirado"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error validando el código"})
	}

	if intentos >= MaxIntentosCodigo {
		return c.Status(http.StatusTooManyRequests).JSON(fiber.Map{"error": "Demasiados intentos. Solicita un código nuevo."})
	}

	nuevoHash, err := hashearPassword(body.PasswordNueva)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la contraseña"})
	}

	if _, err := config.DB.Exec(`UPDATE usuarios SET password_hash = $1 WHERE id = $2`, nuevoHash, usuarioID); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la contraseña"})
	}

	_, _ = config.DB.Exec(`UPDATE codigos_recuperacion SET usado = true WHERE id = $1`, codigoID)
	// Cierra todas las sesiones abiertas de esa cuenta.
	_, _ = config.DB.Exec(`DELETE FROM sesiones WHERE usuario_id = $1`, usuarioID)

	log.Printf("🔑 Contraseña restablecida para %s", email)

	return c.JSON(fiber.Map{"mensaje": "Contraseña actualizada. Ya puedes iniciar sesión."})
}
