package handlers

// ============================================================================
// PLANES — definición central de límites y beneficios.
//
// Free     → para probar: muy limitado a propósito.
// Pro      → para freelancers que cobran recurrente.
// Business → para negocios con más volumen y control.
//
// Si cambias un límite aquí, se aplica en TODOS lados (crear factura,
// recordatorios manuales, cron automático, WhatsApp, plantilla y reportes)
// porque cada handler consulta estas funciones.
// ============================================================================

const (
	PlanFree     = "free"
	PlanPro      = "pro"
	PlanBusiness = "business"
)

// Límites del plan gratuito (a propósito ajustados para que el salto a
// Pro se note).
const (
	// LimiteRecordatoriosFree es el máximo de recordatorios/mes en Free
	// (email + WhatsApp combinados, cuenta el histórico).
	LimiteRecordatoriosFree = 10
	// LimiteFacturasFree es el máximo de facturas PENDIENTES simultáneas
	// en Free. Las pagadas/eliminadas liberan cupo.
	LimiteFacturasFree = 10
	// MaxCuotasFree limita el pago a plazos en Free (1 = pago único).
	MaxCuotasFree = 3
)

// Límites de los planes de pago.
const (
	// Pro mantiene recordatorios ilimitados como se prometía.
	LimiteRecordatoriosPro = -1
	LimiteFacturasPro      = -1 // ilimitadas
	MaxCuotasPro           = 12

	LimiteRecordatoriosBusiness = -1
	LimiteFacturasBusiness      = -1 // ilimitadas
	MaxCuotasBusiness           = 60
)

// Precios (centavos COP). Business ≈ 2.5x Pro.
const (
	PlanBusinessPrecioCentavos = 4990000 // $49.900 COP
	PlanBusinessPrecioUSD      = 49
)

// NormalizarPlan deja el plan en free|pro|business (todo lo demás → free).
func NormalizarPlan(plan string) string {
	switch plan {
	case PlanPro, PlanBusiness:
		return plan
	default:
		return PlanFree
	}
}

// EsDePago indica si el plan tiene suscripción activa.
func EsDePago(plan string) bool {
	p := NormalizarPlan(plan)
	return p == PlanPro || p == PlanBusiness
}

// LimiteRecordatoriosPorPlan devuelve el cupo mensual (-1 = ilimitado).
func LimiteRecordatoriosPorPlan(plan string) int {
	switch NormalizarPlan(plan) {
	case PlanPro:
		return LimiteRecordatoriosPro
	case PlanBusiness:
		return LimiteRecordatoriosBusiness
	default:
		return LimiteRecordatoriosFree
	}
}

// LimiteFacturasPorPlan devuelve el máximo de facturas pendientes
// simultáneas (-1 = ilimitadas).
func LimiteFacturasPorPlan(plan string) int {
	switch NormalizarPlan(plan) {
	case PlanPro:
		return LimiteFacturasPro
	case PlanBusiness:
		return LimiteFacturasBusiness
	default:
		return LimiteFacturasFree
	}
}

// MaxCuotasPorPlan devuelve el máximo de cuotas por factura según el plan.
func MaxCuotasPorPlan(plan string) int {
	switch NormalizarPlan(plan) {
	case PlanPro:
		return MaxCuotasPro
	case PlanBusiness:
		return MaxCuotasBusiness
	default:
		return MaxCuotasFree
	}
}

// PuedeUsarWhatsApp indica si el plan permite recordatorios por WhatsApp.
// Free es solo email; Pro y Business incluyen WhatsApp.
func PuedeUsarWhatsApp(plan string) bool {
	return EsDePago(plan)
}

// PuedePersonalizarPlantilla indica si puede editar la plantilla del email.
// Free usa siempre el texto por defecto.
func PuedePersonalizarPlantilla(plan string) bool {
	return EsDePago(plan)
}

// PuedeVerReportes indica si el plan incluye reportes y exportación CSV.
// Free NO tiene reportes; Pro y Business sí (Business con detalle extra).
func PuedeVerReportes(plan string) bool {
	return EsDePago(plan)
}

// VentanaAutoDias es cuántos días antes del vencimiento el cron automático
// envía recordatorios según el plan. Diferencia REAL entre planes:
// Free = 1 día (más vencidas), Pro = 3 días, Business = 7 días.
func VentanaAutoDias(plan string) int {
	switch NormalizarPlan(plan) {
	case PlanBusiness:
		return 7
	case PlanPro:
		return 3
	default:
		return 1
	}
}

// NombrePlan devuelve el nombre bonito para la UI y los errores.
func NombrePlan(plan string) string {
	switch NormalizarPlan(plan) {
	case PlanPro:
		return "Pro"
	case PlanBusiness:
		return "Business"
	default:
		return "Gratuito"
	}
}
