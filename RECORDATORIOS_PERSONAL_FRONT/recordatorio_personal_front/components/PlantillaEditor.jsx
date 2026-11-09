'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Spinner } from './ui';
import { IconCheck, IconMail, IconRefresh } from './icons';
import { getPlantilla, updatePlantilla } from '@/lib/api';

const PLANTILLA_POR_DEFECTO =
  'Hola {nombre}, tienes una factura pendiente por {monto} con fecha límite {fecha}.';

const VARIABLES = [
  { token: '{nombre}', label: 'Nombre del cliente', example: 'Acme Corp' },
  { token: '{monto}', label: 'Monto de la cuota', example: '$ 400.000,00 COP' },
  { token: '{fecha}', label: 'Fecha de vencimiento', example: '2026-11-20' },
  { token: '{cuota}', label: 'Número de cuota', example: '1' },
  { token: '{cuotas}', label: 'Total de cuotas', example: '3' },
  { token: '{monto_total}', label: 'Monto total de la factura', example: '$ 1.200.000,00 COP' },
  { token: '{moneda}', label: 'Código de moneda', example: 'COP' },
];

const MAX_LENGTH = 2000;

/** Sustituye las variables por valores de ejemplo (para la vista previa). */
function renderPreview(plantilla) {
  return VARIABLES.reduce(
    (text, variable) => text.split(variable.token).join(variable.example),
    plantilla || ''
  );
}

export default function PlantillaEditor() {
  const [plantilla, setPlantilla] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null); // { type, message }
  const textareaRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getPlantilla();
      const value = data?.plantilla_mensaje || data?.por_defecto || PLANTILLA_POR_DEFECTO;
      setPlantilla(value);
      setSaved(value);
    } catch (error) {
      setLoadError(error?.message || 'No se pudo cargar tu plantilla.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Inserta una variable en la posición del cursor. */
  const insertVariable = (token) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setPlantilla((prev) => prev + token);
      return;
    }

    const start = textarea.selectionStart ?? plantilla.length;
    const end = textarea.selectionEnd ?? plantilla.length;
    const next = plantilla.slice(0, start) + token + plantilla.slice(end);
    setPlantilla(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const value = plantilla.trim();

    if (!value) {
      setNotice({ type: 'error', message: 'La plantilla no puede estar vacía.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const data = await updatePlantilla(value);
      const guardada = data?.plantilla_mensaje || value;
      setPlantilla(guardada);
      setSaved(guardada);
      setNotice({ type: 'success', message: 'Plantilla guardada. Se usará en los próximos recordatorios.' });
    } catch (error) {
      setNotice({ type: 'error', message: error?.message || 'No se pudo guardar la plantilla.' });
    } finally {
      setSaving(false);
    }
  };

  const dirty = plantilla.trim() !== saved.trim();

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <IconMail className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Plantilla de recordatorio</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Personaliza el mensaje que reciben tus clientes por email.
            </p>
          </div>
        </div>
        {dirty && !loading && (
          <span className="badge shrink-0 bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
            Sin guardar
          </span>
        )}
      </div>

      {loadError && (
        <Alert type="error" className="mt-4" onClose={() => setLoadError('')}>
          <p>{loadError}</p>
          <button
            type="button"
            onClick={load}
            className="mt-1 font-semibold underline underline-offset-2 hover:no-underline"
          >
            Reintentar
          </button>
        </Alert>
      )}

      {notice && (
        <Alert type={notice.type} className="mt-4" onClose={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="plantilla" className="label mb-0">
              Mensaje del email
            </label>
            <span
              className={`text-xs ${plantilla.length > MAX_LENGTH ? 'font-semibold text-rose-600' : 'text-slate-400'}`}
            >
              {plantilla.length}/{MAX_LENGTH}
            </span>
          </div>

          {loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <textarea
              id="plantilla"
              ref={textareaRef}
              rows={6}
              value={plantilla}
              maxLength={MAX_LENGTH}
              onChange={(event) => setPlantilla(event.target.value)}
              placeholder={PLANTILLA_POR_DEFECTO}
              className="input resize-y leading-relaxed"
            />
          )}

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Variables disponibles
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {VARIABLES.map((variable) => (
                <button
                  key={variable.token}
                  type="button"
                  onClick={() => insertVariable(variable.token)}
                  disabled={loading}
                  title={`Insertar ${variable.token} — ${variable.label}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
                >
                  <code className="font-mono text-[11px] font-semibold text-brand-600">
                    {variable.token}
                  </code>
                  {variable.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Vista previa */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Vista previa
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {renderPreview(plantilla) || 'Escribe un mensaje para ver la vista previa.'}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setPlantilla(PLANTILLA_POR_DEFECTO)}
            disabled={loading || saving}
            className="btn-ghost justify-start px-0 text-slate-500 hover:bg-transparent hover:text-slate-800"
          >
            <IconRefresh className="h-4 w-4" />
            Restaurar texto por defecto
          </button>

          <button type="submit" className="btn-primary" disabled={loading || saving || !dirty}>
            {saving ? (
              <>
                <Spinner className="h-4 w-4" label="Guardando" />
                Guardando…
              </>
            ) : (
              <>
                <IconCheck className="h-4 w-4" />
                Guardar plantilla
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
