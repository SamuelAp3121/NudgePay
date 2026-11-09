'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconBilling,
  IconClose,
  IconDashboard,
  IconLogout,
  IconMail,
  IconMenu,
  IconSettings,
} from './icons';
import { signOut, useSession } from '@/lib/auth';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', description: 'Facturas y recordatorios', Icon: IconDashboard },
  { href: '/settings', label: 'Configuración', description: 'Cuenta y plantillas', Icon: IconSettings },
  { href: '/billing', label: 'Facturación', description: 'Plan y suscripción', Icon: IconBilling },
];

function NavLinks({ pathname, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ href, label, description, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${active
                  ? 'border-brand-200 bg-white text-brand-600 shadow-sm'
                  : 'border-transparent bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-700'
                }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold ${active ? 'text-brand-700' : 'text-slate-800'}`}>
                {label}
              </span>
              <span className="block truncate text-xs text-slate-500">{description}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <IconMail className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-tight text-slate-900">NudgePay</span>
        <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Cobros sin fricción
        </span>
      </span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useSession({ redirectTo: null });

  // Las pantallas de acceso se muestran a pantalla completa, sin navegación.
  const isAuthRoute =
    ['/register', '/login', '/forgot-password', '/reset-password'].includes(pathname) ||
    pathname.startsWith('/pay/');

  const handleLogout = async () => {
    setMobileOpen(false);
    await signOut(router);
  };

  // Cierra el menú móvil al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Bloquea el scroll del body cuando el menú móvil está abierto
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  if (isAuthRoute) return null;

  return (
    <>
      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="btn-ghost -mr-2 p-2"
          aria-label="Abrir menú"
        >
          <IconMenu />
        </button>
      </header>

      {/* Sidebar escritorio */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="mt-8 flex-1">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Menú
          </p>
          <NavLinks pathname={pathname} />
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="truncate text-xs font-semibold text-slate-700" title={user?.email || ''}>
              {user?.email || 'Sesión activa'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Plan {user?.plan === 'pro' ? 'Pro' : 'Gratuito'} · sesión segura por cookie
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <IconLogout className="h-[18px] w-[18px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] animate-slide-in-right flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between px-2">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="btn-ghost p-2"
                aria-label="Cerrar menú"
              >
                <IconClose />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <IconLogout className="h-[18px] w-[18px]" />
              Cerrar sesión
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
