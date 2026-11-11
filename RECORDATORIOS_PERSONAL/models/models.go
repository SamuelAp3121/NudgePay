package models

import "time"

// Factura representa una factura (puede ser de pago único o por cuotas).
type Factura struct {
	ID               string    `json:"id"`
	UsuarioID        string    `json:"usuario_id"`
	ClienteNombre    string    `json:"cliente_nombre"`
	ClienteEmail     string    `json:"cliente_email"`
	ClienteTelefono  string    `json:"cliente_telefono"` // WhatsApp del cliente (formato internacional)
	Concepto         string    `json:"concepto"` // Descripción de la deuda
	Monto            float64   `json:"monto"`    // Monto total de la factura
	Moneda           string    `json:"moneda"`
	Cuotas           int       `json:"cuotas"`
	FechaVencimiento string    `json:"fecha_vencimiento"` // Vencimiento de la primera cuota (YYYY-MM-DD)
	Estado           string    `json:"estado"`
	Notificado       bool      `json:"notificado"`
	CreadoEn         time.Time `json:"creado_en"`

	// Medios de pago habilitados para el cliente
	PagoLink     bool   `json:"pago_link"`     // Pasarela (Wompi / tarjeta / PSE)
	PagoQR       bool   `json:"pago_qr"`       // Código QR (Bre-B / llave)
	PagoTransfer bool   `json:"pago_transfer"` // Transferencia bancaria
	BancoNombre  string `json:"banco_nombre"`  // Datos para transferencia
	BancoCuenta  string `json:"banco_cuenta"`
	BancoTitular string `json:"banco_titular"`
	QRPayload    string `json:"qr_payload"`    // Contenido del QR (llave Bre-B, etc.)
	TokenPublico string `json:"token_publico"` // Enlace público para el cliente

	// Canal por el que se envían los recordatorios: email | whatsapp | ambos
	CanalRecordatorio string `json:"canal_recordatorio"`

	// Campos calculados (solo lectura)
	MontoCuota     float64 `json:"monto_cuota"`
	CuotasPagadas  int     `json:"cuotas_pagadas"`
	MontoPagado    float64 `json:"monto_pagado"`
	MontoPendiente float64 `json:"monto_pendiente"`
}

// Cuota es una de las partes en que se divide una factura.
type Cuota struct {
	ID               string  `json:"id"`
	FacturaID        string  `json:"factura_id"`
	Numero           int     `json:"numero"`
	Monto            float64 `json:"monto"`
	FechaVencimiento string  `json:"fecha_vencimiento"`
	Estado           string  `json:"estado"`
	Notificado       bool    `json:"notificado"`
	PagadaEn         *string `json:"pagada_en"`
	MetodoPago       string  `json:"metodo_pago"` // manual | pasarela | transferencia
	ReferenciaPago   string  `json:"referencia_pago"`
}
