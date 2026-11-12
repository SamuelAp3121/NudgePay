/**
 * Cliente HTTP mínimo para la API REST en Go.
 *
 * Autenticación del panel web: cookie de sesión HttpOnly (`ir_session`) que emite el backend
 * al hacer login. `credentials: 'include'` la envía en cada petición.
 * El header `X-API-Key` se mantiene solo para integraciones/scripts.
 */

/**
 * URL del backend. Se incrusta en el bundle al construir (`NEXT_PUBLIC_*`), así que
 * debe estar definida ANTES del build (p. ej. en Render → Environment).
 */
const API_URL_CONFIGURADA = String(process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

export const API_URL = API_URL_CONFIGURADA || 'http://localhost:8080';

/** Indica si la URL del backend se configuró al construir la aplicación. */
export const API_URL_CONFIGURADA_OK = API_URL_CONFIGURADA !== '';

/** Mensaje de error honesto: distingue un backend mal configurado de uno caído. */
function mensajeConexion() {
  if (!API_URL_CONFIGURADA_OK) {
    return (
      'El panel no tiene configurada la URL del backend (NEXT_PUBLIC_API_URL). ' +
      'Define esa variable en el entorno de despliegue y vuelve a construir la aplicación.'
    );
  }
  return (
    `No se pudo conectar con el backend en ${API_URL_CONFIGURADA}. ` +
    'Comprueba que el servicio esté desplegado y que CORS_ORIGINS incluya el dominio del panel.'
  );
}

// Claves antiguas de API Key en localStorage (se limpian al iniciar sesión).
export const API_KEY_STORAGE_KEY = 'invoice_reminder_api_key';
export const API_KEY_ALIAS_STORAGE_KEY = 'apiKey';

/** Error con el status HTTP y el mensaje devuelto por el backend. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Lee la API Key guardada en localStorage (solo para integraciones/scripts).
 * El panel web ya NO la usa: la sesión va por cookie HttpOnly.
 */
export function getApiKey() {
  if (typeof window === 'undefined') return '';
  return (
    window.localStorage.getItem(API_KEY_STORAGE_KEY) ||
    window.localStorage.getItem(API_KEY_ALIAS_STORAGE_KEY) ||
    ''
  );
}

/** Guarda la API Key en localStorage (solo para integraciones/scripts). */
export function setApiKey(key) {
  if (typeof window === 'undefined') return;
  const value = key.trim();
  window.localStorage.setItem(API_KEY_STORAGE_KEY, value);
  window.localStorage.setItem(API_KEY_ALIAS_STORAGE_KEY, value);
}

/** Elimina la API Key de localStorage. */
export function clearApiKey() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  window.localStorage.removeItem(API_KEY_ALIAS_STORAGE_KEY);
}

/**
 * fetch() con base URL, JSON y cookies de sesión.
 * Lanza ApiError con un mensaje legible si la respuesta no es 2xx.
 */
export async function apiFetch(path, { method = 'GET', body, apiKey, signal } = {}) {
  const key = apiKey ?? getApiKey();

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'X-API-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(mensajeConexion(), 0);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (data && (data.error || data.message || data.detail)) ||
      (response.status === 401 || response.status === 403
        ? 'Tu sesión expiró o no has iniciado sesión. Vuelve a entrar.'
        : `Error ${response.status} al comunicarse con el servidor.`);
    throw new ApiError(message, response.status);
  }

  return data;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/v1/facturas → { facturas: [...], total } */
export function listFacturas(options = {}) {
  return apiFetch('/api/v1/facturas', options);
}

/**
 * POST /api/v1/facturas → crea una factura.
 * El backend toma el dueño de la API Key, así que no se envía usuario_id.
 */
export function createFactura(payload, options = {}) {
  return apiFetch('/api/v1/facturas', { ...options, method: 'POST', body: payload });
}

/** POST /api/v1/facturas/:id/pagar → marca TODAS las cuotas como pagadas. */
export function marcarPagada(id, options = {}) {
  return apiFetch(`/api/v1/facturas/${id}/pagar`, { ...options, method: 'POST' });
}

/** GET /api/v1/facturas/:id/cuotas → { cuotas: [...] } */
export function listCuotas(id, options = {}) {
  return apiFetch(`/api/v1/facturas/${id}/cuotas`, options);
}

/** POST /api/v1/facturas/:id/cuotas/:numero/pagar → marca una cuota como pagada. */
export function pagarCuota(id, numero, options = {}) {
  return apiFetch(`/api/v1/facturas/${id}/cuotas/${numero}/pagar`, { ...options, method: 'POST' });
}

/** GET /api/v1/facturas/:id/pagos → historial de pagos de pasarela. */
export function listPagos(id, options = {}) {
  return apiFetch(`/api/v1/facturas/${id}/pagos`, options);
}

/* ------------------------- Portal público del cliente ------------------------- */

/** GET /public/facturas/:token → { factura, cuotas } (sin sesión). */
export function getFacturaPublica(token, options = {}) {
  return apiFetch(`/public/facturas/${token}`, { ...options, apiKey: '' });
}

/** POST /public/facturas/:token/cuotas/:numero/pagar → el cliente registra su pago. */
export function pagarCuotaPublica(token, numero, payload = {}, options = {}) {
  return apiFetch(`/public/facturas/${token}/cuotas/${numero}/pagar`, {
    ...options,
    method: 'POST',
    body: payload,
    apiKey: '',
  });
}

/** POST /api/v1/facturas/:id/recordatorio → envía el recordatorio por email ahora. */
export function enviarRecordatorio(id, options = {}) {
  return apiFetch(`/api/v1/facturas/${id}/recordatorio`, { ...options, method: 'POST' });
}

/** POST /api/v1/facturas/:id/recordatorio-whatsapp → envía el recordatorio por WhatsApp. */
export function enviarRecordatorioWhatsApp(id, options = {}) {
  return apiFetch(`/api/v1/facturas/${id}/recordatorio-whatsapp`, { ...options, method: 'POST' });
}

/* -------------------------------- WhatsApp -------------------------------- */

/** GET /api/v1/whatsapp/config → configuración de WhatsApp del usuario. */
export function getWhatsAppConfig(options = {}) {
  return apiFetch('/api/v1/whatsapp/config', options);
}

/** PUT /api/v1/whatsapp/config → guarda credenciales de WhatsApp Business. */
export function updateWhatsAppConfig(payload, options = {}) {
  return apiFetch('/api/v1/whatsapp/config', { ...options, method: 'PUT', body: payload });
}

/** POST /api/v1/whatsapp/test → envía un mensaje de prueba por WhatsApp. */
export function sendWhatsAppTest(telefono, options = {}) {
  return apiFetch('/api/v1/whatsapp/test', { ...options, method: 'POST', body: { telefono } });
}

/** DELETE /api/v1/facturas/:id → elimina una factura. */
export function deleteFactura(id, options = {}) {
  return apiFetch(`/api/v1/facturas/${id}`, { ...options, method: 'DELETE' });
}

/** GET /api/v1/me → { email, plan, api_key, recordatorios_usados, limite_recordatorios } */
export function getMe(options = {}) {
  return apiFetch('/api/v1/me', options);
}

/**
 * POST /api/v1/register → crea la cuenta con email + contraseña y abre la sesión (cookie).
 * Es público: no envía el header X-API-Key.
 */
export function register(email, password, options = {}) {
  return apiFetch('/api/v1/register', {
    ...options,
    method: 'POST',
    body: { email, password },
    apiKey: '',
  });
}

/* ------------------------------ Autenticación ------------------------------ */

/** POST /api/v1/auth/login → inicia sesión (cookie HttpOnly) y devuelve { usuario }. */
export function login(email, password, options = {}) {
  return apiFetch('/api/v1/auth/login', {
    ...options,
    method: 'POST',
    body: { email, password },
    apiKey: '',
  });
}

/** POST /api/v1/auth/logout → cierra la sesión y borra la cookie. */
export function logout(options = {}) {
  return apiFetch('/api/v1/auth/logout', { ...options, method: 'POST', apiKey: '' });
}

/** GET /api/v1/auth/me → usuario de la sesión activa (401 si no hay sesión). */
export function getSession(options = {}) {
  return apiFetch('/api/v1/auth/me', { ...options, apiKey: '' });
}

/** POST /api/v1/auth/forgot-password → envía un código de 6 dígitos al email. */
export function forgotPassword(email, options = {}) {
  return apiFetch('/api/v1/auth/forgot-password', {
    ...options,
    method: 'POST',
    body: { email },
    apiKey: '',
  });
}

/** POST /api/v1/auth/reset-password → valida el código y define la nueva contraseña. */
export function resetPassword({ email, codigo, passwordNueva }, options = {}) {
  return apiFetch('/api/v1/auth/reset-password', {
    ...options,
    method: 'POST',
    body: { email, codigo, password_nueva: passwordNueva },
    apiKey: '',
  });
}

/** POST /api/v1/auth/password → cambia la contraseña del usuario autenticado. */
export function changePassword({ passwordActual, passwordNueva }, options = {}) {
  return apiFetch('/api/v1/auth/password', {
    ...options,
    method: 'POST',
    body: { password_actual: passwordActual, password_nueva: passwordNueva },
  });
}

/** POST /api/v1/api-key/regenerar → nueva API Key para integraciones. */
export function regenerateApiKey(options = {}) {
  return apiFetch('/api/v1/api-key/regenerar', { ...options, method: 'POST' });
}

/* ------------------------------- Facturación ------------------------------- */

/** GET /api/v1/billing/suscripcion → plan, precio, configuración de pasarela e historial. */
export function getSuscripcion(options = {}) {
  return apiFetch('/api/v1/billing/suscripcion', options);
}

/** POST /api/v1/billing/checkout → datos firmados para abrir el checkout de Wompi. */
export function crearCheckout(plan = 'pro', options = {}) {
  return apiFetch('/api/v1/billing/checkout', { ...options, method: 'POST', body: { plan } });
}

/** POST /api/v1/billing/simular → activa Pro sin pasarela (solo desarrollo). */
export function simularPagoPro(referencia, options = {}) {
  return apiFetch('/api/v1/billing/simular', { ...options, method: 'POST', body: { referencia } });
}

/** POST /api/v1/billing/cancelar → vuelve al plan gratuito. */
export function cancelarSuscripcion(options = {}) {
  return apiFetch('/api/v1/billing/cancelar', { ...options, method: 'POST' });
}

/** POST /api/v1/email/test → envía un correo de prueba al email del usuario. */
export function sendTestEmail(options = {}) {
  return apiFetch('/api/v1/email/test', { ...options, method: 'POST' });
}

/** GET /api/v1/plantilla → { plantilla_mensaje, por_defecto, variables } */
export function getPlantilla(options = {}) {
  return apiFetch('/api/v1/plantilla', options);
}

/** PUT /api/v1/plantilla → guarda la plantilla de mensaje del usuario. */
export function updatePlantilla(plantillaMensaje, options = {}) {
  return apiFetch('/api/v1/plantilla', {
    ...options,
    method: 'PUT',
    body: { plantilla_mensaje: plantillaMensaje },
  });
}

/**
 * Valida una API Key contra el backend (GET /me).
 * Devuelve los datos del usuario o lanza ApiError (401 si la clave no es válida).
 */
export function validateApiKey(key, options = {}) {
  return apiFetch('/api/v1/me', { ...options, apiKey: key });
}

/* ------------------------------------------------------------------ */
/* Administración (solo rol = 'admin')                                 */
/* ------------------------------------------------------------------ */

/** Construye un query string omitiendo valores vacíos. */
function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** GET /api/v1/admin/resumen → métricas globales del negocio. */
export function adminResumen(options = {}) {
  return apiFetch('/api/v1/admin/resumen', options);
}

/** GET /api/v1/admin/sistema → estado de base de datos, email y pasarela. */
export function adminSistema(options = {}) {
  return apiFetch('/api/v1/admin/sistema', options);
}

/** GET /api/v1/admin/auditoria → acciones registradas de administradores. */
export function adminAuditoria(params = {}, options = {}) {
  return apiFetch(`/api/v1/admin/auditoria${qs(params)}`, options);
}

/** GET /api/v1/admin/usuarios → lista paginada con búsqueda y filtros. */
export function adminListarUsuarios(params = {}, options = {}) {
  return apiFetch(`/api/v1/admin/usuarios${qs(params)}`, options);
}

/** GET /api/v1/admin/usuarios/:id → ficha completa (facturas, pagos, suscripciones). */
export function adminDetalleUsuario(id, options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}`, options);
}

/** PATCH /api/v1/admin/usuarios/:id/plan → cambia el plan manualmente. */
export function adminCambiarPlan(id, plan, dias = 30, options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}/plan`, {
    ...options,
    method: 'PATCH',
    body: { plan, dias },
  });
}

/** PATCH /api/v1/admin/usuarios/:id/suspender → suspende o reactiva la cuenta. */
export function adminSuspenderUsuario(id, suspendido, motivo = '', options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}/suspender`, {
    ...options,
    method: 'PATCH',
    body: { suspendido, motivo },
  });
}

/** PATCH /api/v1/admin/usuarios/:id/rol → promueve o degrada la cuenta. */
export function adminCambiarRol(id, rol, options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}/rol`, {
    ...options,
    method: 'PATCH',
    body: { rol },
  });
}

/** POST /api/v1/admin/usuarios/:id/password → define una contraseña temporal. */
export function adminResetPassword(id, passwordNueva, options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}/password`, {
    ...options,
    method: 'POST',
    body: { password_nueva: passwordNueva },
  });
}

/** POST /api/v1/admin/usuarios/:id/cerrar-sesiones → invalida sus sesiones. */
export function adminCerrarSesiones(id, options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}/cerrar-sesiones`, { ...options, method: 'POST' });
}

/** POST /api/v1/admin/usuarios/:id/impersonar → entra como ese usuario. */
export function adminImpersonar(id, options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}/impersonar`, { ...options, method: 'POST' });
}

/** POST /api/v1/admin/salir-impersonacion → vuelve a la sesión del admin. */
export function adminSalirImpersonacion(options = {}) {
  return apiFetch('/api/v1/admin/salir-impersonacion', { ...options, method: 'POST' });
}

/** GET /api/v1/admin/facturas → facturas de todos los usuarios. */
export function adminListarFacturas(params = {}, options = {}) {
  return apiFetch(`/api/v1/admin/facturas${qs(params)}`, options);
}

/** GET /api/v1/admin/facturas/:id/cuotas → cuotas de cualquier factura. */
export function adminCuotasFactura(id, options = {}) {
  return apiFetch(`/api/v1/admin/facturas/${id}/cuotas`, options);
}

/** POST /api/v1/admin/facturas/:id/cuotas/:numero/pagar → concilia una cuota. */
export function adminMarcarCuotaPagada(id, numero, payload = {}, options = {}) {
  return apiFetch(`/api/v1/admin/facturas/${id}/cuotas/${numero}/pagar`, {
    ...options,
    method: 'POST',
    body: payload,
  });
}

/** POST /api/v1/admin/facturas/:id/cuotas/:numero/revertir → vuelve a pendiente. */
export function adminRevertirCuota(id, numero, options = {}) {
  return apiFetch(`/api/v1/admin/facturas/${id}/cuotas/${numero}/revertir`, {
    ...options,
    method: 'POST',
  });
}

/** POST /api/v1/admin/facturas/:id/pagar → marca todas las cuotas como pagadas. */
export function adminMarcarFacturaPagada(id, options = {}) {
  return apiFetch(`/api/v1/admin/facturas/${id}/pagar`, { ...options, method: 'POST' });
}

/** DELETE /api/v1/admin/facturas/:id → elimina una factura de cualquier usuario. */
export function adminEliminarFactura(id, options = {}) {
  return apiFetch(`/api/v1/admin/facturas/${id}`, { ...options, method: 'DELETE' });
}

/** GET /api/v1/admin/pagos → pagos de pasarela de todos los usuarios. */
export function adminListarPagos(params = {}, options = {}) {
  return apiFetch(`/api/v1/admin/pagos${qs(params)}`, options);
}

/** GET /api/v1/admin/suscripciones → órdenes de suscripción. */
export function adminListarSuscripciones(params = {}, options = {}) {
  return apiFetch(`/api/v1/admin/suscripciones${qs(params)}`, options);
}

/** POST /api/v1/admin/suscripciones/:referencia/activar → concilia el pago. */
export function adminActivarSuscripcion(referencia, options = {}) {
  return apiFetch(`/api/v1/admin/suscripciones/${encodeURIComponent(referencia)}/activar`, {
    ...options,
    method: 'POST',
  });
}

/** POST /api/v1/admin/suscripciones/:referencia/cancelar → vuelve a plan free. */
export function adminCancelarSuscripcion(referencia, options = {}) {
  return apiFetch(`/api/v1/admin/suscripciones/${encodeURIComponent(referencia)}/cancelar`, {
    ...options,
    method: 'POST',
  });
}

/* --------------------------- Admin: WhatsApp --------------------------- */

/** GET /api/v1/admin/whatsapp/resumen → estado y métricas del canal WhatsApp. */
export function adminWhatsAppResumen(options = {}) {
  return apiFetch('/api/v1/admin/whatsapp/resumen', options);
}

/** GET /api/v1/admin/whatsapp/envios → histórico de envíos por WhatsApp. */
export function adminListarEnviosWhatsApp(params = {}, options = {}) {
  return apiFetch(`/api/v1/admin/whatsapp/envios${qs(params)}`, options);
}

/** POST /api/v1/admin/whatsapp/test → prueba con la configuración global. */
export function adminWhatsAppTest(telefono, options = {}) {
  return apiFetch('/api/v1/admin/whatsapp/test', { ...options, method: 'POST', body: { telefono } });
}

/** PATCH /api/v1/admin/usuarios/:id/whatsapp → activa/desactiva WhatsApp de una cuenta. */
export function adminActualizarWhatsAppUsuario(id, activo, telefono = '', options = {}) {
  return apiFetch(`/api/v1/admin/usuarios/${id}/whatsapp`, {
    ...options,
    method: 'PATCH',
    body: { activo, telefono },
  });
}
