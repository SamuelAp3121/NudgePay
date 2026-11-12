'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, EmptyState, Spinner } from '@/components/ui';
import { IconRefresh, IconSearch, IconWhatsApp } from '@/components/icons';
import { adminListarEnviosWhatsApp, adminWhatsAppResumen, adminWhatsAppTest } from '@/lib/api';
import { formatDate } from '@/lib/format';

function StatCard({ label, value, hint, tone = 'emerald' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-500',
  };
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      <span className={`mt-3 inline-block h-1 w-10 rounded-full ${tones[tone]}`} />
    </div>
  );
}

export default function AdminWhatsAppPage() {
  const [resumen, setResumen] = useState(null);
  const [envios, setEnvios] = useState([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [telefonoPrueba, setTelefonoPrueba] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, lista] = await Promise.all([
        adminWhatsAppResumen(),
        adminListarEnviosWhatsApp({ q: busqueda, estado, page, limit: 25 }),
      ]);
      setResumen(res);
      setEnvios(lista?.envios || []);
      setTotal(Number(lista?.total) || 0);
      setPaginas(Number(lista?.paginas) || 1);
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el panel de WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, [busqueda, estado, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleTest = async (event) => {
    event.preventDefault();
    setTesting(true);
    setNotice(null);
    try {
      await adminWhatsAppTest(telefonoPrueba.trim());
      setNotice({ type: 'success', message: 'Mensaje de prueba enviado con la configuración global.' });
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo enviar el mensaje de prueba.' });
    } finally {
      setTesting(false);
    }
  };

  const enviosData = resumen?.envios || {};

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">WhatsApp</h2>
          <p className="text-sm text-slate-500">
            Estado del canal, envíos y pruebas con la cuenta global de Meta Cloud API.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-secondary btn-sm">
          <IconRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {notice && (
        <Alert type={notice.type} className="mb-5" onClose={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      {resumen?.migracion_pendiente && (
        <Alert type="warning" title="Migración pendiente" className="mb-5">
          La base de datos aún no tiene las columnas del módulo de WhatsApp. Aplica
          <code className="mx-1 rounded bg-white px-1.5 py-0.5 font-mono text-xs">
            migrations/001_whatsapp.sql
          </code>
          para activarlo.
        </Alert>
      )}

      {error && (
        <Alert type="error" title="Error al cargar WhatsApp" className="mb-5" onClose={() => setError('')}>
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-1 font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Enviados (mes)"
          value={enviosData.mes_enviados ?? '—'}
          hint={`${enviosData.total_enviados ?? 0} en total`}
          tone="emerald"
        />
        <StatCard
          label="Fallidos (mes)"
          value={enviosData.mes_fallidos ?? '—'}
          hint={`${enviosData.total_fallidos ?? 0} en total`}
          tone="rose"
        />
        <StatCard
          label="Cuentas con WhatsApp"
          value={resumen?.usuarios_activos ?? '—'}
          hint="Usuarios con el canal activo"
          tone="slate"
        />
        <StatCard
          label="Facturas por WhatsApp"
          value={resumen?.facturas_whatsapp ?? '—'}
          hint="Canal whatsapp o ambos"
          tone="amber"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <IconWhatsApp className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Configuración global</h3>
              <p className="text-sm text-slate-500">Credenciales del servidor (.env).</p>
            </div>
          </div>

          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
              <span className="font-medium text-slate-700">Estado</span>
              <span
                className={`badge ${resumen?.configurado
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                  : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
                  }`}
              >
                {resumen?.configurado ? 'Operativo' : 'Sin configurar'}
              </span>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
              <span className="font-medium text-slate-700">Phone Number ID</span>
              <span className="truncate font-mono text-xs text-slate-600">
                {resumen?.phone_number_id || '—'}
              </span>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
              <span className="font-medium text-slate-700">Plantilla</span>
              <span className="truncate font-mono text-xs text-slate-600">
                {resumen?.template_name || 'texto libre'}
              </span>
            </li>
            <li className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
              <span className="font-medium text-slate-700">API</span>
              <span className="font-mono text-xs text-slate-600">{resumen?.api_version || '—'}</span>
            </li>
          </ul>

          <form onSubmit={handleTest} className="mt-4 space-y-2">
            <label htmlFor="wa-test" className="label">
              Probar envío
            </label>
            <input
              id="wa-test"
              type="tel"
              value={telefonoPrueba}
              onChange={(event) => setTelefonoPrueba(event.target.value)}
              placeholder="573001234567"
              className="input"
            />
            <button
              type="submit"
              disabled={testing || !telefonoPrueba.trim()}
              className="btn-primary w-full"
            >
              {testing ? <Spinner className="h-4 w-4" label="Enviando" /> : null}
              Enviar mensaje de prueba
            </button>
          </form>
        </section>

        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Envíos por WhatsApp</h3>
              <p className="text-sm text-slate-500">{total} registro{total === 1 ? '' : 's'}.</p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setBusqueda(q.trim());
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Teléfono o email"
                  className="input pl-9 sm:w-52"
                />
              </div>
              <select
                value={estado}
                onChange={(event) => {
                  setEstado(event.target.value);
                  setPage(1);
                }}
                className="input sm:w-36"
              >
                <option value="">Todos</option>
                <option value="enviado">Enviados</option>
                <option value="fallido">Fallidos</option>
              </select>
              <button type="submit" className="btn-primary shrink-0">
                Buscar
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  {['Destino', 'Cuenta', 'Estado', 'Fecha', 'Detalle'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <Spinner className="mx-auto h-6 w-6 text-brand-600" label="Cargando envíos" />
                    </td>
                  </tr>
                ) : (
                  envios.map((envio) => (
                    <tr key={envio.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                        {envio.destino || '—'}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        {envio.usuario_id ? (
                          <Link
                            href={`/admin/usuarios/${envio.usuario_id}`}
                            className="block truncate text-sm text-slate-600 hover:text-brand-600"
                          >
                            {envio.usuario_email || envio.usuario_id}
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`badge ${envio.estado === 'enviado'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
                            }`}
                        >
                          {envio.estado === 'enviado' ? 'Enviado' : 'Fallido'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {formatDate(envio.enviado_en)}
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-xs text-slate-500" title={envio.error || ''}>
                        {envio.error || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && envios.length === 0 && (
            <EmptyState
              icon={<IconWhatsApp className="h-7 w-7" />}
              title="Sin envíos"
              description="Todavía no se ha enviado ningún recordatorio por WhatsApp."
            />
          )}

          {!loading && envios.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm text-slate-500">
              <span>
                Página {page} de {paginas}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1}
                  className="btn-secondary btn-sm"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(paginas, value + 1))}
                  disabled={page >= paginas}
                  className="btn-secondary btn-sm"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
