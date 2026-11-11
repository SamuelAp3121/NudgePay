'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, EmptyState, Spinner } from '@/components/ui';
import { IconSearch, IconUsers } from '@/components/icons';
import { adminListarUsuarios } from '@/lib/api';
import { formatDate } from '@/lib/format';

const FILTROS = [
  { value: '', label: 'Todos los planes' },
  { value: 'free', label: 'Plan Free' },
  { value: 'pro', label: 'Plan Pro' },
];

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [plan, setPlan] = useState('');
  const [suspendido, setSuspendido] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListarUsuarios({ q: busqueda, plan, suspendido, page, limit: 25 });
      setUsuarios(data?.usuarios || []);
      setTotal(Number(data?.total) || 0);
      setPaginas(Number(data?.paginas) || 1);
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [busqueda, plan, suspendido, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setBusqueda(q.trim());
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Usuarios</h2>
          <p className="text-sm text-slate-500">{total} cuenta{total === 1 ? '' : 's'} registrada{total === 1 ? '' : 's'}.</p>
        </div>
        <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Buscar por email o ID"
              className="input pl-9 sm:w-64"
            />
          </div>
          <select
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value);
              setPage(1);
            }}
            className="input sm:w-40"
          >
            {FILTROS.map((filtro) => (
              <option key={filtro.value} value={filtro.value}>
                {filtro.label}
              </option>
            ))}
          </select>
          <select
            value={suspendido}
            onChange={(event) => {
              setSuspendido(event.target.value);
              setPage(1);
            }}
            className="input sm:w-40"
          >
            <option value="">Todas las cuentas</option>
            <option value="false">Activas</option>
            <option value="true">Suspendidas</option>
          </select>
          <button type="submit" className="btn-primary shrink-0">
            Buscar
          </button>
        </form>
      </div>

      {error && (
        <Alert type="error" title="Error al cargar los usuarios" className="mb-5" onClose={() => setError('')}>
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-1 font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </Alert>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr>
                {['Cuenta', 'Plan', 'Rol', 'Facturas', 'Recordatorios', 'Registro', 'Estado', ''].map((header, index) => (
                  <th
                    key={header || 'acciones'}
                    scope="col"
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${index === 7 ? 'text-right' : 'text-left'
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
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Spinner className="mx-auto h-6 w-6 text-brand-600" label="Cargando usuarios" />
                  </td>
                </tr>
              ) : (
                usuarios.map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-slate-50/70">
                    <td className="max-w-[260px] px-4 py-3">
                      <Link
                        href={`/admin/usuarios/${usuario.id}`}
                        className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-600"
                      >
                        {usuario.email}
                      </Link>
                      <p className="truncate text-xs text-slate-400">#{String(usuario.id).slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${usuario.plan === 'pro'
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200'
                          }`}
                      >
                        {usuario.plan === 'pro' ? 'Pro' : 'Free'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {usuario.rol === 'admin' ? (
                        <span className="badge bg-slate-900 text-white">Admin</span>
                      ) : (
                        'Usuario'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {usuario.facturas}
                      {usuario.facturas_pendientes > 0 && (
                        <span className="ml-1 text-xs text-amber-600">({usuario.facturas_pendientes} pend.)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{usuario.recordatorios_mes}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(usuario.creado_en)}
                    </td>
                    <td className="px-4 py-3">
                      {usuario.suspendido ? (
                        <span className="badge bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">
                          Suspendida
                        </span>
                      ) : (
                        <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          Activa
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link href={`/admin/usuarios/${usuario.id}`} className="btn-secondary btn-sm">
                        Gestionar
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && usuarios.length === 0 && (
          <EmptyState
            icon={<IconUsers className="h-7 w-7" />}
            title="Sin resultados"
            description="No hay cuentas que coincidan con la búsqueda o los filtros aplicados."
          />
        )}

        {!loading && usuarios.length > 0 && (
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
