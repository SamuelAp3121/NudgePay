'use client';

import Link from 'next/link';
import { IconSparkles } from './icons';

export const PLAN_LIMITS = { free: 10, pro: Infinity, business: Infinity };
export const PLAN_INVOICE_LIMITS = { free: 10, pro: Infinity, business: Infinity };
export const PLAN_MAX_CUOTAS = { free: 3, pro: 12, business: 60 };

const PLAN_LABELS = { free: 'Gratuito', pro: 'Pro', business: 'Business' };

export function normalizePlan(value) {
  const plan = String(value || 'free').toLowerCase();
  if (plan === 'pro' || plan === 'business') return plan;
  return 'free';
}

export function planLabel(plan) {
  return PLAN_LABELS[normalizePlan(plan)] || 'Gratuito';
}

export function isPaidPlan(plan) {
  const p = normalizePlan(plan);
  return p === 'pro' || p === 'business';
}

/**
 * Tarjeta con el plan actual y el consumo de recordatorios.
 * `usage` = { plan, used, limit, facturasPendientes?, limiteFacturas?, maxCuotas? }
 */
export default function PlanUsageCard({ usage, loading = false }) {
  const plan = normalizePlan(usage?.plan);
  const paid = isPaidPlan(plan);
  const limit = paid ? Infinity : usage?.limit ?? PLAN_LIMITS.free;
  const used = Math.max(0, Number(usage?.used) || 0);
  const percent = paid ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const remaining = paid ? Infinity : Math.max(0, limit - used);
  const nearLimit = !paid && percent >= 80;

  const facturasPendientes = usage?.facturasPendientes;
  const limiteFacturas = usage?.limiteFacturas;

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Plan actual</h2>
          <p className="mt-0.5 text-sm text-slate-500">Consumo de recordatorios de este mes.</p>
        </div>
        <span
          className={`badge ${paid
            ? 'bg-brand-600 text-white'
            : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200'
            }`}
        >
          {paid && <IconSparkles className="h-3.5 w-3.5" />}
          {planLabel(plan)}
        </span>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="h-2.5 w-full rounded-full bg-slate-100" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-medium text-slate-700">
                {paid ? (
                  <>
                    <span className="text-2xl font-bold text-slate-900">{used}</span> recordatorios
                    enviados
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-slate-900">
                      {used}/{limit}
                    </span>{' '}
                    recordatorios usados
                  </>
                )}
              </p>
              <p className="whitespace-nowrap text-xs font-medium text-slate-400">
                {paid ? 'Ilimitados' : `${remaining} restantes`}
              </p>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${paid ? 'bg-brand-500' : nearLimit ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                style={{ width: paid ? '100%' : `${percent}%` }}
                role="progressbar"
                aria-valuenow={paid ? 100 : percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Uso de recordatorios"
              />
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {paid
                ? plan === 'business'
                  ? 'Tu plan Business incluye recordatorios ilimitados, WhatsApp y reportes avanzados.'
                  : 'Tu plan Pro incluye recordatorios ilimitados, WhatsApp y reportes de cobro.'
                : nearLimit
                  ? 'Estás cerca del límite de tu plan. Actualiza a Pro para no interrumpir tus recordatorios.'
                  : 'El contador se reinicia el primer día de cada mes.'}
            </p>

            {!paid && Number.isFinite(limiteFacturas) && facturasPendientes !== undefined && (
              <p className="mt-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {facturasPendientes}/{limiteFacturas}
                </span>{' '}
                facturas pendientes en uso (máx. {limiteFacturas} en el plan Gratuito).
              </p>
            )}
          </>
        )}
      </div>

      {!paid && (
        <Link href="/billing" className="btn-primary mt-5 w-full">
          <IconSparkles className="h-4 w-4" />
          Actualizar a Pro
        </Link>
      )}
    </section>
  );
}
