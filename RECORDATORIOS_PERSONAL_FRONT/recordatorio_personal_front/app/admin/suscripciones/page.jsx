'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, EmptyState, Spinner } from '@/components/ui';
import { IconCheck, IconSearch, IconShield } from '@/components/icons';
import {
  adminActivarSuscripcion,
  adminCancelarSuscripcion,
  adminListarSuscripciones,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

export default function AdminSuscripcionesPage() {
  const [suscripciones, setSuscripciones] = useState([]);
  const [total, setTotal] = useState(0);
  const [ingresos, setIngresos] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [working, setWorking] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListarSuscripciones({ q: busqueda, estado, page, limit: 25 });
      setSuscripciones(data?.suscripciones || []);
      setTotal(Number(data?.total) || 0);
      setIngresos(Number(data?.ingresos) || 0);
      setPaginas(Number(data?.paginas) || 1);
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las suscripciones.');
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

  const run = async (key, fn, mensaje) => {
    setWorking(key);
    setNotice(null);
    try {
      await fn();
      setNotice({ type: 'success', message: mensaje });
      await load();
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo completar la acción.' });
    } finally {
      setWorking('');
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Suscripciones</h2>
          <p className="text-sm text-slate-500">
            {total} orden{total === 1 ? '' : 'es'} · {formatCurrency(ingresos)} cobrados en plan Pro.
          </p>
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
              placeholder="Referencia o email"
              className="input pl-9 sm:w-64"
            />
          </div>
          <select
            value={estado}
            onChange={(event) => {
              setEstado(event.target.value);
              setPage(1);
            }}
            className="input sm:w-44"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="pagada">Pagadas</option>
          </select>
          <button type="submit" className="btn-primary shrink-0">
            Buscar
          </button>
        </form>
      </div>

      {notice && (
        <Alert type={notice.type} className="mb-5" onClose={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      {error && (
        <Alert type="error" title="Error al cargar las suscripciones" className="mb-5" onClose={() => setError('')}>
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-1 font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </Alert>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr>
                {['Referencia', 'Cuenta', 'Monto', 'Estado', 'Creada', 'Pagada', ''].map((header, index) => (
                  <th
                    key={header || 'acciones'}
                    scope="col"
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${index === 6 ? 'text-right' : 'text-left'
                      }`}
                  >
                    {header || <span className="sr-only">Acciones</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Spinner className="mx-auto h-6 w-6 text-brand-600" label="Cargando suscripciones" />
                  </td>
                </tr>
              ) : (
                suscripciones.map((suscripcion) => (
                  <tr key={suscripcion.id || suscripcion.referencia} className="hover:bg-slate-50/70">
                    <td className="max-w-[240px] truncate px-4 py-3 font-mono text-xs text-slate-600">
                      {suscripcion.referencia}
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <Link
                        href={`/admin/usuarios/${suscripcion.usuario_id}`}
                        className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-600"
                      >
                        {suscripcion.usuario_email}
                      </Link>
                      <p className="text-xs text-slate-400">
                        Plan actual: {suscripcion.usuario_plan === 'pro' ? 'Pro' : 'Free'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                      {formatCurrency(suscripcion.monto, suscripcion.moneda)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${suscripcion.estado === 'pagada'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                          }`}
                      >
                        {suscripcion.estado}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(suscripcion.creado_en)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {suscripcion.pagada_en ? formatDate(suscripcion.pagada_en) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {suscripcion.estado !== 'pagada' && (
                          <button
                            type="button"
                            onClick={() =>
                              run(
                                `activar-${suscripcion.referencia}`,
                                () => adminActivarSuscripcion(suscripcion.referencia),
                                'Suscripción activada: el usuario tiene Pro por 1 mes.'
                              )
                            }
                            disabled={Boolean(working)}
                            className="btn-secondary btn-sm"
                            title="Conciliar el pago manualmente"
                          >
                            {working === `activar-${suscripcion.referencia}` ? (
                              <Spinner className="h-3.5 w-3.5" label="Activando" />
                            ) : (
                              <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                            Activar
                          </button>
                        )}
                        {suscripcion.usuario_plan === 'pro' && (
                          <button
                            type="button"
                            onClick={() =>
                              run(
                                `cancelar-${suscripcion.referencia}`,
                                () => adminCancelarSuscripcion(suscripcion.referencia),
                                'Suscripción cancelada: el usuario vuelve al plan Free.'
                              )
                            }
                            disabled={Boolean(working)}
                            className="btn-secondary btn-sm"
                            title="Devolver al plan gratuito"
                          >
                            {working === `cancelar-${suscripcion.referencia}` ? (
                              <Spinner className="h-3.5 w-3.5" label="Cancelando" />
                            ) : null}
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && suscripciones.length === 0 && (
          <EmptyState
            icon={<IconShield className="h-7 w-7" />}
            title="Sin suscripciones"
            description="Todavía no se ha generado ninguna orden de pago del plan Pro."
          />
        )}

        {!loading && suscripciones.length > 0 && (
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
      </div>
    </div>
  );
}
