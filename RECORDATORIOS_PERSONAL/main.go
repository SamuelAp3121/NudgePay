package main

import (
	"log"
	"os"
	"time"

	"invoice-reminder/config"
	"invoice-reminder/handlers"
	"invoice-reminder/middleware"
	"invoice-reminder/services"

	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"github.com/robfig/cron/v3"
)

func main() {
	_ = godotenv.Load() // Carga .env en desarrollo local
	config.ConnectDB()

	// 1. INICIAR EL PROGRAMADOR DE TAREAS (CRON)
	c := cron.New()
	// Corre diariamente a las 8:00 AM ("0 8 * * *"). Para pruebas rapidas usa "@every 1m"
	_, err := c.AddFunc("0 8 * * *", procesarRecordatoriosDiarios)
	if err != nil {
		log.Fatal("Error iniciando Cron:", err)
	}
	c.Start()

	// 2. SERVIDOR HTTP CON FIBER
	app := fiber.New()

	// CORS: permite que el frontend de Next.js llame a la API desde otro origen.
	app.Use(middleware.CORS())

	// Health check: 200 si la API y la base de datos estan operativas (ideal para produccion).
	app.Get("/health", func(c *fiber.Ctx) error {
		if !config.DBDisponible() {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status":   "error",
				"database": "inaccesible",
			})
		}
		return c.JSON(fiber.Map{"status": "ok", "database": "ok"})
	})
	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString("Bienvenido al servicio de recordatorios de facturas.")
	})

	// --- Autenticacion (publica) ---
	app.Post("/api/v1/register", handlers.RegistrarUsuario)
	app.Post("/api/v1/auth/login", handlers.Login)
	app.Post("/api/v1/auth/logout", handlers.Logout)
	app.Post("/api/v1/auth/forgot-password", handlers.SolicitarRecuperacion)
	app.Post("/api/v1/auth/reset-password", handlers.RestablecerPassword)

	// --- Portal publico del cliente (sin sesion: se accede con el token del enlace) ---
	app.Get("/public/facturas/:token", handlers.ObtenerFacturaPublica)
	app.Post("/public/facturas/:token/cuotas/:numero/pagar", handlers.PagarCuotaPublica)

	// --- Webhook de la pasarela de pagos (lo llama el proveedor) ---
	app.Post("/webhook", handlers.HandleWebhook)

	// --- Rutas protegidas (cookie de sesion o X-API-Key) ---
	api := app.Group("/api/v1", middleware.AuthMiddleware())
	api.Get("/auth/me", handlers.SesionActual)
	api.Post("/auth/password", handlers.CambiarPassword)
	api.Get("/me", handlers.ObtenerPerfil)
	api.Post("/api-key/regenerar", handlers.RegenerarAPIKey)
	api.Get("/plantilla", handlers.ObtenerPlantilla)
	api.Put("/plantilla", handlers.ActualizarPlantilla)
	api.Get("/facturas", handlers.ListarFacturas)
	api.Post("/facturas", handlers.CrearFactura)
	api.Get("/facturas/:id/cuotas", handlers.ObtenerCuotas)
	api.Get("/facturas/:id/pagos", handlers.ListarPagos)
	api.Post("/facturas/:id/cuotas/:numero/pagar", handlers.PagarCuota)
	api.Post("/facturas/:id/pagar", handlers.MarcarPagada)
	api.Post("/facturas/:id/recordatorio", handlers.EnviarRecordatorio)
	api.Delete("/facturas/:id", handlers.EliminarFactura)
	api.Post("/email/test", handlers.EnviarEmailPrueba)
	api.Get("/billing/suscripcion", handlers.ObtenerSuscripcion)
	api.Post("/billing/checkout", handlers.CrearCheckout)
	api.Post("/billing/simular", handlers.SimularPagoPro)
	api.Post("/billing/cancelar", handlers.CancelarSuscripcion)

	// --- Panel de administracion (soporte): requiere rol = 'admin' ---
	admin := app.Group("/api/v1/admin", middleware.AuthMiddleware(), middleware.AdminMiddleware())
	admin.Get("/resumen", handlers.AdminResumen)
	admin.Get("/sistema", handlers.AdminEstadoSistema)
	admin.Get("/auditoria", handlers.AdminAuditoria)

	admin.Get("/usuarios", handlers.AdminListarUsuarios)
	admin.Get("/usuarios/:id", handlers.AdminDetalleUsuario)
	admin.Patch("/usuarios/:id/plan", handlers.AdminCambiarPlan)
	admin.Patch("/usuarios/:id/suspender", handlers.AdminSuspenderUsuario)
	admin.Patch("/usuarios/:id/rol", handlers.AdminCambiarRol)
	admin.Post("/usuarios/:id/password", handlers.AdminResetPassword)
	admin.Post("/usuarios/:id/cerrar-sesiones", handlers.AdminCerrarSesiones)
	admin.Post("/usuarios/:id/impersonar", handlers.AdminImpersonar)
	admin.Post("/salir-impersonacion", handlers.AdminSalirImpersonacion)

	admin.Get("/facturas", handlers.AdminListarFacturas)
	admin.Get("/facturas/:id/cuotas", handlers.AdminCuotasFactura)
	admin.Post("/facturas/:id/cuotas/:numero/pagar", handlers.AdminMarcarCuotaPagada)
	admin.Post("/facturas/:id/cuotas/:numero/revertir", handlers.AdminRevertirCuota)
	admin.Post("/facturas/:id/pagar", handlers.AdminMarcarFacturaPagada)
	admin.Delete("/facturas/:id", handlers.AdminEliminarFactura)

	admin.Get("/pagos", handlers.AdminListarPagos)

	admin.Get("/suscripciones", handlers.AdminListarSuscripciones)
	admin.Post("/suscripciones/:referencia/activar", handlers.AdminActivarSuscripcion)
	admin.Post("/suscripciones/:referencia/cancelar", handlers.AdminCancelarSuscripcion)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Fatal(app.Listen(":" + port))
}

// Procesa las cuotas cuya fecha de vencimiento sea dentro de los proximos 3 dias o ya vencieron.
// Respeta el limite mensual del plan gratuito de cada usuario.
func procesarRecordatoriosDiarios() {
	log.Println("[CRON] Buscando cuotas pendientes por notificar...")

	query := `SELECT cu.id, cu.numero, cu.monto, cu.fecha_vencimiento,
	                 f.id, f.cliente_nombre, f.cliente_email, f.monto, COALESCE(f.moneda, 'COP'),
	                 COALESCE(f.cuotas, 1), COALESCE(f.usuario_id::text, ''), COALESCE(u.plan, 'free')
	          FROM cuotas cu
	          JOIN facturas f ON f.id = cu.factura_id
	          LEFT JOIN usuarios u ON u.id = f.usuario_id
	          WHERE cu.estado <> 'pagada'
	            AND cu.notificado = false
	            AND f.estado <> 'pagada'
	            AND cu.fecha_vencimiento <= $1
	          ORDER BY cu.fecha_vencimiento ASC`

	limiteFecha := time.Now().AddDate(0, 0, 3).Format("2006-01-02")
	rows, err := config.DB.Query(query, limiteFecha)
	if err != nil {
		log.Println("Error consultando cuotas:", err)
		return
	}
	defer rows.Close()

	enviados := 0
	for rows.Next() {
		var cuotaID, facturaID, nombre, email, vencimiento, moneda, usuarioID, plan string
		var numero, cuotas int
		var montoCuota, montoTotal float64
		if err := rows.Scan(&cuotaID, &numero, &montoCuota, &vencimiento,
			&facturaID, &nombre, &email, &montoTotal, &moneda, &cuotas, &usuarioID, &plan); err != nil {
			continue
		}

		// Limite del plan gratuito por usuario.
		if plan != "pro" && usuarioID != "" && handlers.RecordatoriosUsadosMes(usuarioID) >= handlers.LimiteRecordatoriosFree {
			log.Printf("Limite Free alcanzado para el usuario %s; se omite la cuota %s", usuarioID, cuotaID)
			continue
		}

		plantilla := services.PlantillaMensajePorDefecto
		if usuarioID != "" {
			plantilla = handlers.PlantillaDelUsuario(usuarioID)
		}

		datos := services.DatosRecordatorio{
			ClienteNombre: nombre,
			Monto:         montoCuota,
			Moneda:        moneda,
			Fecha:         vencimiento,
			CuotaNumero:   numero,
			CuotasTotal:   cuotas,
			MontoTotal:    montoTotal,
		}

		if errEmail := services.EnviarRecordatorioEmail(email, datos, plantilla); errEmail == nil {
			// Historico de consumo: no se pierde al borrar facturas.
			if err := handlers.RegistrarRecordatorioEnviado(usuarioID, facturaID, cuotaID, email); err != nil {
				log.Printf("AVISO: no se pudo registrar el recordatorio enviado: %v", err)
			}
			_, _ = config.DB.Exec("UPDATE cuotas SET notificado = true WHERE id = $1", cuotaID)
			_, _ = config.DB.Exec("UPDATE facturas SET notificado = true WHERE id = $1", facturaID)
			enviados++
			log.Printf("Recordatorio enviado a %s (cuota %d/%d) por %s", email, numero, cuotas, services.FormatearMonto(montoCuota, moneda))
		} else {
			log.Printf("Error enviando a %s: %v", email, errEmail)
		}
	}

	log.Printf("[CRON] Recordatorios enviados: %d", enviados)
}
