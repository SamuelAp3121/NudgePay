'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, EmptyState, Spinner } from '@/components/ui';
import { IconBilling, IconSearch } from '@/components/icons';
import { adminListarFacturas } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

export default function AdminFacturasPage() {
  const [facturas, setFacturas] = useState([]);
  const [total, setTotal] = useState(0);
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
      const data = await adminListarFacturas({ q: busqueda, estado, page, limit: 25 });
      setFacturas(data?.facturas || []);
      setTotal(Number(data?.total) || 0);
      setPaginas(Number(data?.paginas) || 1);
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las facturas.');
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
          <h2 className="text-lg font-semibold text-slate-900">Facturas</h2>
          <p className="text-sm text-slate-500">{total} factura{total === 1 ? '' : 's'} en todas las cuentas.</p>
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
              placeholder="Cliente, email o ID"
              className="input pl-9 sm:w-64"
            />
          </div>
          <select
            value={estado}
            onChange={(event) => {
              setEstado(event.target.value);
              setPage(1);
            }}
            className="input sm:w-40"
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

      {error && (
        <Alert type="error" title="Error al cargar las facturas" className="mb-5" onClose={() => setError('')}>
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-1 font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </Alert>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr>
                {['Cliente', 'Cuenta', 'Monto', 'Cuotas', 'Vencimiento', 'Estado', ''].map((header, index) => (
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
                    <Spinner className="mx-auto h-6 w-6 text-brand-600" label="Cargando facturas" />
                  </td>
                </tr>
              ) : (
                facturas.map((factura) => (
                  <tr key={factura.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{factura.cliente_nombre}</p>
                      <p className="truncate text-xs text-slate-400">{factura.cliente_email}</p>
                    </td>
                    <td className="max-w-[200px] px-4 py-3">
                      <Link
                        href={`/admin/usuarios/${factura.usuario_id}`}
                        className="block truncate text-sm text-slate-600 hover:text-brand-600"
                      >
                        {factura.usuario_email}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                      {formatCurrency(factura.monto, factura.moneda)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {factura.cuotas_pagadas}/{factura.cuotas}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {formatDate(factura.fecha_vencimiento)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${factura.estado === 'pagada'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                          }`}
                      >
                        {factura.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={`/admin/usuarios/${factura.usuario_id}`} className="btn-secondary btn-sm">
                        Ver cuenta
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && facturas.length === 0 && (
          <EmptyState
            icon={<IconBilling className="h-7 w-7" />}
            title="Sin facturas"
            description="No hay facturas que coincidan con la búsqueda o los filtros."
          />
        )}

        {!loading && facturas.length > 0 && (
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
