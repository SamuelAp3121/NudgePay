'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconBilling, IconCreditCard, IconDashboard, IconShield, IconUsers, IconWhatsApp } from '@/components/icons';

const TABS = [
  { href: '/admin', label: 'Resumen', Icon: IconDashboard, exact: true },
  { href: '/admin/usuarios', label: 'Usuarios', Icon: IconUsers },
  { href: '/admin/facturas', label: 'Facturas', Icon: IconBilling },
  { href: '/admin/pagos', label: 'Pagos', Icon: IconCreditCard },
  { href: '/admin/suscripciones', label: 'Suscripciones', Icon: IconShield },
  { href: '/admin/whatsapp', label: 'WhatsApp', Icon: IconWhatsApp },
];

/** Layout del panel de administración: cabecera + pestañas. */
export default function AdminLayout({ children }) {
  const pathname = usePathname() || '/admin';

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <IconShield className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Administración</h1>
            <p className="text-sm text-slate-500">Soporte, pagos y suscripciones de todas las cuentas.</p>
          </div>
        </div>
        <span className="badge w-fit bg-slate-900 text-white">Acceso de administrador</span>
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
