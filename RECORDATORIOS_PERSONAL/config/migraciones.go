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
	columnasOnce    sync.Once
	columnasCache   = map[string]bool{}
	migracionAplica bool
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
	columnasOnce.Do(func() {
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
