package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// ErrEmailNoConfigurado se devuelve cuando falta RESEND_API_KEY o sigue siendo el placeholder.
var ErrEmailNoConfigurado = errors.New("email no configurado: define RESEND_API_KEY con una clave real en el .env del backend")

// PlantillaMensajePorDefecto se usa cuando el usuario no ha personalizado su plantilla.
const PlantillaMensajePorDefecto = "Hola {nombre}, tienes una factura pendiente por {monto} con fecha límite {fecha}."

// DatosRecordatorio son los valores que se sustituyen en la plantilla.
type DatosRecordatorio struct {
	ClienteNombre string
	Monto         float64 // Monto de la cuota a recordar
	Moneda        string
	Fecha         string
	CuotaNumero   int
	CuotasTotal   int
	MontoTotal    float64
}

type ResendPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

// EmailConfigurado indica si hay una API Key de Resend real (para el panel de admin).
func EmailConfigurado() bool {
	return emailConfigurado()
}

// emailConfigurado indica si hay una API Key de Resend real.
func emailConfigurado() bool {
	key := strings.TrimSpace(os.Getenv("RESEND_API_KEY"))
	return key != "" && !strings.HasPrefix(key, "re_tu_")
}

// enviarEmail hace el POST a Resend con timeout y reintentos ante errores de red/5xx.
func enviarEmail(payload ResendPayload) error {
	if !emailConfigurado() {
		return ErrEmailNoConfigurado
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	var lastErr error

	for intento := 1; intento <= 3; intento++ {
		req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewBuffer(jsonPayload))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+os.Getenv("RESEND_API_KEY"))
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("error de red al contactar Resend: %w", err)
		} else {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			if resp.StatusCode < 400 {
				return nil
			}

			lastErr = fmt.Errorf("Resend respondió HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))

			// 4xx (salvo 429) no se arregla reintentando.
			if resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests {
				return lastErr
			}
		}

		if intento < 3 {
			time.Sleep(time.Duration(intento) * 2 * time.Second)
		}
	}

	return lastErr
}

// FormatearMonto devuelve el monto con el símbolo de la moneda (COP por defecto).
func FormatearMonto(monto float64, moneda string) string {
	codigo := strings.ToUpper(strings.TrimSpace(moneda))
	if codigo == "" {
		codigo = "COP"
	}

	simbolos := map[string]string{
		"COP": "$", "USD": "$", "MXN": "$", "ARS": "$", "CLP": "$",
		"EUR": "€", "PEN": "S/", "BRL": "R$",
	}
	simbolo := simbolos[codigo]
	if simbolo == "" {
		simbolo = codigo + " "
	}

	// Separador de miles con punto y decimales con coma (formato es-CO).
	entero := fmt.Sprintf("%.2f", monto)
	partes := strings.Split(entero, ".")
	miles := partes[0]
	var conPuntos []string
	for len(miles) > 3 {
		conPuntos = append([]string{miles[len(miles)-3:]}, conPuntos...)
		miles = miles[:len(miles)-3]
	}
	conPuntos = append([]string{miles}, conPuntos...)

	return fmt.Sprintf("%s%s,%s %s", simbolo, strings.Join(conPuntos, "."), partes[1], codigo)
}

// RenderizarPlantilla sustituye las variables de la plantilla.
// Variables: {nombre}, {monto}, {fecha}, {cuota}, {cuotas}, {monto_total}, {moneda}.
func RenderizarPlantilla(plantilla string, datos DatosRecordatorio) string {
	if strings.TrimSpace(plantilla) == "" {
		plantilla = PlantillaMensajePorDefecto
	}

	moneda := datos.Moneda
	if moneda == "" {
		moneda = "COP"
	}

	replacer := strings.NewReplacer(
		"{nombre}", datos.ClienteNombre,
		"{monto}", FormatearMonto(datos.Monto, moneda),
		"{fecha}", datos.Fecha,
		"{cuota}", fmt.Sprintf("%d", datos.CuotaNumero),
		"{cuotas}", fmt.Sprintf("%d", datos.CuotasTotal),
		"{monto_total}", FormatearMonto(datos.MontoTotal, moneda),
		"{moneda}", moneda,
	)

	return replacer.Replace(plantilla)
}

// EnviarRecordatorioEmail envía el recordatorio de la cuota pendiente al cliente.
func EnviarRecordatorioEmail(clienteEmail string, datos DatosRecordatorio, plantilla string) error {
	mensaje := RenderizarPlantilla(plantilla, datos)

	mensajeHTML := fmt.Sprintf(`
		<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
			<p style="white-space:pre-line;line-height:1.6">%s</p>
			<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
			<p style="font-size:13px;color:#64748b">Saludos,<br>Departamento de Cobros</p>
		</div>
	`, html.EscapeString(mensaje))

	asunto := fmt.Sprintf("Recordatorio de Pago Pendiente - %s", FormatearMonto(datos.Monto, datos.Moneda))
	if datos.CuotasTotal > 1 {
		asunto = fmt.Sprintf("Recordatorio de Pago - Cuota %d/%d - %s", datos.CuotaNumero, datos.CuotasTotal, FormatearMonto(datos.Monto, datos.Moneda))
	}

	return enviarEmail(ResendPayload{
		From:    os.Getenv("FROM_EMAIL"),
		To:      []string{clienteEmail},
		Subject: asunto,
		HTML:    mensajeHTML,
	})
}

// EnviarBienvenidaEmail da la bienvenida al nuevo usuario.
func EnviarBienvenidaEmail(email string) error {
	mensajeHTML := `
		<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
			<h2 style="color:#1d36d8">¡Bienvenido a ToquePay!</h2>
			<p>Tu cuenta está lista. Ya puedes iniciar sesión con tu email y la contraseña que elegiste.</p>
			<p>Desde el panel podrás crear facturas (de pago único o por cuotas) y enviar recordatorios automáticos a tus clientes.</p>
			<br>
			<p>Saludos,<br>Equipo de ToquePay</p>
		</div>
	`

	return enviarEmail(ResendPayload{
		From:    os.Getenv("FROM_EMAIL"),
		To:      []string{email},
		Subject: "Bienvenido a ToquePay",
		HTML:    mensajeHTML,
	})
}

// EnviarCodigoRecuperacionEmail envía el código de 6 dígitos para restablecer la contraseña.
func EnviarCodigoRecuperacionEmail(email, codigo string, minutos int) error {
	mensajeHTML := fmt.Sprintf(`
		<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
			<h2 style="color:#1d36d8">Recupera tu contraseña</h2>
			<p>Usa este código para restablecer tu contraseña de ToquePay:</p>
			<p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f1f5f9;padding:16px;border-radius:8px;text-align:center">%s</p>
			<p>El código caduca en %d minutos. Si no solicitaste este cambio, ignora este mensaje.</p>
			<br>
			<p>Saludos,<br>Equipo de ToquePay</p>
		</div>
	`, codigo, minutos)

	return enviarEmail(ResendPayload{
		From:    os.Getenv("FROM_EMAIL"),
		To:      []string{email},
		Subject: "Tu código de recuperación - ToquePay",
		HTML:    mensajeHTML,
	})
}

// EnviarEmailPrueba envía un correo de prueba para verificar la configuración.
func EnviarEmailPrueba(destino string) error {
	mensajeHTML := `
		<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
			<h2 style="color:#1d36d8">Correo de prueba ✅</h2>
			<p>Si estás leyendo esto, el envío de emails de ToquePay está funcionando correctamente.</p>
		</div>
	`

	return enviarEmail(ResendPayload{
		From:    os.Getenv("FROM_EMAIL"),
		To:      []string{destino},
		Subject: "Prueba de configuración - ToquePay",
		HTML:    mensajeHTML,
	})
}
