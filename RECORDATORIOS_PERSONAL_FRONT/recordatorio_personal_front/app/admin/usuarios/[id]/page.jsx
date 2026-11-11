'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Modal, Spinner } from '@/components/ui';
import {
  IconArrowLeft,
  IconBan,
  IconCheck,
  IconCheckCircle,
  IconCreditCard,
  IconLogin,
  IconRefresh,
  IconShield,
  IconTrash,
} from '@/components/icons';
import {
  adminActualizarWhatsAppUsuario,
  adminCambiarPlan,
  adminCambiarRol,
  adminCerrarSesiones,
  adminCuotasFactura,
  adminDetalleUsuario,
  adminEliminarFactura,
  adminImpersonar,
  adminMarcarCuotaPagada,
  adminMarcarFacturaPagada,
  adminResetPassword,
  adminRevertirCuota,
  adminSuspenderUsuario,
} from '@/lib/api';
import { markImpersonation } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/format';

const TABS = [
  { id: 'facturas', label: 'Facturas' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'suscripciones', label: 'Suscripciones' },
  { id: 'cuenta', label: 'Cuenta' },
];

function Dato({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="truncate text-sm font-medium text-slate-800">{value || '—'}</dd>
    </div>
  );
}

export default function AdminUsuarioDetallePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('facturas');
  const [working, setWorking] = useState('');
  const [cuotasFactura, setCuotasFactura] = useState(null);
  const [cuotas, setCuotas] = useState([]);
  const [loadingCuotas, setLoadingCuotas] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [motivoSuspension, setMotivoSuspension] = useState('');
  const [waTelefono, setWaTelefono] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const detalle = await adminDetalleUsuario(id);
      setData(detalle);
    } catch (err) {
      setError(err?.message || 'No se pudo cargar la cuenta.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Ejecuta una acción de administración y recarga la ficha. */
  const run = async (key, fn, mensaje) => {
    setWorking(key);
    setNotice(null);
    try {
      await fn();
      setNotice({ type: 'success', message: mensaje });
      await load();
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo completar la acción.' });
    } finally {
      setWorking('');
    }
  };

  const abrirCuotas = async (factura) => {
    setCuotasFactura(factura);
    setCuotas([]);
    setLoadingCuotas(true);
    try {
      const res = await adminCuotasFactura(factura.id);
      setCuotas(res?.cuotas || []);
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudieron cargar las cuotas.' });
    } finally {
      setLoadingCuotas(false);
    }
  };

  const recargarCuotas = async () => {
    if (!cuotasFactura) return;
    const res = await adminCuotasFactura(cuotasFactura.id);
    setCuotas(res?.cuotas || []);
    await load();
  };

  const handleImpersonar = async () => {
    setWorking('impersonar');
    try {
      await adminImpersonar(id);
      markImpersonation();
      router.replace('/dashboard');
    } catch (err) {
      setNotice({ type: 'error', message: err?.message || 'No se pudo entrar como el usuario.' });
      setWorking('');
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" label="Cargando cuenta" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Alert type="error" title="No se pudo cargar la cuenta" onClose={() => setError('')}>
        <p>{error}</p>
        <button type="button" onClick={load} className="mt-1 font-semibold underline underline-offset-2">
          Reintentar
        </button>
      </Alert>
    );
  }

  const usuario = data?.usuario || {};
  const whatsapp = usuario.whatsapp || {};
  const facturas = data?.facturas || [];
  const pagos = data?.pagos || [];
  const suscripciones = data?.suscripciones || [];
  const consumo = data?.consumo || [];
  const esPro = usuario.plan === 'pro';
  const esAdmin = usuario.rol === 'admin';

  return (
    <div>
      <Link href="/admin/usuarios" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <IconArrowLeft className="h-4 w-4" />
        Volver a usuarios
      </Link>

      {notice && (
        <Alert type={notice.type} className="mb-5" onClose={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      {/* Cabecera de la cuenta */}
      <div className="card mb-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold tracking-tight text-slate-900">{usuario.email}</h2>
              <span
                className={`badge ${esPro ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200'
                  }`}
              >
                {esPro ? 'Pro' : 'Free'}
              </span>
              {esAdmin && <span className="badge bg-slate-900 text-white">Admin</span>}
              {usuario.suspendido && (
                <span className="badge bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">Suspendida</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">ID: {usuario.id}</p>
            {usuario.suspendido && usuario.suspendido_motivo && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                Motivo de suspensión: {usuario.suspendido_motivo}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleImpersonar}
              disabled={Boolean(working) || usuario.suspendido}
              className="btn-secondary btn-sm"
              title="Inicia sesión como este usuario para reproducir una incidencia"
            >
              {working === 'impersonar' ? <Spinner className="h-3.5 w-3.5" label="Entrando" /> : <IconLogin className="h-3.5 w-3.5" />}
              Entrar como usuario
            </button>
            <button
              type="button"
              onClick={() => setPasswordModal(true)}
              className="btn-secondary btn-sm"
            >
              <IconShield className="h-3.5 w-3.5" />
              Restablecer contraseña
            </button>
            <button
              type="button"
              onClick={() =>
                run('sesiones', () => adminCerrarSesiones(id), 'Se cerraron todas las sesiones del usuario.')
              }
              disabled={Boolean(working)}
              className="btn-secondary btn-sm"
            >
              {working === 'sesiones' ? <Spinner className="h-3.5 w-3.5" label="Cerrando" /> : <IconRefresh className="h-3.5 w-3.5" />}
              Cerrar sesiones
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
          <Dato label="Registro" value={formatDate(usuario.creado_en)} />
          <Dato label="Último acceso" value={usuario.ultimo_acceso ? formatDate(usuario.ultimo_acceso) : 'Nunca'} />
          <Dato label="Vence el plan" value={usuario.plan_expira_en ? formatDate(usuario.plan_expira_en) : '—'} />
          <Dato
            label="Recordatorios (mes)"
            value={
              usuario.limite_recordatorios === -1
                ? `${usuario.recordatorios_usados} / ilimitados`
                : `${usuario.recordatorios_usados} / ${usuario.limite_recordatorios}`
            }
          />
        </dl>
      </div>

      {/* Pestañas */}
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${tab === item.id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
          >
            {item.label}
            {item.id === 'facturas' && facturas.length > 0 && (
              <span className="ml-1.5 text-xs text-slate-400">{facturas.length}</span>
            )}
            {item.id === 'pagos' && pagos.length > 0 && (
              <span className="ml-1.5 text-xs text-slate-400">{pagos.length}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Facturas */}
      {tab === 'facturas' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  {['Cliente', 'Monto', 'Cuotas', 'Vencimiento', 'Estado', ''].map((header, index) => (
                    <th
                      key={header || 'acciones'}
                      scope="col"
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${index === 5 ? 'text-right' : 'text-left'
                        }`}
                    >
                      {header || <span className="sr-only">Acciones</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {facturas.map((factura) => (
                  <tr key={factura.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">{factura.cliente_nombre}</p>
                      <p className="truncate text-xs text-slate-400">{factura.cliente_email}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                      {formatCurrency(factura.monto, factura.moneda)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {factura.cuotas_pagadas}/{factura.cuotas}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {formatDate(factura.fecha_vencimiento)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${factura.estado === 'pagada'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                          }`}
                      >
                        {factura.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => abrirCuotas(factura)} className="btn-secondary btn-sm">
                          Cuotas
                        </button>
                        {factura.estado !== 'pagada' && (
                          <button
                            type="button"
                            onClick={() =>
                              run(
                                `pagar-${factura.id}`,
                                () => adminMarcarFacturaPagada(factura.id),
                                'Factura marcada como pagada.'
                              )
                            }
                            disabled={Boolean(working)}
                            className="btn-secondary btn-sm"
                            title="Marcar todas las cuotas como pagadas"
                          >
                            {working === `pagar-${factura.id}` ? (
                              <Spinner className="h-3.5 w-3.5" label="Guardando" />
                            ) : (
                              <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(factura)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Eliminar factura"
                          title="Eliminar factura"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {facturas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                      Este usuario no tiene facturas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagos */}
      {tab === 'pagos' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  {['Referencia', 'Cuota', 'Monto', 'Método', 'Estado', 'Fecha'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pagos.map((pago) => (
                  <tr key={pago.id} className="hover:bg-slate-50/70">
                    <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-600">
                      {pago.referencia || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{pago.cuota}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                      {formatCurrency(pago.monto, pago.moneda)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{pago.metodo || pago.pasarela || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${pago.estado === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
                          }`}
                      >
                        {pago.estado || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(pago.creado_en)}
                    </td>
                  </tr>
                ))}
                {pagos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                      No hay pagos de pasarela registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suscripciones */}
      {tab === 'suscripciones' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  {['Referencia', 'Monto', 'Estado', 'Creada', 'Pagada'].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {suscripciones.map((suscripcion) => (
                  <tr key={suscripcion.referencia} className="hover:bg-slate-50/70">
                    <td className="max-w-[260px] truncate px-4 py-3 font-mono text-xs text-slate-600">
                      {suscripcion.referencia}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
                      {formatCurrency(suscripcion.monto, suscripcion.moneda)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`badge ${suscripcion.estado === 'pagada'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                          }`}
                      >
                        {suscripcion.estado}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(suscripcion.creado_en)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {suscripcion.pagada_en ? formatDate(suscripcion.pagada_en) : '—'}
                    </td>
                  </tr>
                ))}
                {suscripciones.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      Sin suscripciones registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cuenta */}
      {tab === 'cuenta' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="card p-6">
            <h3 className="text-base font-semibold text-slate-900">Plan</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Cambia el plan manualmente (por ejemplo, tras un pago no conciliado).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  run('plan-pro', () => adminCambiarPlan(id, 'pro', 30), 'Plan Pro activado por 30 días.')
                }
                disabled={Boolean(working) || esPro}
                className="btn-primary btn-sm"
              >
                {working === 'plan-pro' ? <Spinner className="h-3.5 w-3.5" label="Guardando" /> : <IconCheckCircle className="h-3.5 w-3.5" />}
                Activar Pro (30 días)
              </button>
              <button
                type="button"
                onClick={() => run('plan-free', () => adminCambiarPlan(id, 'free'), 'Plan cambiado a Free.')}
                disabled={Boolean(working) || !esPro}
                className="btn-secondary btn-sm"
              >
                Pasar a Free
              </button>
            </div>
          </section>

          <section className="card p-6">
            <h3 className="text-base font-semibold text-slate-900">Rol</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Los administradores pueden acceder a este panel y gestionar todas las cuentas.
            </p>
            <button
              type="button"
              onClick={() =>
                run(
                  'rol',
                  () => adminCambiarRol(id, esAdmin ? 'usuario' : 'admin'),
                  esAdmin ? 'La cuenta ya no es administrador.' : 'La cuenta ahora es administrador.'
                )
              }
              disabled={Boolean(working)}
              className="btn-secondary btn-sm mt-4"
            >
              {working === 'rol' ? <Spinner className="h-3.5 w-3.5" label="Guardando" /> : <IconShield className="h-3.5 w-3.5" />}
              {esAdmin ? 'Quitar rol de administrador' : 'Hacer administrador'}
            </button>
          </section>

          <section className="card p-6">
            <h3 className="text-base font-semibold text-slate-900">Suspensión</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Una cuenta suspendida no puede iniciar sesión y se cierran sus sesiones activas.
            </p>
            {usuario.suspendido ? (
              <button
                type="button"
                onClick={() =>
                  run('suspender', () => adminSuspenderUsuario(id, false), 'Cuenta reactivada.')
                }
                disabled={Boolean(working)}
                className="btn-primary btn-sm mt-4"
              >
                {working === 'suspender' ? <Spinner className="h-3.5 w-3.5" label="Guardando" /> : <IconCheck className="h-3.5 w-3.5" />}
                Reactivar cuenta
              </button>
            ) : (
              <div className="mt-4 space-y-2">
                <input
                  type="text"
                  value={motivoSuspension}
                  onChange={(event) => setMotivoSuspension(event.target.value)}
                  placeholder="Motivo (opcional, lo verá el usuario)"
                  className="input"
                />
                <button
                  type="button"
                  onClick={() =>
                    run(
                      'suspender',
                      () => adminSuspenderUsuario(id, true, motivoSuspension),
                      'Cuenta suspendida.'
                    )
                  }
                  disabled={Boolean(working)}
                  className="btn-danger btn-sm"
                >
                  {working === 'suspender' ? <Spinner className="h-3.5 w-3.5" label="Guardando" /> : <IconBan className="h-3.5 w-3.5" />}
                  Suspender cuenta
                </button>
              </div>
            )}
          </section>

          <section className="card p-6">
            <h3 className="text-base font-semibold text-slate-900">WhatsApp</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Activa el canal y fija el número de contacto de la cuenta.
            </p>
            <div className="mt-4 space-y-2">
              <input
                type="tel"
                value={waTelefono || whatsapp.telefono || ''}
                onChange={(event) => setWaTelefono(event.target.value)}
                placeholder="573001234567"
                className="input"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    run(
                      'wa-activar',
                      () => adminActualizarWhatsAppUsuario(id, true, waTelefono || whatsapp.telefono || ''),
                      'WhatsApp activado para esta cuenta.'
                    )
                  }
                  disabled={Boolean(working)}
                  className="btn-primary btn-sm"
                >
                  {working === 'wa-activar' ? <Spinner className="h-3.5 w-3.5" label="Guardando" /> : null}
                  Activar WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(
                      'wa-desactivar',
                      () => adminActualizarWhatsAppUsuario(id, false, waTelefono || whatsapp.telefono || ''),
                      'WhatsApp desactivado para esta cuenta.'
                    )
                  }
                  disabled={Boolean(working)}
                  className="btn-secondary btn-sm"
                >
                  Desactivar
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Estado actual:{' '}
                <span className={whatsapp.activo ? 'font-semibold text-emerald-600' : 'font-semibold text-slate-500'}>
                  {whatsapp.activo ? 'Activo' : 'Inactivo'}
                </span>
                {whatsapp.phone_number_id ? ` · Phone ID ${whatsapp.phone_number_id}` : ''}
              </p>
            </div>
          </section>

          <section className="card p-6">
            <h3 className="text-base font-semibold text-slate-900">Consumo de recordatorios</h3>
            <p className="mt-0.5 text-sm text-slate-500">Últimos 6 meses.</p>
            {consumo.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">Sin recordatorios enviados.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {consumo.map((item) => (
                  <li key={item.mes} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.mes}</span>
                    <span className="font-semibold text-slate-900">{item.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Modal: cuotas de una factura */}
      <Modal
        open={Boolean(cuotasFactura)}
        onClose={() => setCuotasFactura(null)}
        title={`Cuotas de ${cuotasFactura?.cliente_nombre || 'la factura'}`}
        description={
          cuotasFactura
            ? `${formatCurrency(cuotasFactura.monto, cuotasFactura.moneda)} en ${cuotasFactura.cuotas} cuota${cuotasFactura.cuotas === 1 ? '' : 's'
            }`
            : undefined
        }
        size="lg"
      >
        {loadingCuotas ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="h-6 w-6 text-brand-600" label="Cargando cuotas" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Cuota</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Vence</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Monto</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Acción</th>
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
                      <td className="px-4 py-3 text-slate-600">{formatDate(cuota.fecha_vencimiento)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(cuota.monto, cuotasFactura?.moneda)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pagada ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await run(
                                `revertir-${cuota.numero}`,
                                () => adminRevertirCuota(cuotasFactura.id, cuota.numero),
                                'Cuota revertida a pendiente.'
                              );
                              await recargarCuotas();
                            }}
                            disabled={Boolean(working)}
                            className="btn-secondary btn-sm"
                            title="Volver a pendiente"
                          >
                            Revertir
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              await run(
                                `cuota-${cuota.numero}`,
                                () =>
                                  adminMarcarCuotaPagada(cuotasFactura.id, cuota.numero, {
                                    metodo_pago: 'manual',
                                    referencia: 'admin',
                                  }),
                                'Cuota marcada como pagada.'
                              );
                              await recargarCuotas();
                            }}
                            disabled={Boolean(working)}
                            className="btn-secondary btn-sm"
                          >
                            {working === `cuota-${cuota.numero}` ? (
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
        )}
      </Modal>

      {/* Modal: restablecer contraseña */}
      <Modal
        open={passwordModal}
        onClose={() => {
          setPasswordModal(false);
          setPasswordNueva('');
        }}
        title="Restablecer contraseña"
        description="Define una contraseña temporal y compártela con el usuario por un canal seguro."
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPasswordModal(false);
                setPasswordNueva('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={Boolean(working) || passwordNueva.length < 8}
              onClick={async () => {
                await run(
                  'password',
                  () => adminResetPassword(id, passwordNueva),
                  'Contraseña restablecida. Se cerraron las sesiones del usuario.'
                );
                setPasswordModal(false);
                setPasswordNueva('');
              }}
            >
              {working === 'password' ? <Spinner className="h-4 w-4" label="Guardando" /> : null}
              Restablecer
            </button>
          </>
        }
      >
        <label htmlFor="password-nueva-admin" className="label">
          Nueva contraseña
        </label>
        <input
          id="password-nueva-admin"
          type="text"
          value={passwordNueva}
          onChange={(event) => setPasswordNueva(event.target.value)}
          placeholder="Mínimo 8 caracteres, con letra y número"
          className="input font-mono"
        />
        <p className="mt-2 text-xs text-slate-400">
          Al guardar se cerrarán todas las sesiones abiertas de esta cuenta.
        </p>
      </Modal>

      {/* Modal: confirmar eliminación de factura */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar factura"
        description="Esta acción no se puede deshacer."
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={Boolean(working)}
              onClick={async () => {
                await run(
                  'eliminar',
                  () => adminEliminarFactura(confirmDelete.id),
                  'Factura eliminada.'
                );
                setConfirmDelete(null);
              }}
            >
              {working === 'eliminar' ? <Spinner className="h-4 w-4" label="Eliminando" /> : null}
              Eliminar factura
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          ¿Eliminar la factura de{' '}
          <span className="font-semibold text-slate-900">{confirmDelete?.cliente_nombre}</span> por{' '}
          <span className="font-semibold text-slate-900">
            {formatCurrency(confirmDelete?.monto, confirmDelete?.moneda)}
          </span>
          ?
        </p>
      </Modal>
    </div>
  );
}
