'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PlanUsageCard, { normalizePlan } from '@/components/PlanUsageCard';
import { Alert, Modal, PageHeader, Spinner } from '@/components/ui';
import { IconCheck, IconSparkles } from '@/components/icons';
import {
  cancelarSuscripcion,
  crearCheckout,
  getSuscripcion,
  simularPagoPro,
} from '@/lib/api';
import { useSession } from '@/lib/auth';
import { abrirCheckoutWompi } from '@/lib/wompi';

const PLANS = [
  {
    id: 'free',
    name: 'Gratuito',
    price: '$0',
    period: 'para siempre',
    description: 'Ideal para probar ToquePay con tus primeros clientes.',
    features: [
      'Hasta 20 recordatorios al mes',
      'Facturas ilimitadas',
      'Recordatorios automáticos por email',
      'Panel de facturas y estados',
    ],
    cta: 'Plan actual',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    period: 'por mes',
    description: 'Para freelancers y negocios que cobran de forma recurrente.',
    features: [
      'Recordatorios ilimitados',
      'Facturas ilimitadas',
      'Recordatorios programados (7, 3 y 1 día antes)',
      'Soporte prioritario por email',
      'Exportación de reportes',
    ],
    cta: 'Actualizar a Pro',
    highlighted: true,
  },
];

function BillingContent() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const [plan, setPlan] = useState('free');
  const [usage, setUsage] = useState({ plan: 'free', used: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pasarela, setPasarela] = useState({ configurada: false, precioCop: 0 });
  const [orden, setOrden] = useState(null); // datos del checkout pendiente
  const [working, setWorking] = useState(false);
  const [historial, setHistorial] = useState([]);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSuscripcion();
      const me = data?.usuario || data?.user || data?.data || data || {};
      const currentPlan = normalizePlan(me.plan ?? me.plan_actual ?? me.planActual);
      const limit = Number(me.limite_recordatorios ?? me.reminders_limit ?? 20);
      setPlan(currentPlan);
      setUsage({
        plan: currentPlan,
        used: Number(me.recordatorios_usados ?? me.reminders_used ?? me.recordatorios ?? 0),
        // El backend devuelve -1 para planes ilimitados
        limit: limit > 0 ? limit : 20,
      });
      setPasarela({ configurada: Boolean(data?.configurada), precioCop: Number(data?.precio_cop || 0) });
      setHistorial(data?.suscripciones || []);
    } catch (err) {
      setError(err?.message || 'No se pudo obtener tu plan actual.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadPlan();
    else if (user === null) setLoading(false);
  }, [user, loadPlan]);

  // Vuelta desde la pasarela (?pago=ok): el webhook puede tardar unos segundos.
  useEffect(() => {
    if (searchParams.get('pago') !== 'ok') return undefined;
    setNotice({
      type: 'info',
      title: 'Confirmando tu pago',
      message: 'Si el cobro fue aprobado, tu plan se activará automáticamente en unos segundos.',
    });

    let intentos = 0;
    const timer = setInterval(async () => {
      intentos += 1;
      await loadPlan();
      if (intentos >= 5) clearInterval(timer);
    }, 3000);

    return () => clearInterval(timer);
  }, [searchParams, loadPlan]);

  /** Abre el checkout de Wompi con los datos firmados por el backend. */
  const handleUpgrade = async () => {
    setWorking(true);
    setNotice(null);
    try {
      const data = await crearCheckout('pro');
      setOrden(data);
    } catch (err) {
      setCheckoutPlan(null);
      setNotice({
        type: 'error',
        title: err?.status === 503 ? 'Pasarela no configurada' : 'No se pudo iniciar el pago',
        message:
          err?.message ||
          'Define WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET en el backend para habilitar los pagos.',
      });
    } finally {
      setWorking(false);
    }
  };

  const irAPasarela = () => {
    if (!orden) return;
    abrirCheckoutWompi(orden);
  };

  /** Activa Pro sin pasarela (solo si el backend lo permite en desarrollo). */
  const handleSimular = async () => {
    if (!orden) return;
    setWorking(true);
    setNotice(null);
    try {
      await simularPagoPro(orden.referencia);
      setCheckoutPlan(null);
      setOrden(null);
      setNotice({ type: 'success', title: 'Plan Pro activado', message: 'Recordatorios ilimitados habilitados.' });
      await loadPlan();
    } catch (err) {
      setNotice({ type: 'error', title: 'No se pudo activar', message: err?.message || 'Error al activar el plan.' });
    } finally {
      setWorking(false);
    }
  };

  const handleCancel = async () => {
    setWorking(true);
    setNotice(null);
    try {
      await cancelarSuscripcion();
      setNotice({ type: 'success', title: 'Suscripción cancelada', message: 'Vuelves al plan gratuito.' });
      await loadPlan();
    } catch (err) {
      setNotice({ type: 'error', title: 'No se pudo cancelar', message: err?.message || 'Inténtalo de nuevo.' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Facturación"
        description="Consulta tu plan actual y actualiza cuando necesites más recordatorios."
      />

      {notice && (
        <Alert type={notice.type} title={notice.title} onClose={() => setNotice(null)} className="mb-6">
          {notice.message}
        </Alert>
      )}

      {error && (
        <Alert type="warning" title="No se pudo cargar tu plan" onClose={() => setError('')} className="mb-6">
          {error}
        </Alert>
      )}

      <div id="planes" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {PLANS.map((item) => {
              const isCurrent = plan === item.id;
              return (
                <div
                  key={item.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-card transition-shadow hover:shadow-card-hover ${item.highlighted ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200/80'
                    }`}
                >
                  {item.highlighted && (
                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                      <IconSparkles className="h-3.5 w-3.5" />
                      Recomendado
                    </span>
                  )}

                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">{item.name}</h2>
                    {isCurrent && (
                      <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Plan actual
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-slate-500">{item.description}</p>

                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tracking-tight text-slate-900">{item.price}</span>
                    <span className="text-sm text-slate-500">/ {item.period}</span>
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {item.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <IconCheck className="h-3.5 w-3.5" />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    disabled={isCurrent || loading}
                    onClick={() => setCheckoutPlan(item)}
                    className={`mt-6 w-full ${item.highlighted && !isCurrent ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {isCurrent ? 'Plan actual' : item.cta}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <PlanUsageCard usage={usage} loading={loading} />

          <section className="card p-6">
            <h2 className="text-base font-semibold text-slate-900">Suscripción</h2>
            <p className="mt-1 text-sm text-slate-500">
              {plan === 'pro'
                ? 'Tu plan Pro está activo: recordatorios ilimitados.'
                : 'Pagos procesados por Wompi (tarjeta, PSE y Nequi).'}
            </p>

            {!pasarela.configurada && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                La pasarela aún no está configurada en el servidor.
              </p>
            )}

            {plan === 'pro' ? (
              <button
                type="button"
                onClick={handleCancel}
                disabled={working}
                className="btn-secondary mt-4 w-full"
              >
                {working ? <Spinner className="h-4 w-4" label="Procesando" /> : null}
                Cancelar suscripción
              </button>
            ) : (
              <a href="#planes" className="btn-primary mt-4 w-full">
                Ver planes
              </a>
            )}
          </section>

          {historial.length > 0 && (
            <section className="card p-6">
              <h2 className="text-base font-semibold text-slate-900">Historial</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {historial.slice(0, 5).map((item) => (
                  <li key={item.referencia} className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">{item.creado_en?.slice(0, 10)}</span>
                    <span
                      className={`badge ${
                        item.estado === 'pagada'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                          : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                      }`}
                    >
                      {item.estado}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(checkoutPlan)}
        onClose={() => {
          setCheckoutPlan(null);
          setOrden(null);
        }}
        title={`Actualizar al plan ${checkoutPlan?.name || ''}`}
        description="Serás redirigido a la pasarela de pago segura para completar la suscripción."
        size="sm"
        footer={
          orden ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setCheckoutPlan(null);
                  setOrden(null);
                }}
              >
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={irAPasarela} disabled={working}>
                Ir a pagar {pasarela.precioCop ? `$${pasarela.precioCop.toLocaleString('es-CO')} COP` : ''}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setCheckoutPlan(null);
                  setOrden(null);
                }}
              >
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={handleUpgrade} disabled={working}>
                {working ? <Spinner className="h-4 w-4" label="Procesando" /> : null}
                Continuar al pago
              </button>
            </>
          )
        }
      >
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>Plan {checkoutPlan?.name}</span>
            <span className="font-semibold text-slate-900">
              {checkoutPlan?.price} / {checkoutPlan?.period}
            </span>
          </div>
          {pasarela.precioCop > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Cobro en COP: ${pasarela.precioCop.toLocaleString('es-CO')}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Puedes cancelar en cualquier momento desde esta misma página.
          </p>

          {orden?.referencia && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Referencia del pago</p>
              <code className="mt-0.5 block truncate font-mono text-xs text-slate-800">
                {orden.referencia}
              </code>
            </div>
          )}
        </div>

        {orden?.referencia && (
          <button
            type="button"
            onClick={handleSimular}
            disabled={working}
            className="btn-ghost mt-3 w-full text-xs text-slate-400 hover:bg-transparent hover:text-slate-600"
          >
            Simular pago aprobado (solo desarrollo)
          </button>
        )}
      </Modal>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner className="h-8 w-8 text-brand-600" label="Cargando" />
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  );
}
