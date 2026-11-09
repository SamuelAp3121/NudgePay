'use client';

import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth';
import { Spinner } from './ui';

// Rutas públicas: no requieren sesión.
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

/** El portal de pago del cliente (/pay/<token>) es público. */
function esRutaPublica(pathname) {
  return PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/pay/');
}

/**
 * Protector de rutas global.
 * Comprueba la sesión contra el backend (cookie HttpOnly) y, si no hay,
 * redirige a /login. Mientras comprueba muestra un spinner.
 */
export default function RouteGuard({ children }) {
  const pathname = usePathname() || '/';
  const isPublic = esRutaPublica(pathname);
  const { loading } = useSession({ enabled: !isPublic, redirectTo: '/login' });

  if (!isPublic && loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" label="Comprobando sesión" />
      </div>
    );
  }

  return children;
}
