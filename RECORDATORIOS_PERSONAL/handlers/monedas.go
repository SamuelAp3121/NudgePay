package handlers

import (
	"math"
	"strings"
)

// MonedaPorDefecto se usa cuando el usuario no indica moneda.
const MonedaPorDefecto = "COP"

// MonedasSoportadas son los códigos ISO 4217 aceptados por la API.
var MonedasSoportadas = map[string]bool{
	"COP": true, // Peso colombiano (por defecto)
	"USD": true,
	"EUR": true,
	"MXN": true,
	"ARS": true,
	"CLP": true,
	"PEN": true,
	"BRL": true,
}

// normalizarMoneda valida y normaliza el código de moneda.
func normalizarMoneda(moneda string) (string, bool) {
	codigo := strings.ToUpper(strings.TrimSpace(moneda))
	if codigo == "" {
		return MonedaPorDefecto, true
	}
	if !MonedasSoportadas[codigo] {
		return "", false
	}
	return codigo, true
}

// redondear2 redondea a 2 decimales.
func redondear2(valor float64) float64 {
	return math.Round(valor*100) / 100
}

// calcularCuotas reparte el monto total en n cuotas de 2 decimales.
// La última cuota absorbe la diferencia de redondeo para que la suma sea exacta.
func calcularCuotas(total float64, n int) []float64 {
	if n <= 0 {
		n = 1
	}
	base := redondear2(total / float64(n))
	cuotas := make([]float64, n)
	var acumulado float64
	for i := 0; i < n; i++ {
		if i == n-1 {
			cuotas[i] = redondear2(total - acumulado)
		} else {
			cuotas[i] = base
			acumulado += base
		}
	}
	return cuotas
}
