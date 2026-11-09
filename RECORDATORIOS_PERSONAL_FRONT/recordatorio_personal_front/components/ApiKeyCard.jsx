'use client';

import { useEffect, useState } from 'react';
import { IconCheck, IconCopy, IconEye, IconEyeOff, IconKey, IconRefresh } from './icons';
import { Alert, Spinner } from './ui';
import { regenerateApiKey } from '@/lib/api';

/** Copia texto al portapapeles con fallback para navegadores sin Clipboard API. */
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/**
 * API Key para integraciones (scripts, cURL, otros servicios).
 * El panel web NO la usa: la sesión va por cookie HttpOnly.
 */
export default function ApiKeyCard({ apiKey, onChange }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const masked = apiKey
    ? `${apiKey.slice(0, 6)}${'•'.repeat(Math.max(apiKey.length - 10, 8))}${apiKey.slice(-4)}`
    : '';

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await copyToClipboard(apiKey);
      setCopied(true);
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona la clave y cópiala manualmente.');
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError('');
    try {
      const data = await regenerateApiKey();
      onChange?.(data?.api_key || '');
      setConfirming(false);
      setRevealed(true);
    } catch (err) {
      setError(err?.message || 'No se pudo regenerar la API Key.');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <IconKey className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">API Key para integraciones</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Opcional. Úsala solo en scripts o servicios externos con el header{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                X-API-Key
              </code>
              . El panel no la necesita.
            </p>
          </div>
        </div>
        <span
          className={`badge shrink-0 ${
            apiKey
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
              : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${apiKey ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {apiKey ? 'Activa' : 'Sin clave'}
        </span>
      </div>

      {error && (
        <Alert type="error" className="mt-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <code className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700">
            {apiKey ? (revealed ? apiKey : masked) : 'No hay ninguna API Key generada'}
          </code>
          {apiKey && (
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700"
              aria-label={revealed ? 'Ocultar API Key' : 'Mostrar API Key'}
              title={revealed ? 'Ocultar' : 'Mostrar'}
            >
              {revealed ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!apiKey}
            className={`btn shrink-0 ${copied ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'btn-primary'}`}
          >
            {copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
            {copied ? '¡Copiada!' : 'Copiar'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={regenerating}
            className="btn-secondary shrink-0"
            title="Generar una API Key nueva"
          >
            {regenerating ? <Spinner className="h-4 w-4" label="Regenerando" /> : <IconRefresh className="h-4 w-4" />}
            <span className="hidden sm:inline">Regenerar</span>
          </button>
        </div>
      </div>

      {confirming && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">¿Regenerar la API Key?</p>
          <p className="mt-1 text-xs text-amber-700">
            La clave actual dejará de funcionar inmediatamente en tus integraciones.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-danger btn-sm" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? <Spinner className="h-3.5 w-3.5" label="Regenerando" /> : null}
              Sí, regenerar
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        No la compartas públicamente. Si se filtra, regenérala.
      </p>
    </section>
  );
}
