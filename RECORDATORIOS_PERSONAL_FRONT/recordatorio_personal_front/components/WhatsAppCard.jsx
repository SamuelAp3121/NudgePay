'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from './ui';
import { IconWhatsApp } from './icons';
import { getWhatsAppConfig, sendWhatsAppTest, updateWhatsAppConfig } from '@/lib/api';

/**
 * Tarjeta de configuración de WhatsApp Business (Meta Cloud API).
 *
 * Si el usuario no configura sus credenciales, se usan las globales del
 * backend. El token nunca se devuelve al cliente: solo se indica si existe.
 */
export default function WhatsAppCard() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({
    telefono: '',
    token: '',
    phone_number_id: '',
    template_name: '',
    template_lang: '',
    activo: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWhatsAppConfig();
      setConfig(data);
      setForm({
        telefono: data?.telefono || '',
        token: '',
        phone_number_id: data?.phone_number_id || '',
        template_name: data?.template_name || '',
        template_lang: data?.template_lang || '',
        activo: Boolean(data?.activo),
      });
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo cargar la configuración de WhatsApp.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await updateWhatsAppConfig({
        telefono: form.telefono.trim(),
        token: form.token.trim(),
        phone_number_id: form.phone_number_id.trim(),
        template_name: form.template_name.trim(),
        template_lang: form.template_lang.trim(),
        activo: form.activo,
      });
      setNotice({ type: 'success', message: 'Configuración de WhatsApp guardada.' });
      await load();
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo guardar la configuración.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setNotice(null);
    try {
      await sendWhatsAppTest(form.telefono.trim());
      setNotice({ type: 'success', message: 'Mensaje de prueba enviado por WhatsApp.' });
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo enviar el mensaje de prueba.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="card p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <IconWhatsApp className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">WhatsApp</h2>
          <p className="text-sm text-slate-500">Recordatorios por WhatsApp Business (Meta Cloud API).</p>
        </div>
      </div>

      {notice && (
        <Alert type={notice.type} className="mt-4" onClose={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6 text-brand-600" label="Cargando configuración" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {config?.usando_global && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {config?.global_configurado
                ? 'Estás usando la cuenta de WhatsApp global del servidor. Puedes conectar la tuya abajo.'
                : 'No hay una cuenta de WhatsApp configurada en el servidor. Añade tus credenciales para activar el canal.'}
            </p>
          )}

          {config?.migracion_pendiente && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              El módulo de WhatsApp aún no está activo en este servidor porque falta aplicar
              la migración de base de datos. Contacta con soporte.
            </p>
          )}

          <div>
            <label htmlFor="wa-telefono" className="label">
              Tu número de WhatsApp
            </label>
            <input
              id="wa-telefono"
              type="tel"
              value={form.telefono}
              onChange={handleChange('telefono')}
              placeholder="573001234567"
              className="input"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Formato internacional sin +. Se usa para el mensaje de prueba.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="wa-phone-id" className="label">
                Phone Number ID
              </label>
              <input
                id="wa-phone-id"
                type="text"
                value={form.phone_number_id}
                onChange={handleChange('phone_number_id')}
                placeholder="123456789012345"
                className="input font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="wa-token" className="label">
                Token de acceso
              </label>
              <input
                id="wa-token"
                type="password"
                value={form.token}
                onChange={handleChange('token')}
                placeholder={config?.token_configurado ? '•••••••• (guardado)' : 'EAAG...'}
                className="input font-mono text-sm"
                autoComplete="new-password"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                {config?.token_configurado
                  ? 'Ya hay un token guardado. Déjalo vacío para conservarlo.'
                  : 'Token permanente de Meta (System User).'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="wa-template" className="label">
                Plantilla (opcional)
              </label>
              <input
                id="wa-template"
                type="text"
                value={form.template_name}
                onChange={handleChange('template_name')}
                placeholder="recordatorio_pago"
                className="input font-mono text-sm"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Necesaria para escribir fuera de la ventana de 24 h de Meta.
              </p>
            </div>
            <div>
              <label htmlFor="wa-lang" className="label">
                Idioma de la plantilla
              </label>
              <input
                id="wa-lang"
                type="text"
                value={form.template_lang}
                onChange={handleChange('template_lang')}
                placeholder="es_CO"
                className="input font-mono text-sm"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={handleChange('activo')}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Activar WhatsApp</span>
              <span className="block text-xs text-slate-500">
                Permite enviar recordatorios por WhatsApp desde el panel.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || saving || !form.telefono.trim()}
              className="btn-secondary"
            >
              {testing ? <Spinner className="h-4 w-4" label="Enviando" /> : null}
              Enviar prueba
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Spinner className="h-4 w-4" label="Guardando" /> : null}
              Guardar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
