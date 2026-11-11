'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, EmptyState, Spinner } from '@/components/ui';
import { IconCreditCard, IconSearch } from '@/components/icons';
import { adminListarPagos } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

export default function AdminPagosPage() {
  const [pagos, setPagos] = useState([]);
  const [total, setTotal] = useState(0);
  const [montoTotal, setMontoTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListarPagos({ q: busqueda, estado, page, limit: 25 });
      setPagos(data?.pagos || []);
      setTotal(Number(data?.total) || 0);
      setMontoTotal(Number(data?.monto_total) || 0);
      setPaginas(Number(data?.paginas) || 1);
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar los pagos.');
    } finally {
      setLoading(false);
    }
  }, [busqueda, estado, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Pagos de pasarela</h2>
          <p className="text-sm text-slate-500">
            {total} pago{total === 1 ? '' : 's'} · {formatCurrency(montoTotal)} procesados.
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
            <option value="APPROVED">Aprobados</option>
            <option value="DECLINED">Rechazados</option>
            <option value="VOIDED">Anulados</option>
          </select>
          <button type="submit" className="btn-primary shrink-0">
            Buscar
          </button>
        </form>
      </div>

      {error && (
        <Alert type="error" title="Error al cargar los pagos" className="mb-5" onClose={() => setError('')}>
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-1 font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </Alert>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr>
                {['Referencia', 'Cliente', 'Cuenta', 'Cuota', 'Monto', 'Método', 'Estado', 'Fecha'].map((header) => (
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
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Spinner className="mx-auto h-6 w-6 text-brand-600" label="Cargando pagos" />
                  </td>
                </tr>
              ) : (
                pagos.map((pago) => (
                  <tr key={pago.id} className="hover:bg-slate-50/70">
                    <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-slate-600">
                      {pago.referencia || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{pago.cliente_nombre}</p>
                      <p className="truncate text-xs text-slate-400">{pago.cliente_email}</p>
                    </td>
                    <td className="max-w-[180px] px-4 py-3">
                      <Link
                        href={`/admin/usuarios/${pago.usuario_id}`}
                        className="block truncate text-sm text-slate-600 hover:text-brand-600"
                      >
                        {pago.usuario_email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{pago.cuota}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                      {formatCurrency(pago.monto, pago.moneda)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{pago.metodo || pago.pasarela || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${pago.estado === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
                          }`}
                      >
                        {pago.estado || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(pago.creado_en)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && pagos.length === 0 && (
          <EmptyState
            icon={<IconCreditCard className="h-7 w-7" />}
            title="Sin pagos"
            description="Todavía no hay transacciones de la pasarela registradas."
          />
        )}

        {!loading && pagos.length > 0 && (
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
