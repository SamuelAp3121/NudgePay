'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, PageHeader, Spinner } from '@/components/ui';
import { IconCheck, IconClock, IconMail, IconSparkles } from '@/components/icons';
import { getReporteResumen, descargarReporteCSV, getSuscripcion } from '@/lib/api';
import { normalizePlan, planLabel, isPaidPlan } from '@/components/PlanUsageCard';
import { formatCurrency } from '@/lib/format';
import { useSession } from '@/lib/auth';

function StatCard({ label, value, hint, icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-500',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <div className="card p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function mesActualISO() {
  const now = new Date();
  const inicio = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { desde: inicio.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
}

export default function ReportesPage() {
  const { user } = useSession();
  const [plan, setPlan] = useState('free');
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bloqueado, setBloqueado] = useState(false);
  const [rango, setRango] = useState(mesActualISO);
  const [descargando, setDescargando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    setBloqueado(false);
    try {
      // Plan actual (para saber si mostrar el upsell).
      try {
        const sub = await getSuscripcion();
        const me = sub?.usuario || sub?.user || sub?.data || sub || {};
        setPlan(normalizePlan(me.plan ?? me.plan_actual ?? me.planActual));
      } catch {
        /* si falla, el resumen dirá si hay acceso */
      }
      const data = await getReporteResumen(rango);
      setResumen(data?.resumen || null);
    } catch (err) {
      if (err?.status === 402) {
        setBloqueado(true);
        setError('');
      } else {
        setError(err?.message || 'No se pudo cargar el reporte.');
      }
    } finally {
      setLoading(false);
    }
  }, [rango]);

  useEffect(() => {
    if (user) cargar();
    else if (user === null) setLoading(false);
  }, [user, cargar]);

  const handleDescargar = async () => {
    setDescargando(true);
    try {
      await descargarReporteCSV({ ...rango });
    } catch (err) {
      setError(err?.message || 'No se pudo descargar el CSV.');
    } finally {
      setDescargando(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" label="Cargando" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reportes de cobro"
        description="Efectividad de tus cobros por rango de fechas y exportación a CSV."
        actions={
          !bloqueado && (
            <>
              <input
                type="date"
                value={rango.desde}
                max={rango.hasta}
                onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
                className="input w-auto text-sm"
                aria-label="Desde"
              />
              <input
                type="date"
                value={rango.hasta}
                min={rango.desde}
                onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
                className="input w-auto text-sm"
                aria-label="Hasta"
              />
              <button type="button" onClick={handleDescargar} disabled={descargando || loading} className="btn-primary">
                {descargando ? <Spinner className="h-4 w-4" label="Descargando" /> : null}
                Descargar CSV
              </button>
            </>
          )
        }
      />

      {error && (
        <Alert type="error" title="No se pudo cargar el reporte" onClose={() => setError('')} className="mb-6">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spinner className="h-8 w-8 text-brand-600" label="Cargando" />
        </div>
      ) : bloqueado ? (
        <div className="card mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <IconSparkles className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Los reportes son del plan Pro</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            El resumen de cobros, la tasa de recuperación y la exportación a CSV están disponibles
            desde el plan Pro. Tu plan actual es {planLabel(plan)}.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/billing" className="btn-primary">
              Ver planes Pro y Business
            </Link>
            <Link href="/dashboard" className="btn-secondary">
              Volver al dashboard
            </Link>
          </div>
        </div>
      ) : resumen ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Cobrado en el periodo"
              value={formatCurrency(resumen.monto_cobrado, 'COP')}
              hint={`${resumen.cuotas_cobradas ?? 0} cuotas cobradas`}
              tone="emerald"
              icon={<IconCheck className="h-5 w-5" />}
            />
            <StatCard
              label="Pendiente por cobrar"
              value={formatCurrency(resumen.monto_pendiente, 'COP')}
              hint={`${resumen.facturas_pendientes ?? 0} facturas pendientes`}
              tone="amber"
              icon={<IconClock className="h-5 w-5" />}
            />
            <StatCard
              label="Tasa de recuperación"
              value={`${Number(resumen.tasa_recuperacion_pct ?? 0).toFixed(1)}%`}
              hint={`De ${formatCurrency(resumen.monto_facturado, 'COP')} facturado`}
              tone="brand"
              icon={<IconSparkles className="h-5 w-5" />}
            />
            <StatCard
              label="Recordatorios enviados"
              value={resumen.recordatorios_total ?? 0}
              hint={`${resumen.recordatorios_email ?? 0} email · ${resumen.recordatorios_whatsapp ?? 0} WhatsApp`}
              tone="slate"
              icon={<IconMail className="h-5 w-5" />}
            />
          </div>

          {resumen.plan === 'business' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="card p-6">
                <h2 className="text-base font-semibold text-slate-900">Deuda vencida</h2>
                <p className="mt-1 text-sm text-slate-500">Lo que ya pasó su fecha de vencimiento.</p>
                <p className="mt-4 text-3xl font-bold text-rose-600">
                  {formatCurrency(resumen.monto_vencido, 'COP')}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {resumen.facturas_vencidas ?? 0} facturas vencidas
                </p>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-sm font-medium text-slate-700">Por vencer (7 días)</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {formatCurrency(resumen.monto_por_vencer_7d, 'COP')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {resumen.cuotas_por_vencer_7d ?? 0} cuotas vencen esta semana
                  </p>
                </div>
              </section>

              <section className="card p-6">
                <h2 className="text-base font-semibold text-slate-900">Top deudores</h2>
                <p className="mt-1 text-sm text-slate-500">Clientes con más saldo pendiente.</p>
                {(resumen.top_deudores || []).length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">Sin deuda pendiente. ¡Buen trabajo!</p>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {(resumen.top_deudores || []).map((d) => (
                      <li key={d.email || d.cliente} className="flex items-center justify-between py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{d.cliente}</p>
                          <p className="truncate text-xs text-slate-400">
                            {d.facturas} factura{d.facturas === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-slate-900">
                          {formatCurrency(d.pendiente, 'COP')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {resumen.plan === 'pro' && (
            <Alert type="info" title="Tip Business" className="mt-6">
              El plan <Link href="/billing" className="font-semibold underline">Business</Link> añade
              deuda vencida, cuotas por vencer y top deudores a este reporte.
            </Alert>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            Periodo: {resumen.desde} → {resumen.hasta} · Plan {planLabel(resumen.plan)}
            {!isPaidPlan(plan) && ' · '}
          </p>
        </>
      ) : null}
    </div>
  );
}
