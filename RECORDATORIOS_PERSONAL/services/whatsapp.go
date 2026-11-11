package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

// ============================================================================
// WHATSAPP — Meta Cloud API (WhatsApp Business Platform)
//
// Se usa la API oficial de Meta:
//   POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
//
// Variables de entorno:
//   WHATSAPP_TOKEN            → token permanente (System User) de Meta
//   WHATSAPP_PHONE_NUMBER_ID  → ID del número emisor (no el teléfono)
//   WHATSAPP_API_VERSION      → opcional, por defecto v21.0
//   WHATSAPP_TEMPLATE_NAME    → plantilla aprobada para recordatorios
//   WHATSAPP_TEMPLATE_LANG    → idioma de la plantilla (es_CO por defecto)
//
// Si el usuario configura su propia cuenta (tabla whatsapp_config), esos
// valores tienen prioridad sobre los del entorno.
// ============================================================================

// ErrWhatsAppNoConfigurado se devuelve cuando faltan credenciales de WhatsApp.
var ErrWhatsAppNoConfigurado = errors.New("whatsapp no configurado: define WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en el .env del backend")

// WhatsAppConfig son las credenciales necesarias para enviar mensajes.
type WhatsAppConfig struct {
	Token         string
	PhoneNumberID string
	APIVersion    string
	TemplateName  string
	TemplateLang  string
}

// Configurado indica si hay credenciales suficientes para enviar.
func (c WhatsAppConfig) Configurado() bool {
	return strings.TrimSpace(c.Token) != "" && strings.TrimSpace(c.PhoneNumberID) != ""
}

// WhatsAppConfigDesdeEntorno lee la configuración global del .env.
func WhatsAppConfigDesdeEntorno() WhatsAppConfig {
	version := strings.TrimSpace(os.Getenv("WHATSAPP_API_VERSION"))
	if version == "" {
		version = "v21.0"
	}
	lang := strings.TrimSpace(os.Getenv("WHATSAPP_TEMPLATE_LANG"))
	if lang == "" {
		lang = "es_CO"
	}
	return WhatsAppConfig{
		Token:         strings.TrimSpace(os.Getenv("WHATSAPP_TOKEN")),
		PhoneNumberID: strings.TrimSpace(os.Getenv("WHATSAPP_PHONE_NUMBER_ID")),
		APIVersion:    version,
		TemplateName:  strings.TrimSpace(os.Getenv("WHATSAPP_TEMPLATE_NAME")),
		TemplateLang:  lang,
	}
}

// WhatsAppConfigurado indica si el envío global está disponible (para el panel admin).
func WhatsAppConfigurado() bool {
	return WhatsAppConfigDesdeEntorno().Configurado()
}

// DatosWhatsApp son los valores que se insertan en la plantilla de WhatsApp.
type DatosWhatsApp struct {
	ClienteNombre string
	Monto         float64
	Moneda        string
	Fecha         string
	CuotaNumero   int
	CuotasTotal   int
	MontoTotal    float64
	Concepto      string
	EnlacePago    string
}

// normalizarTelefono deja solo dígitos y valida un largo razonable (E.164 sin +).
// Devuelve el número listo para la API y si es válido.
func normalizarTelefono(telefono string) (string, bool) {
	limpio := strings.TrimSpace(telefono)
	limpio = strings.TrimPrefix(limpio, "+")
	limpio = strings.ReplaceAll(limpio, " ", "")
	limpio = strings.ReplaceAll(limpio, "-", "")
	limpio = strings.ReplaceAll(limpio, "(", "")
	limpio = strings.ReplaceAll(limpio, ")", "")

	if !regexp.MustCompile(`^[0-9]{8,15}$`).MatchString(limpio) {
		return "", false
	}
	return limpio, true
}

// NormalizarTelefono expone la normalización para handlers y validaciones.
func NormalizarTelefono(telefono string) (string, bool) {
	return normalizarTelefono(telefono)
}

// TelefonoValido indica si el número puede recibir mensajes.
func TelefonoValido(telefono string) bool {
	_, ok := normalizarTelefono(telefono)
	return ok
}

// whatsappPayload es el cuerpo que espera la Cloud API.
type whatsappPayload struct {
	MessagingProduct string           `json:"messaging_product"`
	RecipientType    string           `json:"recipient_type,omitempty"`
	To               string           `json:"to"`
	Type             string           `json:"type"`
	Text             *whatsappText    `json:"text,omitempty"`
	Template         *whatsappTempl   `json:"template,omitempty"`
}

type whatsappText struct {
	PreviewURL bool   `json:"preview_url"`
	Body       string `json:"body"`
}

type whatsappTempl struct {
	Name       string              `json:"name"`
	Language   whatsappTemplLang   `json:"language"`
	Components []whatsappComponent `json:"components,omitempty"`
}

type whatsappTemplLang struct {
	Code string `json:"code"`
}

type whatsappComponent struct {
	Type       string              `json:"type"`
	Parameters []whatsappParameter `json:"parameters"`
}

type whatsappParameter struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// enviarWhatsApp hace el POST a la Cloud API con timeout y reintentos ante 5xx.
func enviarWhatsApp(cfg WhatsAppConfig, payload whatsappPayload) error {
	if !cfg.Configurado() {
		return ErrWhatsAppNoConfigurado
	}

	payload.MessagingProduct = "whatsapp"
	if payload.RecipientType == "" {
		payload.RecipientType = "individual"
	}

	cuerpo, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("https://graph.facebook.com/%s/%s/messages", cfg.APIVersion, cfg.PhoneNumberID)
	client := &http.Client{Timeout: 20 * time.Second}
	var ultimoError error

	for intento := 1; intento <= 3; intento++ {
		req, err := http.NewRequest("POST", url, bytes.NewBuffer(cuerpo))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			ultimoError = fmt.Errorf("error de red al contactar WhatsApp: %w", err)
		} else {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			if resp.StatusCode < 400 {
				return nil
			}

			ultimoError = fmt.Errorf("WhatsApp respondió HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))

			// 4xx (salvo 429) no se arregla reintentando.
			if resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
				return ultimoError
			}
		}

		if intento < 3 {
			time.Sleep(time.Duration(intento) * 2 * time.Second)
		}
	}

	return ultimoError
}

// MensajeRecordatorioWhatsApp arma el texto libre del recordatorio.
// Solo sirve dentro de la ventana de 24 h; fuera de ella Meta exige plantilla.
func MensajeRecordatorioWhatsApp(datos DatosWhatsApp) string {
	var b strings.Builder
	b.WriteString("Hola ")
	b.WriteString(datos.ClienteNombre)
	b.WriteString(", te recordamos que tienes un pago pendiente")

	if datos.CuotasTotal > 1 {
		b.WriteString(fmt.Sprintf(" (cuota %d de %d)", datos.CuotaNumero, datos.CuotasTotal))
	}

	b.WriteString(" por ")
	b.WriteString(FormatearMonto(datos.Monto, datos.Moneda))
	b.WriteString(" con fecha límite ")
	b.WriteString(datos.Fecha)
	b.WriteString(".")

	if strings.TrimSpace(datos.Concepto) != "" {
		b.WriteString("\nConcepto: ")
		b.WriteString(datos.Concepto)
	}
	if strings.TrimSpace(datos.EnlacePago) != "" {
		b.WriteString("\nPuedes pagar aquí: ")
		b.WriteString(datos.EnlacePago)
	}
	b.WriteString("\n\nSi ya realizaste el pago, ignora este mensaje.")
	return b.String()
}

// EnviarRecordatorioWhatsApp envía el recordatorio por WhatsApp.
//
// Si hay plantilla configurada se usa la plantilla (obligatorio fuera de la
// ventana de 24 h de Meta); si no, se envía texto libre.
func EnviarRecordatorioWhatsApp(cfg WhatsAppConfig, telefono string, datos DatosWhatsApp) error {
	numero, ok := normalizarTelefono(telefono)
	if !ok {
		return errors.New("número de WhatsApp inválido: usa el formato internacional, por ejemplo 573001234567")
	}

	if strings.TrimSpace(cfg.TemplateName) != "" {
		parametros := []whatsappParameter{
			{Type: "text", Text: datos.ClienteNombre},
			{Type: "text", Text: FormatearMonto(datos.Monto, datos.Moneda)},
			{Type: "text", Text: datos.Fecha},
		}
		if datos.CuotasTotal > 1 {
			parametros = append(parametros, whatsappParameter{
				Type: "text",
				Text: fmt.Sprintf("%d/%d", datos.CuotaNumero, datos.CuotasTotal),
			})
		}

		return enviarWhatsApp(cfg, whatsappPayload{
			To:   numero,
			Type: "template",
			Template: &whatsappTempl{
				Name:     cfg.TemplateName,
				Language: whatsappTemplLang{Code: cfg.TemplateLang},
				Components: []whatsappComponent{
					{Type: "body", Parameters: parametros},
				},
			},
		})
	}

	return enviarWhatsApp(cfg, whatsappPayload{
		To:   numero,
		Type: "text",
		Text: &whatsappText{PreviewURL: true, Body: MensajeRecordatorioWhatsApp(datos)},
	})
}

// EnviarWhatsAppPrueba envía un mensaje de prueba al número indicado.
func EnviarWhatsAppPrueba(cfg WhatsAppConfig, telefono string) error {
	numero, ok := normalizarTelefono(telefono)
	if !ok {
		return errors.New("número de WhatsApp inválido: usa el formato internacional, por ejemplo 573001234567")
	}

	return enviarWhatsApp(cfg, whatsappPayload{
		To:   numero,
		Type: "text",
		Text: &whatsappText{
			Body: "✅ Prueba de ToquePay: si estás leyendo esto, el envío de recordatorios por WhatsApp está funcionando correctamente.",
		},
	})
}
