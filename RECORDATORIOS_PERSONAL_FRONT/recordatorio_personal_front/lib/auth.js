'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearApiKey, getSession, logout as logoutRequest } from './api';

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

/** Cierra la sesión en el backend, limpia restos locales y va a /login. */
export async function signOut(router) {
  try {
    await logoutRequest();
  } catch {
    // Si el backend no responde, igualmente limpiamos el cliente.
  }
  clearApiKey();
  if (router) router.replace('/login');
  else if (typeof window !== 'undefined') window.location.assign('/login');
}

export default useSession;
