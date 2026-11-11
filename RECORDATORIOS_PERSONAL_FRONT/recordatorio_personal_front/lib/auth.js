'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminSalirImpersonacion,
  clearApiKey,
  getSession,
  logout as logoutRequest,
} from './api';

/**
 * Hook de sesión basado en la cookie HttpOnly del backend.
 *
 * - `user === undefined` → comprobando sesión.
 * - `user === null`      → no hay sesión.
 * - `user` con datos     → sesión activa.
 *
 * @param {{ redirectTo?: string|null, enabled?: boolean }} options
 *   `redirectTo` redirige si no hay sesión (por defecto '/login'); pasa `null` para no redirigir.
 */
export function useSession({ redirectTo = '/login', enabled = true } = {}) {
  const router = useRouter();
  const [user, setUser] = useState(undefined);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await getSession();
      setUser(data?.usuario || data || null);
      setError('');
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        setUser(null);
      } else {
        setUser(null);
        setError(err?.message || 'No se pudo comprobar la sesión.');
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled || redirectTo === null) return;
    if (user === null) router.replace(redirectTo);
  }, [enabled, redirectTo, router, user]);

  return { user, loading: user === undefined, error, refresh };
}

/** Indica si el usuario de la sesión tiene rol de administrador. */
export function isAdmin(user) {
  return String(user?.rol || '').toLowerCase() === 'admin';
}

/**
 * Hook de sesión con información de rol.
 * Añade `isAdmin` y `isImpersonating` (el admin está viendo la cuenta de un usuario).
 */
export function useSessionWithRole(options = {}) {
  const session = useSession(options);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setImpersonating(window.localStorage.getItem(IMPERSONATION_KEY) === '1');
  }, [session.user]);

  return {
    ...session,
    isAdmin: isAdmin(session.user),
    isImpersonating: impersonating,
  };
}

/** Clave de localStorage que marca una impersonación activa. */
export const IMPERSONATION_KEY = 'toquepay_impersonating';

/** Marca el inicio de una impersonación (el admin entra como un usuario). */
export function markImpersonation() {
  if (typeof window !== 'undefined') window.localStorage.setItem(IMPERSONATION_KEY, '1');
}

/** Sale de la impersonación y restaura la sesión del administrador. */
export async function exitImpersonation(router) {
  try {
    await adminSalirImpersonacion();
  } finally {
    if (typeof window !== 'undefined') window.localStorage.removeItem(IMPERSONATION_KEY);
  }
  if (router) router.replace('/admin/usuarios');
  else if (typeof window !== 'undefined') window.location.assign('/admin/usuarios');
}

/** Cierra la sesión en el backend, limpia restos locales y va a /login. */
export async function signOut(router) {
  try {
    await logoutRequest();
  } catch {
    // Si el backend no responde, igualmente limpiamos el cliente.
  }
  clearApiKey();
  if (typeof window !== 'undefined') window.localStorage.removeItem(IMPERSONATION_KEY);
  if (router) router.replace('/login');
  else if (typeof window !== 'undefined') window.location.assign('/login');
}

export default useSession;
