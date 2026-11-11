'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QrCode from '@/components/QrCode';
import { Alert, Spinner } from '@/components/ui';
import { IconCheck, IconCopy, IconMail } from '@/components/icons';
import { getFacturaPublica, pagarCuotaPublica } from '@/lib/api';
import { formatCurrency, formatDate, normalizeCuota, normalizeFactura } from '@/lib/format';

/** Página pública de pago: el cliente ve su factura y registra el pago. */
export default function PayPage() {
  const params = useParams();
  const token = params?.token;

  const [factura, setFactura] = useState(null);
  const [cuotas, setCuotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [payingNumero, setPayingNumero] = useState(null);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getFacturaPublica(token);
      setFactura(normalizeFactura(data?.factura));
      setCuotas((data?.cuotas || []).map(normalizeCuota));
    } catch (err) {
      setError(err?.message || 'No se pudo cargar la factura.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };

  const handlePay = async (cuota, metodo) => {
    setPayingNumero(cuota.numero);
    setNotice(null);
    try {
      await pagarCuotaPublica(token, cuota.numero, { metodo_pago: metodo });
      setNotice({
        type: 'success',
        message: 'Pago registrado. El comercio verificará el abono y te confirmará por email.',
      });
      await load();
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo registrar el pago.' });
    } finally {
      setPayingNumero(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" label="Cargando factura" />
      </div>
    );
  }

  if (error || !factura) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Enlace no válido</h1>
        <p className="mt-2 text-sm text-slate-500">{error || 'No encontramos esta factura.'}</p>
      </div>
    );
  }

  const moneda = factura.moneda;
  const pendientes = cuotas.filter((cuota) => cuota.estado !== 'pagada');
  const pagadas = cuotas.length - pendientes.length;
  const totalPendiente = pendientes.reduce((sum, cuota) => sum + cuota.monto, 0);
  const proxima = pendientes[0];

return (
  <div className="mx-auto max-w-3xl py-6">
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Factura de {factura.cliente}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {formatCurrency(factura.monto, moneda)}
        </h1>
        {factura.concepto && <p className="mt-1 text-sm text-slate-600">{factura.concepto}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="badge bg-white text-slate-600 ring-1 ring-inset ring-slate-200">
            {factura.cuotas} cuota{factura.cuotas === 1 ? '' : 's'}
          </span>
          <span className="badge bg-white text-slate-600 ring-1 ring-inset ring-slate-200">
            {pagadas}/{cuotas.length} pagadas
          </span>
          <span
            className={`badge ${factura.estado === 'pagada'
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
              }`}
          >
            {factura.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
          </span>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        {notice && (
          <Alert type={notice.type} onClose={() => setNotice(null)}>
            {notice.message}
          </Alert>
        )}

        {pendientes.length > 0 && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
            <p className="text-sm font-semibold text-brand-900">
              Total pendiente: {formatCurrency(totalPendiente, moneda)}
            </p>
            {proxima && (
              <p className="mt-1 text-xs text-brand-800">
                Próxima cuota {proxima.numero}/{cuotas.length} · vence el{' '}
                {formatDate(proxima.fechaVencimiento)}
              </p>
            )}
          </div>
        )}

        {/* Cuotas */}
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Cuotas</h2>
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {cuotas.map((cuota) => {
              const pagada = cuota.estado === 'pagada';
              return (
                <li key={cuota.id || cuota.numero} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      Cuota {cuota.numero}/{cuotas.length}
                    </p>
                    <p className="text-xs text-slate-500">Vence {formatDate(cuota.fechaVencimiento)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(cuota.monto, moneda)}
                    </span>
                    {pagada ? (
                      <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <IconCheck className="h-3 w-3" />
                        Pagada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePay(cuota, 'transferencia')}
                        disabled={payingNumero !== null}
                        className="btn-secondary btn-sm"
                      >
                        {payingNumero === cuota.numero ? (
                          <Spinner className="h-3.5 w-3.5" label="Registrando" />
                        ) : null}
                        Ya pagué
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Medios de pago */}
        {pendientes.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {factura.mediosPago.link && (
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Pagar en línea</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Tarjeta de crédito, débito o PSE. Pago seguro.
                </p>
                <button
                  type="button"
                  onClick={() => handlePay(proxima, 'pasarela')}
                  disabled={payingNumero !== null}
                  className="btn-primary mt-3 w-full"
                >
                  Pagar {formatCurrency(proxima?.monto || 0, moneda)}
                </button>
              </div>
            )}

            {factura.mediosPago.qr && factura.qrPayload && (
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Pagar con QR</h3>
                <p className="mt-1 text-xs text-slate-500">Escanea desde tu app bancaria.</p>
                <div className="mt-3 flex justify-center">
                  <QrCode value={factura.qrPayload} size={150} />
                </div>
              </div>
            )}

            {factura.mediosPago.transferencia && (
              <div className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
                <h3 className="text-sm font-semibold text-slate-900">Transferencia bancaria</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  {[
                    ['Banco', factura.banco.nombre],
                    ['Cuenta', factura.banco.cuenta],
                    ['Titular', factura.banco.titular],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="flex items-center gap-2 font-medium text-slate-900">
                          {value}
                          <button
                            type="button"
                            onClick={() => copy(value, label)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label={`Copiar ${label}`}
                          >
                            {copied === label ? (
                              <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <IconCopy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </dd>
                      </div>
                    ))}
                </dl>
                <p className="mt-3 text-xs text-slate-500">
                  Después de transferir, pulsa “Ya pagué” en la cuota correspondiente.
                </p>
              </div>
            )}
          </div>
        )}

        {pendientes.length === 0 && (
          <Alert type="success" title="¡Factura pagada!">
            Gracias por tu pago. No tienes cuotas pendientes.
          </Alert>
        )}
      </div>
    </div>

    <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
      <IconMail className="h-3.5 w-3.5" />
      Pago gestionado con ToquePay
    </p>
  </div>
);
}
