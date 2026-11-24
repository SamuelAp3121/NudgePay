'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconMail } from '@/components/icons';
import { useSession } from '@/lib/auth';

const PLANES = [
  {
    nombre: 'Gratuito',
    precio: '$0',
    periodo: 'para siempre',
    items: [
      '10 recordatorios al mes por email',
      'Hasta 10 facturas pendientes',
      'Hasta 3 cuotas por factura',
      'Avisos 1 día antes del vencimiento',
    ],
    cta: 'Empezar gratis',
    destacado: false,
  },
  {
    nombre: 'Pro',
    precio: '$19.900',
    periodo: 'COP / mes',
    items: [
      'Recordatorios ilimitados (email + WhatsApp)',
      'Facturas ilimitadas y hasta 12 cuotas',
      'Avisos 7, 3 y 1 día antes',
      'Plantilla personalizable',
      'Reportes de cobro + CSV',
    ],
    cta: 'Probar Pro',
    destacado: true,
  },
  {
    nombre: 'Business',
    precio: '$49.900',
    periodo: 'COP / mes',
    items: [
      'Todo lo de Pro',
      'Hasta 60 cuotas por factura',
      'Reportes avanzados y top deudores',
      'Exportación CSV con filtros',
    ],
    cta: 'Probar Business',
    destacado: false,
  },
];

const CARACTERISTICAS = [
  {
    titulo: 'Recordatorios automáticos',
    descripcion:
      'Envía recordatorios de facturas por email sin escribir un solo mensaje. Tú defines el calendario y ToquePay hace el seguimiento.',
  },
  {
    titulo: 'WhatsApp Business (Pro)',
    descripcion:
      'En los planes de pago los recordatorios también llegan por WhatsApp: más tasa de apertura, menos mora.',
  },
  {
    titulo: 'Reportes de cobro (Pro)',
    descripcion:
      'Tasa de recuperación, montos cobrados vs pendientes y exportación a CSV. Business añade vencidas y top deudores.',
  },
  {
    titulo: 'Control de cuotas',
    descripcion:
      'Divide las facturas en cuotas, sigue el estado de cada una y nunca más pierdas la cuenta de quién debe qué.',
  },
  {
    titulo: 'Portal de pago para clientes',
    descripcion:
      'Un enlace único por factura donde tu cliente ve el detalle, el estado y paga directamente. Sin registros ni claves.',
  },
  {
    titulo: 'Diseñado para freelancers',
    descripcion:
      'Sin complicaciones ni configuraciones eternas: registra, cobra y olvídate. Todo desde un panel limpio y en español.',
  },
];

const PASOS = [
  { numero: '1', titulo: 'Crea tu cuenta', descripcion: 'Regístrate gratis y entra a tu panel en segundos.' },
  { numero: '2', titulo: 'Sube tus facturas', descripcion: 'Define montos, fechas y cuotas en un formulario simple.' },
  { numero: '3', titulo: 'Deja que ToquePay cobre', descripcion: 'Recordatorios automáticos y pagos en línea hasta el último peso.' },
];

export default function Landing() {
  const { user, loading } = useSession({ redirectTo: null });
  const [sesionLista, setSesionLista] = useState(false);

  useEffect(() => {
    setSesionLista(true);
  }, []);

  const conSesion = !loading && !!user;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Cabecera */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <IconMail className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-slate-900">ToquePay</span>
              <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Cobros sin fricción
              </span>
            </span>
          </div>
          <nav className="flex items-center gap-3">
            {sesionLista && conSesion ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                Ir a mi panel
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Héroe */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Para freelancers y negocios pequeños
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Cobra sin perseguir a tus clientes
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            ToquePay envía recordatorios de facturas por email, les da a tus clientes un enlace de pago en línea
            y controla tus cuotas. Todo automático, todo en un panel.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {sesionLista && conSesion ? (
              <Link
                href="/dashboard"
                className="w-full rounded-xl bg-brand-600 px-6 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:w-auto"
              >
                Ir a mi panel
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="w-full rounded-xl bg-brand-600 px-6 py-3 text-center text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:w-auto"
                >
                  Empezar gratis
                </Link>
                <Link
                  href="/login"
                  className="w-full rounded-xl border border-slate-200 bg-white px-6 py-3 text-center text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
                >
                  Ya tengo cuenta
                </Link>
              </>
            )}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Plan gratuito disponible · Sin tarjeta de crédito · Pagos vía Wompi
          </p>
        </div>
      </section>

      {/* Características */}
      <section className="border-y border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Todo lo que necesitas para que te paguen
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Deja de copiar y pegar mensajes de cobro. ToquePay se encarga del seguimiento completo.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {CARACTERISTICAS.map(({ titulo, descripcion }) => (
              <div
                key={titulo}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 transition hover:border-brand-200 hover:shadow-sm"
              >
                <h3 className="text-base font-bold text-slate-900">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planes */}
      <section className="border-y border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Planes simples, sin letra pequeña
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Empieza gratis y sube de plan cuando tus cobros lo pidan. Cancela cuando quieras.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PLANES.map((plan) => (
              <div
                key={plan.nombre}
                className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${plan.destacado ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200'}`}
              >
                {plan.destacado && (
                  <span className="mb-3 inline-flex w-fit items-center rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                    Recomendado
                  </span>
                )}
                <h3 className="text-lg font-bold text-slate-900">{plan.nombre}</h3>
                <p className="mt-2">
                  <span className="text-3xl font-extrabold text-slate-900">{plan.precio}</span>{' '}
                  <span className="text-sm text-slate-500">{plan.periodo}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-0.5 text-emerald-600">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`mt-6 w-full text-center ${plan.destacado ? 'rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-brand-700' : 'rounded-xl border border-slate-200 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50'}`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">Cómo funciona</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {PASOS.map(({ numero, titulo, descripcion }) => (
              <div key={numero} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {numero}
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-900">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Llamado final */}
      <section className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            ¿Listo para dejar de perseguir pagos?
          </h2>
          <p className="mt-3 text-slate-600">
            Crea tu cuenta gratuita y envía tu primer recordatorio hoy mismo.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-xl bg-brand-600 px-8 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Crear cuenta gratis
          </Link>
        </div>
      </section>

      {/* Pie */}
      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center sm:px-6">
          <p className="text-sm font-semibold text-slate-700">ToquePay</p>
          <nav className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-500">
            <Link href="/terminos" className="transition hover:text-slate-800">
              Términos y Condiciones
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/privacidad" className="transition hover:text-slate-800">
              Política de Privacidad
            </Link>
            <span aria-hidden="true">·</span>
            <a href="mailto:soporte@toquepay.app" className="transition hover:text-slate-800">
              Contacto
            </a>
          </nav>
          <p className="text-xs text-slate-400">
            Recordatorios de facturas, pagos en línea y control de cuotas. © {new Date().getFullYear()} ToquePay.
          </p>
        </div>
      </footer>
    </div>
  );
}
