package handlers

import "invoice-reminder/config"

// ============================================================================
// Helpers de compatibilidad con el esquema
//
// Estas funciones devuelven fragmentos SQL (expresiones, nunca identificadores
// del usuario) para que las consultas funcionen tanto con la migración de
// WhatsApp aplicada como sin ella.
// ============================================================================

// SQLTelefonoFactura devuelve la expresión SQL del teléfono del cliente.
func SQLTelefonoFactura() string {
	if config.MigracionWhatsAppAplicada() {
		return "COALESCE(f.cliente_telefono, '')"
	}
	return "''"
}

// SQLCanalFactura devuelve la expresión SQL del canal de recordatorio.
func SQLCanalFactura() string {
	if config.MigracionWhatsAppAplicada() {
		return "COALESCE(f.canal_recordatorio, 'email')"
	}
	return "'email'"
}

// SQLCanalRecordatorioEnviado devuelve la expresión SQL del canal histórico.
// Se usa en las consultas del panel de administración.
func SQLCanalRecordatorioEnviado() string {
	if config.MigracionWhatsAppAplicada() {
		return "COALESCE(r.canal, 'email')"
	}
	return "'email'"
}

// SQLEstadoRecordatorioEnviado devuelve la expresión SQL del estado histórico.
func SQLEstadoRecordatorioEnviado() string {
	if config.MigracionWhatsAppAplicada() {
		return "COALESCE(r.estado, 'enviado')"
	}
	return "'enviado'"
}

// SQLFiltroCanal devuelve la condición que limita a un canal concreto.
// Sin la migración aplicada no existe el canal, así que solo procede 'email'.
func SQLFiltroCanal(canal string) string {
	if config.MigracionWhatsAppAplicada() {
		return "COALESCE(r.canal, 'email') = '" + canal + "'"
	}
	if canal == "email" {
		return "TRUE"
	}
	return "FALSE"
}
