'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ApiKeyCard from '@/components/ApiKeyCard';
import PasswordCard from '@/components/PasswordCard';
import PlantillaEditor from '@/components/PlantillaEditor';
import PlanUsageCard, { normalizePlan } from '@/components/PlanUsageCard';
import { Alert, PageHeader, Spinner } from '@/components/ui';
import { IconBilling, IconMail } from '@/components/icons';
import { API_URL, getMe, sendTestEmail } from '@/lib/api';
import { useSession } from '@/lib/auth';

export default function SettingsPage() {
  const { user } = useSession();
  const [apiKey, setApiKeyState] = useState('');
  const [usage, setUsage] = useState({ plan: 'free', used: 0, limit: 20 });
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [usageError, setUsageError] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState(null); // { type, message }

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    setUsageError('');
    try {
      const data = await getMe();
      const me = data?.usuario || data?.user || data?.data || data || {};
      setApiKeyState(me.api_key || '');
      const limit = Number(me.limite_recordatorios ?? me.reminders_limit ?? 20);
      setUsage({
        plan: normalizePlan(me.plan ?? me.plan_actual ?? me.planActual),
        used: Number(me.recordatorios_usados ?? me.reminders_used ?? me.recordatorios ?? 0),
        // El backend devuelve -1 para planes ilimitados
        limit: limit > 0 ? limit : 20,
      });
    } catch (error) {
      // Si el endpoint no existe o falla, mantenemos los valores por defecto
      setUsageError(error?.message || 'No se pudo obtener el uso del plan.');
    } finally {
      setLoadingUsage(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadUsage();
    else if (user === null) setLoadingUsage(false);
  }, [user, loadUsage]);

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailNotice(null);
    try {
      const data = await sendTestEmail();
      setEmailNotice({
        type: 'success',
        message: `Correo de prueba enviado a ${data?.email || 'tu email'}. Revisa tu bandeja de entrada.`,
      });
    } catch (error) {
      setEmailNotice({
        type: 'error',
        message: error?.message || 'No se pudo enviar el correo de prueba.',
      });
    } finally {
      setTestingEmail(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Administra tu acceso a la API y revisa el consumo de tu plan."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PasswordCard email={user?.email} />

          <PlantillaEditor />

          <ApiKeyCard apiKey={apiKey} onChange={setApiKeyState} />

          {usageError && (
            <Alert type="warning" title="No se pudo cargar el uso del plan" onClose={() => setUsageError('')}>
              {usageError}
            </Alert>
          )}

          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900">Conexión con la API</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Todas las peticiones se envían a la URL base configurada en{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                NEXT_PUBLIC_API_URL
              </code>
              .
            </p>

            <dl className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
              <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm font-medium text-slate-600">URL base</dt>
                <dd className="truncate font-mono text-sm text-slate-900">{API_URL}</dd>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm font-medium text-slate-600">Header de autenticación</dt>
                <dd className="font-mono text-sm text-slate-900">X-API-Key</dd>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm font-medium text-slate-600">Endpoint de facturas</dt>
                <dd className="truncate font-mono text-sm text-slate-900">/api/v1/facturas</dd>
              </div>
              <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm font-medium text-slate-600">Estado del backend</dt>
                <dd className="text-sm">
                  {loadingUsage ? (
                    <span className="text-slate-400">Comprobando…</span>
                  ) : usageError ? (
                    <span className="font-medium text-rose-600">Sin conexión</span>
                  ) : (
                    <span className="font-medium text-emerald-600">Conectado</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Envío de emails</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Comprueba que el backend puede enviar correos con tu configuración de Resend.
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testingEmail || !apiKey}
                className="btn-secondary shrink-0"
              >
                {testingEmail ? <Spinner className="h-4 w-4" label="Enviando" /> : <IconMail className="h-4 w-4" />}
                Enviar email de prueba
              </button>
            </div>

            {emailNotice && (
              <Alert
                type={emailNotice.type}
                className="mt-3"
                onClose={() => setEmailNotice(null)}
              >
                {emailNotice.message}
              </Alert>
            )}

            <div className="mt-5 rounded-xl bg-slate-900 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Ejemplo de petición
              </p>
              <pre className="overflow-x-auto text-xs leading-relaxed text-slate-200">
                <code>{`curl ${API_URL}/api/v1/facturas \\
  -H "X-API-Key: ${apiKey ? '••••••••' : 'TU_API_KEY'}"`}</code>
              </pre>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <PlanUsageCard usage={usage} loading={loadingUsage} />

          <section className="card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <IconBilling className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Suscripción</h2>
                <p className="text-sm text-slate-500">Gestiona tu plan y facturas.</p>
              </div>
            </div>
            <Link href="/billing" className="btn-secondary mt-5 w-full">
              Ver planes
            </Link>
          </section>

          <section className="card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <IconMail className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Soporte</h2>
                <p className="text-sm text-slate-500">¿Dudas con la integración?</p>
              </div>
            </div>
            <a href="mailto:soporte@nudgepay.app" className="btn-ghost mt-4 w-full border border-slate-200">
              Contactar soporte
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
