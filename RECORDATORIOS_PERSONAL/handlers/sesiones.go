package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"invoice-reminder/config"
	"invoice-reminder/middleware"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// DuracionSesion es cuánto dura una sesión iniciada.
const DuracionSesion = 7 * 24 * time.Hour

// generarToken devuelve un token aleatorio de 32 bytes en hex.
func generarToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// crearSesion inserta una sesión nueva y devuelve su token.
func crearSesion(usuarioID string) (string, error) {
	token, err := generarToken()
	if err != nil {
		return "", err
	}

	_, err = config.DB.Exec(
		`INSERT INTO sesiones (token, usuario_id, expira_en) VALUES ($1, $2, $3)`,
		token, usuarioID, time.Now().Add(DuracionSesion),
	)
	if err != nil {
		return "", err
	}
	return token, nil
}

// setSessionCookie escribe la cookie HttpOnly de sesión.
func setSessionCookie(c *fiber.Ctx, token string) {
	c.Cookie(&fiber.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(DuracionSesion),
		MaxAge:   int(DuracionSesion.Seconds()),
		HTTPOnly: true,
		Secure:   os.Getenv("COOKIE_SECURE") == "true",
		SameSite: "Lax",
	})
}

// clearSessionCookie elimina la cookie de sesión.
func clearSessionCookie(c *fiber.Ctx) {
	c.Cookie(&fiber.Cookie{
		Name:     middleware.SessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Now().Add(-time.Hour),
		MaxAge:   -1,
		HTTPOnly: true,
		Secure:   os.Getenv("COOKIE_SECURE") == "true",
		SameSite: "Lax",
	})
}

// perfilUsuario arma la respuesta de /me y /login.
func perfilUsuario(usuarioID string) (fiber.Map, error) {
	var email, apiKey string
	var plan sql.NullString
	err := config.DB.QueryRow(`SELECT email, api_key, plan FROM usuarios WHERE id = $1`, usuarioID).
		Scan(&email, &apiKey, &plan)
	if err != nil {
		return nil, err
	}

	planActual := plan.String
	if planActual == "" {
		planActual = "free"
	}

	limite := LimiteRecordatoriosFree
	if planActual == "pro" {
		limite = -1
	}

	return fiber.Map{
		"id":                   usuarioID,
		"email":                email,
		"api_key":              apiKey,
		"plan":                 planActual,
		"recordatorios_usados": RecordatoriosUsadosMes(usuarioID),
		"limite_recordatorios": limite,
	}, nil
}

// Login valida email + contraseña y abre una sesión (cookie HttpOnly).
// POST /api/v1/auth/login  { "email": "...", "password": "..." }
func Login(c *fiber.Ctx) error {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || body.Password == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "Email y contraseña son obligatorios"})
	}

	var usuarioID string
	var hash sql.NullString
	err := config.DB.QueryRow(`SELECT id, password_hash FROM usuarios WHERE lower(email) = $1`, email).
		Scan(&usuarioID, &hash)
	if err == sql.ErrNoRows {
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "Email o contraseña incorrectos"})
	}
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "Error consultando el usuario", "detalle": err.Error()})
	}

	if !hash.Valid || hash.String == "" {
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{
			"error": "Esta cuenta aún no tiene contraseña. Usa '¿Olvidaste tu contraseña?' para crearla.",
		})
	}

	if !verificarPassword(body.Password, hash.String) {
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "Email o contraseña incorrectos"})
	}

	token, err := crearSesion(usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo iniciar la sesión", "detalle": err.Error()})
	}
	setSessionCookie(c, token)

	perfil, err := perfilUsuario(usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cargar el perfil"})
	}

	return c.JSON(fiber.Map{"mensaje": "Sesión iniciada", "usuario": perfil})
}

// Logout cierra la sesión actual y borra la cookie.
// POST /api/v1/auth/logout
func Logout(c *fiber.Ctx) error {
	if token := c.Cookies(middleware.SessionCookieName); token != "" {
		_, _ = config.DB.Exec(`DELETE FROM sesiones WHERE token = $1`, token)
	}
	clearSessionCookie(c)
	return c.JSON(fiber.Map{"mensaje": "Sesión cerrada"})
}

// SesionActual devuelve el usuario de la sesión activa.
// GET /api/v1/auth/me
func SesionActual(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)
	perfil, err := perfilUsuario(usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cargar el perfil"})
	}
	return c.JSON(fiber.Map{"usuario": perfil})
}

// CambiarPassword actualiza la contraseña del usuario autenticado.
// POST /api/v1/auth/password  { "password_actual": "...", "password_nueva": "..." }
func CambiarPassword(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var body struct {
		PasswordActual string `json:"password_actual"`
		PasswordNueva  string `json:"password_nueva"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	if err := validarPassword(body.PasswordNueva); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var hash sql.NullString
	if err := config.DB.QueryRow(`SELECT password_hash FROM usuarios WHERE id = $1`, usuarioID).Scan(&hash); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo cargar el usuario"})
	}

	if hash.Valid && hash.String != "" && !verificarPassword(body.PasswordActual, hash.String) {
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "La contraseña actual no es correcta"})
	}

	nuevoHash, err := hashearPassword(body.PasswordNueva)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la contraseña"})
	}

	if _, err := config.DB.Exec(`UPDATE usuarios SET password_hash = $1 WHERE id = $2`, nuevoHash, usuarioID); err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo actualizar la contraseña"})
	}

	// Cierra el resto de sesiones por seguridad (mantiene la actual).
	if token := c.Cookies(middleware.SessionCookieName); token != "" {
		_, _ = config.DB.Exec(`DELETE FROM sesiones WHERE usuario_id = $1 AND token <> $2`, usuarioID, token)
	}

	return c.JSON(fiber.Map{"mensaje": "Contraseña actualizada"})
}
