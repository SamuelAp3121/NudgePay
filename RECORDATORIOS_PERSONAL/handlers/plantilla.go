package handlers

import (
	"database/sql"
	"invoice-reminder/config"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// PlantillaMensajePorDefecto es el texto usado cuando el usuario no ha personalizado su plantilla.
const PlantillaMensajePorDefecto = "Hola {nombre}, tienes una factura pendiente por ${monto} con fecha límite {fecha}."

// PlantillaMensajeMaxLen limita el tamaño de la plantilla guardada.
const PlantillaMensajeMaxLen = 2000

// ObtenerPlantilla devuelve la plantilla de mensaje del usuario autenticado.
// GET /api/v1/plantilla
func ObtenerPlantilla(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var plantilla sql.NullString
	err := config.DB.QueryRow(`SELECT plantilla_mensaje FROM usuarios WHERE id = $1`, usuarioID).Scan(&plantilla)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo obtener la plantilla", "detalle": err.Error()})
	}

	valor := strings.TrimSpace(plantilla.String)
	if valor == "" {
		valor = PlantillaMensajePorDefecto
	}

	return c.JSON(fiber.Map{
		"plantilla_mensaje": valor,
		"por_defecto":       PlantillaMensajePorDefecto,
		"variables":         []string{"{nombre}", "{monto}", "{fecha}"},
	})
}

// ActualizarPlantilla guarda la plantilla de mensaje del usuario autenticado.
// PUT /api/v1/plantilla  { "plantilla_mensaje": "Hola {nombre}, ..." }
func ActualizarPlantilla(c *fiber.Ctx) error {
	usuarioID, _ := c.Locals("usuario_id").(string)

	var body struct {
		PlantillaMensaje string `json:"plantilla_mensaje"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "JSON inválido"})
	}

	plantilla := strings.TrimSpace(body.PlantillaMensaje)
	if plantilla == "" {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "La plantilla no puede estar vacía"})
	}
	if len([]rune(plantilla)) > PlantillaMensajeMaxLen {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "La plantilla es demasiado larga (máximo 2000 caracteres)"})
	}

	res, err := config.DB.Exec(`UPDATE usuarios SET plantilla_mensaje = $1 WHERE id = $2`, plantilla, usuarioID)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "No se pudo guardar la plantilla", "detalle": err.Error()})
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "Usuario no encontrado"})
	}

	return c.JSON(fiber.Map{
		"mensaje":           "Plantilla actualizada",
		"plantilla_mensaje": plantilla,
	})
}

// PlantillaDelUsuario devuelve la plantilla configurada o la de por defecto.
func PlantillaDelUsuario(usuarioID string) string {
	var plantilla sql.NullString
	if err := config.DB.QueryRow(`SELECT plantilla_mensaje FROM usuarios WHERE id = $1`, usuarioID).Scan(&plantilla); err != nil {
		return PlantillaMensajePorDefecto
	}
	if valor := strings.TrimSpace(plantilla.String); valor != "" {
		return valor
	}
	return PlantillaMensajePorDefecto
}
