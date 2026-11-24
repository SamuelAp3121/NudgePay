'use client';

import Link from 'next/link';
import { IconMail } from '@/components/icons';

/** Estructura común de las páginas legales (sin sidebar del panel). */
export default function LegalLayout({ titulo, actualizado, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <IconMail className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-tight text-slate-900">ToquePay</span>
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/terminos" className="font-medium text-slate-600 hover:text-slate-900">
              Términos
            </Link>
            <Link href="/privacidad" className="font-medium text-slate-600 hover:text-slate-900">
              Privacidad
            </Link>
            <Link href="/login" className="rounded-lg px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100">
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">Última actualización: {actualizado}</p>
        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-slate-700">{children}</div>

        <div className="mt-12 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-600">
            ¿Dudas sobre este documento? Escríbenos a{' '}
            <a href="mailto:soporte@toquepay.app" className="font-semibold text-brand-600 hover:underline">
              soporte@toquepay.app
            </a>
          </p>
          <Link href="/login" className="btn-secondary shrink-0">
            Volver al panel
          </Link>
        </div>
      </main>
    </div>
  );
}

/** Sección numerada reutilizable. */
export function Seccion({ numero, titulo, children }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-2 text-lg font-bold text-slate-900">
        <span className="text-brand-600">{numero}.</span> {titulo}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
