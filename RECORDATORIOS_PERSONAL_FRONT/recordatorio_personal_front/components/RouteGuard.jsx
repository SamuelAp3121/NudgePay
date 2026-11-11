'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isAdmin, useSession } from '@/lib/auth';
import { Spinner } from './ui';

// Rutas públicas: no requieren sesión.
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

/** El portal de pago del cliente (/pay/<token>) es público. */
function esRutaPublica(pathname) {
  return PUBLIC_ROUTES.includes(pathname) || pathname.startsWith('/pay/');
}

/** El panel de administración exige rol = 'admin'. */
function esRutaAdmin(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/**
 * Protector de rutas global.
 * Comprueba la sesión contra el backend (cookie HttpOnly) y, si no hay,
 * redirige a /login. Las rutas /admin/* además exigen rol de administrador.
 * Mientras comprueba muestra un spinner.
 */
export default function RouteGuard({ children }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const isPublic = esRutaPublica(pathname);
  const { user, loading } = useSession({ enabled: !isPublic, redirectTo: '/login' });

  const adminRoute = esRutaAdmin(pathname);
  const sinPermiso = adminRoute && !loading && user && !isAdmin(user);

  // Un usuario sin rol de admin que entra a /admin/* vuelve a su dashboard.
  useEffect(() => {
    if (sinPermiso) router.replace('/dashboard');
  }, [sinPermiso, router]);

  if (!isPublic && (loading || sinPermiso)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner
          className="h-8 w-8 text-brand-600"
          label={sinPermiso ? 'Redirigiendo' : 'Comprobando sesión'}
        />
      </div>
    );
  }

  return children;
}
