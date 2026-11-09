'use client';

import Link from 'next/link';
import { IconSparkles } from './icons';

export const PLAN_LIMITS = { free: 20, pro: Infinity };

export function normalizePlan(value) {
  const plan = String(value || 'free').toLowerCase();
  return plan === 'pro' ? 'pro' : 'free';
}

/**
 * Tarjeta con el plan actual y el consumo de recordatorios.
 * `usage` = { plan, used, limit }
 */
export default function PlanUsageCard({ usage, loading = false }) {
  const plan = normalizePlan(usage?.plan);
  const isPro = plan === 'pro';
  const limit = isPro ? PLAN_LIMITS.pro : usage?.limit || PLAN_LIMITS.free;
  const used = Math.max(0, Number(usage?.used) || 0);
  const percent = isPro ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const remaining = isPro ? Infinity : Math.max(0, limit - used);
  const nearLimit = !isPro && percent >= 80;

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Plan actual</h2>
          <p className="mt-0.5 text-sm text-slate-500">Consumo de recordatorios de este mes.</p>
        </div>
        <span
          className={`badge ${isPro
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200'
            }`}
        >
          {isPro && <IconSparkles className="h-3.5 w-3.5" />}
          {isPro ? 'Pro' : 'Gratuito'}
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
                {isPro ? (
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
                {isPro ? 'Ilimitados' : `${remaining} restantes`}
              </p>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isPro ? 'bg-brand-500' : nearLimit ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                style={{ width: isPro ? '100%' : `${percent}%` }}
                role="progressbar"
                aria-valuenow={isPro ? 100 : percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Uso de recordatorios"
              />
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {isPro
                ? 'Tu plan Pro incluye recordatorios ilimitados y envíos prioritarios.'
                : nearLimit
                  ? 'Estás cerca del límite de tu plan. Actualiza a Pro para no interrumpir tus recordatorios.'
                  : 'El contador se reinicia el primer día de cada mes.'}
            </p>
          </>
        )}
      </div>

      {!isPro && (
        <Link href="/billing" className="btn-primary mt-5 w-full">
          <IconSparkles className="h-4 w-4" />
          Actualizar a Pro
        </Link>
      )}
    </section>
  );
}
