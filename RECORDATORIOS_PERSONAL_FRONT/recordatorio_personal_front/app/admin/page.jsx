'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Spinner } from '@/components/ui';
import {
  IconBilling,
  IconCheckCircle,
  IconCreditCard,
  IconMail,
  IconRefresh,
  IconShield,
  IconUsers,
  IconWhatsApp,
} from '@/components/icons';
import { adminResumen, adminSistema } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

function StatCard({ label, value, hint, icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-500',
    rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function EstadoSistema({ sistema }) {
  const items = [
    { label: 'Base de datos', ok: sistema?.base_datos },
    { label: 'Envío de emails', ok: sistema?.email },
    { label: 'Pasarela de pagos', ok: sistema?.pasarela },
    { label: 'WhatsApp', ok: sistema?.whatsapp },
  ];
  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold text-slate-900">Estado del sistema</h2>
      <p className="mt-0.5 text-sm text-slate-500">Configuración detectada por el backend.</p>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center justify-between rounded-lg border border-slate-200 px-3.5 py-2.5">
            <span className="text-sm font-medium text-slate-700">{item.label}</span>
            <span
              className={`badge ${item.ok
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                  : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
                }`}
            >
              {item.ok ? 'Operativo' : 'Sin configurar'}
            </span>
          </li>
        ))}
      </ul>
      {sistema?.hora_servidor && (
        <p className="mt-3 text-xs text-slate-400">Hora del servidor: {sistema.hora_servidor}</p>
      )}
    </section>
  );
}

export default function AdminResumenPage() {
  const [data, setData] = useState(null);
  const [sistema, setSistema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [resumen, estado] = await Promise.all([adminResumen(), adminSistema()]);
      setData(resumen);
      setSistema(estado);
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las métricas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" label="Cargando métricas" />
      </div>
    );
  }

  const usuarios = data?.usuarios || {};
  const facturas = data?.facturas || {};
  const suscripciones = data?.suscripciones || {};
  const pagos = data?.pagos || {};
  const canales = data?.canales || {};

  return (
    <div>
      {error && (
        <Alert type="error" title="Error al cargar el panel" className="mb-6" onClose={() => setError('')}>
          <p>{error}</p>
          <button type="button" onClick={load} className="mt-1 font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </Alert>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Métricas globales</h2>
        <button type="button" onClick={load} disabled={loading} className="btn-secondary btn-sm">
          <IconRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Usuarios"
          value={usuarios.total ?? '—'}
          hint={`${usuarios.pro ?? 0} Pro · ${usuarios.free ?? 0} Free · ${usuarios.nuevos_mes ?? 0} nuevos este mes`}
          tone="brand"
          icon={<IconUsers className="h-5 w-5" />}
        />
        <StatCard
          label="Facturas"
          value={facturas.total ?? '—'}
          hint={`${facturas.pendientes ?? 0} pendientes`}
          tone="amber"
          icon={<IconBilling className="h-5 w-5" />}
        />
        <StatCard
          label="Por cobrar"
          value={formatCurrency(facturas.monto_pendiente ?? 0)}
          hint="Suma de facturas pendientes"
          tone="slate"
          icon={<IconMail className="h-5 w-5" />}
        />
        <StatCard
          label="Cobrado"
          value={formatCurrency(facturas.monto_cobrado ?? 0)}
          hint="Cuotas pagadas"
          tone="emerald"
          icon={<IconCheckCircle className="h-5 w-5" />}
        />
        <StatCard
          label="Suscripciones"
          value={suscripciones.pagadas ?? '—'}
          hint={`${suscripciones.pendientes ?? 0} pendientes de conciliar`}
          tone="brand"
          icon={<IconShield className="h-5 w-5" />}
        />
        <StatCard
          label="Ingresos Pro"
          value={formatCurrency(suscripciones.ingresos ?? 0)}
          hint={`Precio actual: ${formatCurrency(suscripciones.precio_cop ?? 0)} / mes`}
          tone="emerald"
          icon={<IconCreditCard className="h-5 w-5" />}
        />
        <StatCard
          label="Pagos aprobados"
          value={pagos.aprobados ?? '—'}
          hint={`${formatCurrency(pagos.monto ?? 0)} procesados`}
          tone="slate"
          icon={<IconCreditCard className="h-5 w-5" />}
        />
        <StatCard
          label="Recordatorios (mes)"
          value={data?.recordatorios_mes ?? '—'}
          hint={`${usuarios.suspendidos ?? 0} cuentas suspendidas`}
          tone="amber"
          icon={<IconMail className="h-5 w-5" />}
        />
        <StatCard
          label="WhatsApp (mes)"
          value={canales.whatsapp_mes ?? '—'}
          hint={
            canales.whatsapp_configurado
              ? `${canales.whatsapp_fallidos_mes ?? 0} fallidos · ${canales.email_mes ?? 0} por email`
              : 'Canal sin configurar'
          }
          tone={canales.whatsapp_configurado ? 'emerald' : 'rose'}
          icon={<IconWhatsApp className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">Últimos registros</h2>
            <Link href="/admin/usuarios" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
              Ver todos
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] divide-y divide-slate-100">
              <thead className="bg-slate-50/80">
                <tr>
                  {['Email', 'Plan', 'Rol', 'Registro'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(data?.usuarios_recientes || []).map((usuario) => (
                  <tr key={usuario.id} className="hover:bg-slate-50/70">
                    <td className="max-w-[220px] truncate px-4 py-3 text-sm text-slate-800">
                      <Link href={`/admin/usuarios/${usuario.id}`} className="hover:text-brand-600">
                        {usuario.email}
                      </Link>
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
                      {usuario.rol === 'admin' ? 'Administrador' : 'Usuario'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(usuario.creado_en)}
                    </td>
                  </tr>
                ))}
                {(data?.usuarios_recientes || []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                      Todavía no hay usuarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <EstadoSistema sistema={sistema} />
      </div>
    </div>
  );
}
