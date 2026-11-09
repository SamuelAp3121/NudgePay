'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Spinner } from './ui';
import { IconCheck } from './icons';
import { listCuotas, pagarCuota } from '@/lib/api';
import { formatCurrency, formatDate, normalizeCuota } from '@/lib/format';

/**
 * Detalle de las cuotas de una factura, con acción para pagar cada una.
 */
export default function CuotasModal({ factura, open, onClose, onChanged }) {
  const [cuotas, setCuotas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payingNumero, setPayingNumero] = useState(null);

  const load = useCallback(async () => {
    if (!factura?.id) return;
    setLoading(true);
    setError('');
    try {
      const data = await listCuotas(factura.id);
      setCuotas((data?.cuotas || []).map(normalizeCuota));
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las cuotas.');
    } finally {
      setLoading(false);
    }
  }, [factura?.id]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handlePay = async (cuota) => {
    setPayingNumero(cuota.numero);
    setError('');
    try {
      await pagarCuota(factura.id, cuota.numero);
      setCuotas((prev) =>
        prev.map((item) =>
          item.numero === cuota.numero
            ? { ...item, estado: 'pagada', pagadaEn: new Date().toISOString() }
            : item
        )
      );
      onChanged?.();
    } catch (err) {
      setError(err?.message || 'No se pudo marcar la cuota como pagada.');
    } finally {
      setPayingNumero(null);
    }
  };

  const pagadas = cuotas.filter((cuota) => cuota.estado === 'pagada').length;
  const moneda = factura?.moneda;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cuotas de ${factura?.cliente || 'la factura'}`}
      description={
        factura
          ? `${formatCurrency(factura.monto, moneda)} en ${factura.cuotas} cuota${factura.cuotas === 1 ? '' : 's'
          }`
          : undefined
      }
      size="lg"
    >
      {error && (
        <Alert type="error" className="mb-4" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {factura?.concepto && (
        <p className="mb-4 rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Concepto:</span> {factura.concepto}
        </p>
      )}

      {factura?.tokenPublico && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand-900">Enlace de pago para el cliente</p>
            <p className="truncate text-xs text-brand-700">/pay/{factura.tokenPublico}</p>
          </div>
          <a
            href={`/pay/${factura.tokenPublico}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary btn-sm shrink-0"
          >
            Abrir
          </a>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner className="h-6 w-6 text-brand-600" label="Cargando cuotas" />
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              {pagadas} de {cuotas.length} cuotas pagadas
            </span>
            <span className="text-slate-500">
              Pendiente:{' '}
              <span className="font-semibold text-slate-900">
                {formatCurrency(
                  cuotas
                    .filter((cuota) => cuota.estado !== 'pagada')
                    .reduce((sum, cuota) => sum + cuota.monto, 0),
                  moneda
                )}
              </span>
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Cuota</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Vence</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Monto</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cuotas.map((cuota) => {
                  const pagada = cuota.estado === 'pagada';
                  return (
                    <tr key={cuota.id || cuota.numero} className={pagada ? 'bg-emerald-50/40' : ''}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {cuota.numero}/{cuotas.length}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(cuota.fechaVencimiento)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(cuota.monto, moneda)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pagada ? (
                          <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            <IconCheck className="h-3 w-3" />
                            Pagada
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePay(cuota)}
                            disabled={payingNumero !== null}
                            className="btn-secondary btn-sm"
                          >
                            {payingNumero === cuota.numero ? (
                              <Spinner className="h-3.5 w-3.5" label="Guardando" />
                            ) : (
                              <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                            Marcar pagada
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
