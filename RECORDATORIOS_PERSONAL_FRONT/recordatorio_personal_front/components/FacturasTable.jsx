'use client';

import { IconCheck, IconClock, IconInbox, IconList, IconMail, IconTrash } from './icons';
import { EmptyState, Spinner } from './ui';
import { daysUntil, formatCurrency, formatDate } from '@/lib/format';

/** Barra de progreso de cuotas pagadas. */
function CuotasProgress({ factura, onOpen }) {
  const { cuotas, cuotasPagadas, moneda } = factura;
  const percent = cuotas > 0 ? Math.round((cuotasPagadas / cuotas) * 100) : 0;

  if (cuotas <= 1) {
    return <span className="text-xs text-slate-400">Pago único</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(factura)}
      className="group w-full max-w-[150px] text-left"
      title={`Ver cuotas de ${factura.cliente}`}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">
          {cuotasPagadas}/{cuotas} cuotas
        </span>
        <span className="text-slate-400 group-hover:text-brand-600">Ver</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${percent === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {formatCurrency(factura.montoCuota, moneda)} / cuota
      </p>
    </button>
  );
}

function StatusBadge({ estado }) {
  if (estado === 'pagada') {
    return (
      <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Pagada
      </span>
    );
  }
  return (
    <span className="badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Pendiente
    </span>
  );
}

function DueDate({ value, estado }) {
  const days = daysUntil(value);
  const overdue = estado === 'pendiente' && days !== null && days < 0;
  const soon = estado === 'pendiente' && days !== null && days >= 0 && days <= 3;

  return (
    <div>
      <p className={`text-sm font-medium ${overdue ? 'text-rose-600' : 'text-slate-800'}`}>
        {formatDate(value)}
      </p>
      {estado === 'pendiente' && days !== null && (
        <p
          className={`mt-0.5 text-xs ${overdue ? 'font-medium text-rose-500' : soon ? 'font-medium text-amber-600' : 'text-slate-400'
            }`}
        >
          {overdue
            ? `Vencida hace ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`
            : days === 0
              ? 'Vence hoy'
              : `Vence en ${days} día${days === 1 ? '' : 's'}`}
        </p>
      )}
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: 5 }).map((_, index) => (
    <tr key={index} className="animate-pulse">
      <td className="px-6 py-4">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="mt-2 h-3 w-20 rounded bg-slate-100" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-40 rounded bg-slate-200" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-20 rounded bg-slate-200" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-24 rounded bg-slate-200" />
      </td>
      <td className="px-6 py-4">
        <div className="h-4 w-24 rounded bg-slate-200" />
      </td>
      <td className="px-6 py-4">
        <div className="h-6 w-20 rounded-full bg-slate-200" />
      </td>
      <td className="px-6 py-4">
        <div className="ml-auto h-8 w-28 rounded-lg bg-slate-200" />
      </td>
    </tr>
  ));
}

export default function FacturasTable({
  facturas,
  loading,
  updatingId,
  deletingId,
  sendingId,
  onMarkPaid,
  onSendReminder,
  onDelete,
  onCreate,
  onOpenCuotas,
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] divide-y divide-slate-200">
          <thead className="bg-slate-50/80">
            <tr>
              {['Cliente', 'Email', 'Monto', 'Cuotas', 'Vencimiento', 'Estado', ''].map((header, index) => (
                <th
                  key={header || 'actions'}
                  scope="col"
                  className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 sm:px-4 ${index === 6 ? 'text-right' : 'text-left'
                    }`}
                >
                  {header || <span className="sr-only">Acciones</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <SkeletonRows />
            ) : (
              facturas.map((factura) => {
                const isUpdating = updatingId === factura.id;
                const isDeleting = deletingId === factura.id;
                const isSending = sendingId === factura.id;
                const busy = isUpdating || isDeleting || isSending;

                return (
                  <tr
                    key={factura.id}
                    className={`transition-colors hover:bg-slate-50/70 ${busy ? 'opacity-60' : ''}`}
                  >
                    <td className="whitespace-nowrap px-3 py-4 sm:px-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold uppercase text-brand-700">
                          {factura.cliente?.trim()?.slice(0, 2) || '??'}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{factura.cliente}</p>
                          <p className="text-xs text-slate-400">#{String(factura.id).slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-4 text-sm text-slate-600 sm:px-4" title={factura.email}>
                      {factura.email}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-semibold text-slate-900 sm:px-4">
                      {formatCurrency(factura.monto, factura.moneda)}
                      <span className="ml-1 text-[11px] font-medium text-slate-400">{factura.moneda}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 sm:px-4">
                      <CuotasProgress factura={factura} onOpen={onOpenCuotas} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 sm:px-4">
                      <DueDate value={factura.fechaVencimiento} estado={factura.estado} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 sm:px-4">
                      <StatusBadge estado={factura.estado} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right sm:px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        {factura.estado === 'pendiente' ? (
                          <>
                            {factura.cuotas > 1 && (
                              <button
                                type="button"
                                onClick={() => onOpenCuotas(factura)}
                                disabled={busy}
                                className="btn-secondary btn-sm"
                                aria-label={`Ver cuotas de ${factura.cliente}`}
                                title="Ver y pagar cuotas"
                              >
                                <IconList className="h-3.5 w-3.5 text-slate-500" />
                                <span className="hidden 2xl:inline">Cuotas</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSendReminder(factura)}
                              disabled={busy}
                              className="btn-secondary btn-sm"
                              aria-label={`Enviar recordatorio a ${factura.cliente}`}
                              title={
                                factura.notificado
                                  ? 'Ya se envió un recordatorio automático; puedes reenviarlo'
                                  : 'Enviar recordatorio por email ahora'
                              }
                            >
                              {isSending ? (
                                <Spinner className="h-3.5 w-3.5" label="Enviando" />
                              ) : (
                                <IconMail className="h-3.5 w-3.5 text-brand-600" />
                              )}
                              <span className="hidden 2xl:inline">Recordar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onMarkPaid(factura)}
                              disabled={busy}
                              className="btn-secondary btn-sm"
                              aria-label={`Marcar como pagada la factura de ${factura.cliente}`}
                              title="Marcar como pagada"
                            >
                              {isUpdating ? (
                                <Spinner className="h-3.5 w-3.5" label="Actualizando" />
                              ) : (
                                <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              <span className="hidden 2xl:inline">Marcar pagada</span>
                            </button>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 text-xs font-medium text-slate-400">
                            <IconCheck className="h-3.5 w-3.5" />
                            Completada
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(factura)}
                          disabled={busy}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed"
                          aria-label={`Eliminar factura de ${factura.cliente}`}
                          title="Eliminar factura"
                        >
                          {isDeleting ? (
                            <Spinner className="h-4 w-4" label="Eliminando" />
                          ) : (
                            <IconTrash className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && facturas.length === 0 && (
        <EmptyState
          icon={<IconInbox className="h-7 w-7" />}
          title="Aún no tienes facturas"
          description="Crea tu primera factura y empieza a enviar recordatorios automáticos a tus clientes."
          action={
            <button type="button" onClick={onCreate} className="btn-primary">
              Crear primera factura
            </button>
          }
        />
      )}

      {!loading && facturas.length > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-3 text-xs text-slate-500">
          <span>
            {facturas.length} factura{facturas.length === 1 ? '' : 's'} en total
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconClock className="h-3.5 w-3.5" />
            Los recordatorios se envían automáticamente antes del vencimiento
          </span>
        </div>
      )}
    </div>
  );
}
