package config

import (
	"log"
	"sync"
)

// ============================================================================
// COMPROBACIÓN DE MIGRACIONES
//
// El código nuevo (WhatsApp) consulta columnas añadidas por
// migrations/001_whatsapp.sql. Si esa migración no se aplicó, cada consulta
// fallaría y el panel entero se rompería.
//
// En vez de eso se comprueba una sola vez al arrancar y se avisa con claridad.
// ============================================================================

var (
	whatsappOnce  sync.Once
	adminOnce     sync.Once
	columnasCache = map[string]bool{}
	// NOTA: antes ambas comprobaciones compartían un único sync.Once, así que
	// la segunda que se ejecutaba (normalmente la de admin) nunca corría y
	// devolvía false aunque la migración SÍ estuviera aplicada. Por eso el log
	// decía "falta la migración admin" con la tabla ya migrada.
	migracionAplica bool
	migracionAdmin  bool
)

// columnaExiste consulta information_schema (con caché por nombre).
func columnaExiste(tabla, columna string) bool {
	clave := tabla + "." + columna

	if v, ok := columnasCache[clave]; ok {
		return v
	}

	var existe bool
	err := DB.QueryRow(
		`SELECT EXISTS (
		     SELECT 1 FROM information_schema.columns
		      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
		 )`,
		tabla, columna,
	).Scan(&existe)
	if err != nil {
		// Ante la duda se asume que no existe: las consultas usan el camino
		// antiguo, que funciona con cualquier versión del esquema.
		existe = false
	}

	columnasCache[clave] = existe
	return existe
}

// MigracionWhatsAppAplicada indica si la base tiene las columnas del módulo
// de WhatsApp. Se comprueba una sola vez y se registra en el log.
func MigracionWhatsAppAplicada() bool {
	whatsappOnce.Do(func() {
		migracionAplica = columnaExiste("facturas", "cliente_telefono") &&
			columnaExiste("facturas", "canal_recordatorio") &&
			columnaExiste("usuarios", "whatsapp_activo") &&
			columnaExiste("recordatorios_enviados", "canal")

		if migracionAplica {
			log.Println("✅ Esquema WhatsApp: columnas presentes")
		} else {
			log.Println("⚠️  AVISO: falta aplicar migrations/001_whatsapp.sql.")
			log.Println("    El canal WhatsApp queda deshabilitado y se usa solo el esquema antiguo.")
			log.Println("    Aplícala con: psql \"$DATABASE_URL\" -f migrations/001_whatsapp.sql")
		}
	})
	return migracionAplica
}

// MigracionAdminAplicada indica si la base tiene las columnas del panel de
// administración (rol, suspensión). Si falta, la autenticación degrada:
// nadie tendría rol 'admin' y el panel /admin no sería accesible.
// IMPORTANTE: tras aplicar la migración hay que reiniciar el backend,
// porque el resultado se cachea una sola vez por proceso.
func MigracionAdminAplicada() bool {
	adminOnce.Do(func() {
		migracionAdmin = columnaExiste("usuarios", "rol") && columnaExiste("usuarios", "suspendido")
		if migracionAdmin {
			log.Println("✅ Esquema Admin: columnas presentes")
		} else {
			log.Println("⚠️  AVISO: falta aplicar la migración admin (fix_admin_migration.sql).")
			log.Println("    El panel /admin quedará inaccesible porque ningún usuario tendrá rol 'admin'.")
		}
	})
	return migracionAdmin
}
