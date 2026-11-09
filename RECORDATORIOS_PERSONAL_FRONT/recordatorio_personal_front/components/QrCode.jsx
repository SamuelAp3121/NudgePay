'use client';

import { useEffect, useState } from 'react';

/**
 * Genera un QR sin dependencias usando la API pública de qrserver.
 * Si falla la red, muestra el contenido en texto para copiarlo.
 */
export default function QrCode({ value, size = 180, className = '' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [value]);

  if (!value) return null;

  if (failed) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs ${className}`}>
        <p className="font-medium text-slate-600">Contenido del QR:</p>
        <code className="mt-1 block break-all font-mono text-slate-800">{value}</code>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`}
      alt="Código QR de pago"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`rounded-lg border border-slate-200 bg-white p-2 ${className}`}
    />
  );
}
