'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CuotasModal from '@/components/CuotasModal';
import FacturaForm from '@/components/FacturaForm';
import FacturasTable from '@/components/FacturasTable';
import { Alert, Modal, PageHeader, Spinner } from '@/components/ui';
import { IconClock, IconMail, IconPlus, IconRefresh, IconSparkles } from '@/components/icons';
import {
  createFactura,
  deleteFactura,
  enviarRecordatorio,
  listFacturas,
  marcarPagada,
} from '@/lib/api';
import { DEFAULT_CURRENCY, extractFacturas, formatCurrency, normalizeFactura } from '@/lib/format';
import { useSession } from '@/lib/auth';

function StatCard({ label, value, hint, icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="card p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // Protector de ruta: sin sesión activa → /login
  const { user, loading: sessionLoading } = useSession();
  const ready = Boolean(user);
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState(null); // { type, title, message }
  const [modalOpen, setModalOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [cuotasFactura, setCuotasFactura] = useState(null);

  /* --------------------------- Carga de datos --------------------------- */

  const loadFacturas = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const data = await listFacturas();
      setFacturas(extractFacturas(data).map(normalizeFactura));
    } catch (error) {
      setLoadError(error?.message || 'No se pudieron cargar las facturas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) loadFacturas();
  }, [ready, loadFacturas]);

  // Si la sesión expira mientras se usa el panel, se vuelve al login.
  useEffect(() => {
    if (loadError && /sesión|sesion|401|no has iniciado/i.test(loadError)) {
      // El RouteGuard también lo detecta; aquí solo evitamos mostrar datos obsoletos.
      setFacturas([]);
    }
  }, [loadError]);

  // Auto-ocultar la alerta de éxito
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  /* ----------------------------- Acciones ------------------------------ */

  const handleCreate = async (payload) => {
    const created = await createFactura(payload);
    const normalized = created?.factura ? normalizeFactura(created.factura) : null;

    if (normalized?.id) {
      setFacturas((prev) => [normalized, ...prev]);
    } else {
      await loadFacturas({ silent: true });
    }

    setModalOpen(false);
    setNotice({
      type: 'success',
      title: 'Factura creada',
      message:
        payload.cuotas > 1
          ? `Se registró la factura de ${payload.cliente_nombre} por ${formatCurrency(payload.monto, payload.moneda)} en ${payload.cuotas} cuotas.`
          : `Se registró la factura de ${payload.cliente_nombre} por ${formatCurrency(payload.monto, payload.moneda)}.`,
    });
  };

  const handleMarkPaid = async (factura) => {
    setUpdatingId(factura.id);
    try {
      await marcarPagada(factura.id);
      setFacturas((prev) =>
        prev.map((item) =>
          item.id === factura.id
            ? {
                ...item,
                estado: 'pagada',
                cuotasPagadas: item.cuotas,
                montoPagado: item.monto,
                montoPendiente: 0,
              }
            : item
        )
      );
      setNotice({
        type: 'success',
        title: 'Factura marcada como pagada',
        message: `La factura de ${factura.cliente} ya no recibirá recordatorios.`,
      });
    } catch (error) {
      setNotice({
        type: 'error',
        title: 'No se pudo actualizar la factura',
        message: error?.message || 'Inténtalo de nuevo en unos segundos.',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSendReminder = async (factura) => {
    setSendingId(factura.id);
    try {
      await enviarRecordatorio(factura.id);
      setFacturas((prev) =>
        prev.map((item) => (item.id === factura.id ? { ...item, notificado: true } : item))
      );
      setNotice({
        type: 'success',
        title: 'Recordatorio enviado',
        message: `Se envió el email de recordatorio a ${factura.email}.`,
      });
    } catch (error) {
      setNotice({
        type: 'error',
        title: 'No se pudo enviar el recordatorio',
        message: error?.message || 'Revisa la configuración de email del backend.',
      });
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async () => {
    const factura = confirmDelete;
    if (!factura) return;

    setDeletingId(factura.id);
    try {
      await deleteFactura(factura.id);
      setFacturas((prev) => prev.filter((item) => item.id !== factura.id));
      setNotice({
        type: 'success',
        title: 'Factura eliminada',
        message: `Se eliminó la factura de ${factura.cliente}.`,
      });
    } catch (error) {
      setNotice({
        type: 'error',
        title: 'No se pudo eliminar la factura',
        message: error?.message || 'Inténtalo de nuevo en unos segundos.',
      });
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  /* ------------------------------ Métricas ----------------------------- */

  const stats = useMemo(() => {
    const pendientes = facturas.filter((f) => f.estado === 'pendiente');
    const pagadas = facturas.filter((f) => f.estado === 'pagada');
    const totalPendiente = pendientes.reduce((sum, f) => sum + (Number(f.montoPendiente) || 0), 0);
    const totalCobrado = facturas.reduce((sum, f) => sum + (Number(f.montoPagado) || 0), 0);
    const cuotasPendientes = pendientes.reduce(
      (sum, f) => sum + Math.max(0, (f.cuotas || 1) - (f.cuotasPagadas || 0)),
      0
    );
    // Moneda predominante para mostrar los totales (COP por defecto).
    const moneda = facturas[0]?.moneda || DEFAULT_CURRENCY;
    return {
      pendientes: pendientes.length,
      pagadas: pagadas.length,
      totalPendiente,
      totalCobrado,
      cuotasPendientes,
      moneda,
    };
  }, [facturas]);

  /* ------------------------------- Render ------------------------------ */

  if (sessionLoading || !ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" label="Cargando" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Gestiona tus facturas pendientes y deja que ToquePay se encargue de los recordatorios."
        actions={
          <>
            <button
              type="button"
              onClick={() => loadFacturas()}
              disabled={loading}
              className="btn-secondary"
              title="Recargar facturas"
            >
              <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button type="button" onClick={() => setModalOpen(true)} className="btn-primary">
              <IconPlus className="h-4 w-4" />
              Nueva factura
            </button>
          </>
        }
      />

      {notice && (
        <Alert
          type={notice.type}
          title={notice.title}
          onClose={() => setNotice(null)}
          className="mb-6"
        >
          {notice.message}
        </Alert>
      )}

      {loadError && (
        <Alert type="error" title="Error al cargar las facturas" className="mb-6">
          <p>{loadError}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => loadFacturas()}
              className="font-semibold underline underline-offset-2 hover:no-underline"
            >
              Reintentar
            </button>
            <Link href="/settings" className="font-semibold underline underline-offset-2 hover:no-underline">
              Revisar API Key
            </Link>
          </div>
        </Alert>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pendientes"
          value={loading ? '—' : stats.pendientes}
          hint="Facturas por cobrar"
          tone="amber"
          icon={<IconClock className="h-5 w-5" />}
        />
        <StatCard
          label="Por cobrar"
          value={loading ? '—' : formatCurrency(stats.totalPendiente, stats.moneda)}
          hint={
            loading
              ? 'Monto total pendiente'
              : `${stats.cuotasPendientes} cuota${stats.cuotasPendientes === 1 ? '' : 's'} pendiente${stats.cuotasPendientes === 1 ? '' : 's'}`
          }
          tone="brand"
          icon={<IconMail className="h-5 w-5" />}
        />
        <StatCard
          label="Pagadas"
          value={loading ? '—' : stats.pagadas}
          hint="Facturas completadas"
          tone="emerald"
          icon={<IconSparkles className="h-5 w-5" />}
        />
        <StatCard
          label="Cobrado"
          value={loading ? '—' : formatCurrency(stats.totalCobrado, stats.moneda)}
          hint="Monto total cobrado"
          tone="slate"
          icon={<IconSparkles className="h-5 w-5" />}
        />
      </div>

      <FacturasTable
        facturas={facturas}
        loading={loading}
        updatingId={updatingId}
        deletingId={deletingId}
        sendingId={sendingId}
        onMarkPaid={handleMarkPaid}
        onSendReminder={handleSendReminder}
        onDelete={(factura) => setConfirmDelete(factura)}
        onCreate={() => setModalOpen(true)}
        onOpenCuotas={(factura) => setCuotasFactura(factura)}
      />

      {/* Modal: crear factura */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Crear nueva factura"
        description="Puedes cobrarla de una vez o dividirla en cuotas mensuales."
      >
        <FacturaForm onSubmit={handleCreate} onCancel={() => setModalOpen(false)} />
      </Modal>

      {/* Modal: detalle de cuotas */}
      <CuotasModal
        factura={cuotasFactura}
        open={Boolean(cuotasFactura)}
        onClose={() => setCuotasFactura(null)}
        onChanged={() => loadFacturas({ silent: true })}
      />

      {/* Modal: confirmar eliminación */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar factura"
        description="Esta acción no se puede deshacer."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="btn-secondary"
              disabled={Boolean(deletingId)}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="btn-danger"
              disabled={Boolean(deletingId)}
            >
              {deletingId ? <Spinner className="h-4 w-4" label="Eliminando" /> : null}
              Eliminar factura
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          ¿Seguro que quieres eliminar la factura de{' '}
          <span className="font-semibold text-slate-900">{confirmDelete?.cliente}</span> por{' '}
          <span className="font-semibold text-slate-900">{formatCurrency(confirmDelete?.monto)}</span>?
        </p>
      </Modal>
    </div>
  );
}
