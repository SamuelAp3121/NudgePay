/** Moneda por defecto de la aplicación. */
export const DEFAULT_CURRENCY = 'COP';

/** Monedas soportadas (deben coincidir con el backend). */
export const CURRENCIES = [
  { code: 'COP', label: 'Peso colombiano', locale: 'es-CO' },
  { code: 'USD', label: 'Dólar estadounidense', locale: 'en-US' },
  { code: 'EUR', label: 'Euro', locale: 'es-ES' },
  { code: 'MXN', label: 'Peso mexicano', locale: 'es-MX' },
  { code: 'ARS', label: 'Peso argentino', locale: 'es-AR' },
  { code: 'CLP', label: 'Peso chileno', locale: 'es-CL' },
  { code: 'PEN', label: 'Sol peruano', locale: 'es-PE' },
  { code: 'BRL', label: 'Real brasileño', locale: 'pt-BR' },
];

/**
 * Formatea un número como moneda. Por defecto COP.
 * formatCurrency(1200000) → "$ 1.200.000,00 COP"
 */
export function formatCurrency(value, currency = DEFAULT_CURRENCY) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';

  const code = String(currency || DEFAULT_CURRENCY).toUpperCase();
  const locale = CURRENCIES.find((item) => item.code === code)?.locale || 'es-CO';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** Símbolo corto de la moneda (para inputs). */
export function currencySymbol(currency = DEFAULT_CURRENCY) {
  const code = String(currency || DEFAULT_CURRENCY).toUpperCase();
  const symbols = { COP: '$', USD: '$', MXN: '$', ARS: '$', CLP: '$', EUR: '€', PEN: 'S/', BRL: 'R$' };
  return symbols[code] || code;
}

/**
 * Formatea una fecha (ISO o YYYY-MM-DD) como "12 mar 2025".
 * Se usa timeZone UTC para evitar que la fecha se desplace un día.
 */
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Devuelve la fecha de hoy en formato YYYY-MM-DD (para el min del date input). */
export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

/** Días restantes hasta el vencimiento (negativo = vencida). */
export function daysUntil(value) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  const utcDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((utcDue - utcToday) / 86_400_000);
}

/** Normaliza el estado que devuelve el backend a 'pendiente' | 'pagada'. */
export function normalizeStatus(factura) {
  const raw = String(factura?.estado ?? factura?.status ?? '').toLowerCase();
  if (['pagada', 'paid', 'pagado', 'completed'].includes(raw)) return 'pagada';
  if (factura?.pagada === true || factura?.paid === true) return 'pagada';
  return 'pendiente';
}

/**
 * Normaliza una factura del backend Go a la forma usada por la UI.
 * Campos del backend: id, cliente_nombre, cliente_email, monto, moneda, cuotas,
 * fecha_vencimiento (YYYY-MM-DD), estado, notificado, creado_en,
 * monto_cuota, cuotas_pagadas, monto_pagado, monto_pendiente.
 */
export function normalizeFactura(factura) {
  const monto = Number(factura?.monto ?? factura?.amount ?? 0);
  const cuotas = Math.max(1, Number(factura?.cuotas ?? 1) || 1);
  const cuotasPagadas = Math.min(cuotas, Math.max(0, Number(factura?.cuotas_pagadas ?? 0) || 0));

  return {
    id: factura?.id ?? factura?.ID ?? factura?.factura_id,
    cliente:
      factura?.cliente_nombre ?? factura?.cliente ?? factura?.nombre_cliente ?? factura?.client_name ?? '',
    email:
      factura?.cliente_email ?? factura?.email ?? factura?.client_email ?? '',
    concepto: factura?.concepto ?? '',
    tokenPublico: factura?.token_publico ?? '',
    mediosPago: {
      link: Boolean(factura?.pago_link),
      qr: Boolean(factura?.pago_qr),
      transferencia: Boolean(factura?.pago_transfer),
    },
    banco: {
      nombre: factura?.banco_nombre ?? '',
      cuenta: factura?.banco_cuenta ?? '',
      titular: factura?.banco_titular ?? '',
    },
    qrPayload: factura?.qr_payload ?? '',
    monto,
    moneda: String(factura?.moneda || DEFAULT_CURRENCY).toUpperCase(),
    cuotas,
    cuotasPagadas,
    montoCuota: Number(factura?.monto_cuota ?? monto / cuotas),
    montoPagado: Number(factura?.monto_pagado ?? 0),
    montoPendiente: Number(factura?.monto_pendiente ?? monto),
    fechaVencimiento:
      factura?.fecha_vencimiento ?? factura?.fechaVencimiento ?? factura?.due_date ?? null,
    estado: normalizeStatus(factura),
    notificado: Boolean(factura?.notificado),
    creadoEn: factura?.creado_en ?? null,
  };
}

/** Normaliza una cuota del backend. */
export function normalizeCuota(cuota) {
  return {
    id: cuota?.id,
    numero: Number(cuota?.numero ?? 0),
    monto: Number(cuota?.monto ?? 0),
    fechaVencimiento: cuota?.fecha_vencimiento ?? null,
    estado: normalizeStatus(cuota),
    notificado: Boolean(cuota?.notificado),
    pagadaEn: cuota?.pagada_en ?? null,
    metodoPago: cuota?.metodo_pago ?? '',
    referenciaPago: cuota?.referencia_pago ?? '',
  };
}

/** Extrae el array de facturas de las distintas formas de respuesta posibles. */
export function extractFacturas(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.facturas)) return data.facturas;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
