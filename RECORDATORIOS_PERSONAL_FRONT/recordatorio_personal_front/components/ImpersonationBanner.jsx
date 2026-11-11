'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from './ui';
import { IconArrowLeft } from './icons';
import { IMPERSONATION_KEY, exitImpersonation, useSession } from '@/lib/auth';

/**
 * Aviso fijo que aparece cuando un administrador está viendo el panel como
 * otro usuario. Permite volver a la sesión de administrador.
 */
export default function ImpersonationBanner() {
  const router = useRouter();
  const { user } = useSession({ redirectTo: null });
  const [active, setActive] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setActive(window.localStorage.getItem(IMPERSONATION_KEY) === '1');
  }, [user]);

  if (!active) return null;

  const handleExit = async () => {
    setLeaving(true);
    try {
      await exitImpersonation(router);
    } catch {
      setLeaving(false);
    }
  };

  return (
    <div className="sticky top-0 z-40 mb-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p>
        Estás viendo el panel como{' '}
        <span className="font-semibold">{user?.email || 'otro usuario'}</span>. Los cambios que hagas
        afectan a su cuenta.
      </p>
      <button
        type="button"
        onClick={handleExit}
        disabled={leaving}
        className="btn-secondary btn-sm shrink-0 border-amber-300 bg-white"
      >
        {leaving ? <Spinner className="h-3.5 w-3.5" label="Saliendo" /> : <IconArrowLeft className="h-3.5 w-3.5" />}
        Volver a administración
      </button>
    </div>
  );
}
