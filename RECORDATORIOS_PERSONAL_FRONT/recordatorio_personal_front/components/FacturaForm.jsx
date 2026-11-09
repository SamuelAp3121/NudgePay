'use client';

import { useMemo, useState } from 'react';
import { Spinner } from './ui';
import { CURRENCIES, DEFAULT_CURRENCY, currencySymbol, formatCurrency, todayISO } from '@/lib/format';

const INITIAL = {
  cliente_nombre: '',
  cliente_email: '',
  concepto: '',
  monto: '',
  moneda: DEFAULT_CURRENCY,
  cuotas: '1',
  fecha_vencimiento: '',
  pago_link: true,
  pago_qr: false,
  pago_transfer: false,
  banco_nombre: '',
  banco_cuenta: '',
  banco_titular: '',
  qr_payload: '',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_CUOTAS = 60;

function validate(values) {
  const errors = {};

  if (!values.cliente_nombre.trim()) {
    errors.cliente_nombre = 'El nombre del cliente es obligatorio.';
  } else if (values.cliente_nombre.trim().length < 2) {
    errors.cliente_nombre = 'Introduce al menos 2 caracteres.';
  }

  if (!values.cliente_email.trim()) {
    errors.cliente_email = 'El email es obligatorio.';
  } else if (!EMAIL_REGEX.test(values.cliente_email.trim())) {
    errors.cliente_email = 'Introduce un email válido (ej: cliente@empresa.com).';
  }

  const monto = Number(values.monto);
  if (values.monto === '' || Number.isNaN(monto)) {
    errors.monto = 'Introduce un monto.';
  } else if (monto <= 0) {
    errors.monto = 'El monto debe ser mayor que 0.';
  }

  const cuotas = Number(values.cuotas);
  if (!Number.isInteger(cuotas) || cuotas < 1) {
    errors.cuotas = 'Mínimo 1 cuota.';
  } else if (cuotas > MAX_CUOTAS) {
    errors.cuotas = `Máximo ${MAX_CUOTAS} cuotas.`;
  }

  if (!values.fecha_vencimiento) {
    errors.fecha_vencimiento = 'Selecciona la fecha de vencimiento.';
  }

  return errors;
}

/** Suma meses a una fecha YYYY-MM-DD (sin desfase de zona horaria). */
function addMonths(isoDate, months) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

/**
 * Formulario de creación de factura (pago único o por cuotas).
 * `onSubmit` recibe el payload listo para enviar al backend y debe devolver una promesa.
 */
export default function FacturaForm({ onSubmit, onCancel }) {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    if (serverError) setServerError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setServerError('');
    try {
      await onSubmit({
        cliente_nombre: values.cliente_nombre.trim(),
        cliente_email: values.cliente_email.trim().toLowerCase(),
        concepto: values.concepto.trim(),
        monto: Number(Number(values.monto).toFixed(2)),
        moneda: values.moneda,
        cuotas: Number(values.cuotas),
        fecha_vencimiento: values.fecha_vencimiento,
        pago_link: values.pago_link,
        pago_qr: values.pago_qr,
        pago_transfer: values.pago_transfer,
        banco_nombre: values.banco_nombre.trim(),
        banco_cuenta: values.banco_cuenta.trim(),
        banco_titular: values.banco_titular.trim(),
        qr_payload: values.qr_payload.trim(),
      });
      setValues(INITIAL);
    } catch (error) {
      setServerError(error?.message || 'No se pudo crear la factura. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  /* --------------------------- Resumen de cuotas --------------------------- */

  const resumen = useMemo(() => {
    const monto = Number(values.monto);
    const cuotas = Number(values.cuotas);
    if (!Number.isFinite(monto) || monto <= 0 || !Number.isInteger(cuotas) || cuotas < 1) return null;

    const base = Math.round((monto / cuotas) * 100) / 100;
    const ultima = Math.round((monto - base * (cuotas - 1)) * 100) / 100;
    const fechas = Array.from({ length: Math.min(cuotas, 6) }, (_, index) =>
      addMonths(values.fecha_vencimiento, index)
    );

    return { base, ultima, fechas, restantes: Math.max(0, cuotas - 6) };
  }, [values.monto, values.cuotas, values.fecha_vencimiento]);

  const symbol = currencySymbol(values.moneda);

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {serverError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {serverError}
        </div>
      )}

      <div>
        <label htmlFor="cliente_nombre" className="label">
          Nombre del cliente
        </label>
        <input
          id="cliente_nombre"
          name="cliente_nombre"
          type="text"
          autoFocus
          value={values.cliente_nombre}
          onChange={handleChange('cliente_nombre')}
          placeholder="Acme Corp"
          className={`input ${errors.cliente_nombre ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors.cliente_nombre)}
        />
        {errors.cliente_nombre && <p className="field-error">{errors.cliente_nombre}</p>}
      </div>

      <div>
        <label htmlFor="cliente_email" className="label">
          Email del cliente
        </label>
        <input
          id="cliente_email"
          name="cliente_email"
          type="email"
          value={values.cliente_email}
          onChange={handleChange('cliente_email')}
          placeholder="pagos@acme.com"
          className={`input ${errors.cliente_email ? 'input-error' : ''}`}
          aria-invalid={Boolean(errors.cliente_email)}
        />
        {errors.cliente_email && <p className="field-error">{errors.cliente_email}</p>}
      </div>

      <div>
        <label htmlFor="concepto" className="label">
          Concepto de la deuda
        </label>
        <input
          id="concepto"
          name="concepto"
          type="text"
          maxLength={300}
          value={values.concepto}
          onChange={handleChange('concepto')}
          placeholder="Ej: Servicio de diseño web - Proyecto Q4"
          className="input"
        />
        <p className="mt-1.5 text-xs text-slate-400">
          Aparecerá en el email y en la página de pago del cliente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="monto" className="label">
            Monto total
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm font-medium text-slate-400">
              {symbol}
            </span>
            <input
              id="monto"
              name="monto"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={values.monto}
              onChange={handleChange('monto')}
              placeholder="0.00"
              className={`input pl-8 ${errors.monto ? 'input-error' : ''}`}
              aria-invalid={Boolean(errors.monto)}
            />
          </div>
          {errors.monto && <p className="field-error">{errors.monto}</p>}
        </div>

        <div>
          <label htmlFor="moneda" className="label">
            Moneda
          </label>
          <select
            id="moneda"
            name="moneda"
            value={values.moneda}
            onChange={handleChange('moneda')}
            className="input"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code} — {currency.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cuotas" className="label">
            Número de cuotas
          </label>
          <input
            id="cuotas"
            name="cuotas"
            type="number"
            inputMode="numeric"
            min="1"
            max={MAX_CUOTAS}
            step="1"
            value={values.cuotas}
            onChange={handleChange('cuotas')}
            className={`input ${errors.cuotas ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.cuotas)}
          />
          {errors.cuotas ? (
            <p className="field-error">{errors.cuotas}</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">1 = pago único. Máximo {MAX_CUOTAS}.</p>
          )}
        </div>

        <div>
          <label htmlFor="fecha_vencimiento" className="label">
            {Number(values.cuotas) > 1 ? 'Vencimiento de la 1ª cuota' : 'Fecha de vencimiento'}
          </label>
          <input
            id="fecha_vencimiento"
            name="fecha_vencimiento"
            type="date"
            min={todayISO()}
            value={values.fecha_vencimiento}
            onChange={handleChange('fecha_vencimiento')}
            className={`input ${errors.fecha_vencimiento ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.fecha_vencimiento)}
          />
          {errors.fecha_vencimiento && <p className="field-error">{errors.fecha_vencimiento}</p>}
        </div>
      </div>

      {/* Medios de pago para el cliente */}
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Medios de pago del cliente
        </legend>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-slate-50">
            <input
              type="checkbox"
              checked={values.pago_link}
              onChange={(event) => setValues((prev) => ({ ...prev, pago_link: event.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                Enlace de pago (tarjeta / PSE)
              </span>
              <span className="block text-xs text-slate-500">
                El cliente paga en línea desde la página de la factura.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-slate-50">
            <input
              type="checkbox"
              checked={values.pago_qr}
              onChange={(event) => setValues((prev) => ({ ...prev, pago_qr: event.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Código QR</span>
              <span className="block text-xs text-slate-500">
                Se genera un QR con la llave o el contenido que indiques.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-slate-50">
            <input
              type="checkbox"
              checked={values.pago_transfer}
              onChange={(event) => setValues((prev) => ({ ...prev, pago_transfer: event.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Transferencia bancaria</span>
              <span className="block text-xs text-slate-500">
                Muestra tus datos de cuenta al cliente.
              </span>
            </span>
          </label>
        </div>

        {values.pago_qr && (
          <div className="mt-3">
            <label htmlFor="qr_payload" className="label">
              Contenido del QR (llave Bre-B, Nequi, etc.)
            </label>
            <input
              id="qr_payload"
              type="text"
              value={values.qr_payload}
              onChange={handleChange('qr_payload')}
              placeholder="@miallave o 0002010102112658..."
              className="input font-mono text-sm"
            />
          </div>
        )}

        {values.pago_transfer && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="banco_nombre" className="label">
                Banco
              </label>
              <input
                id="banco_nombre"
                type="text"
                value={values.banco_nombre}
                onChange={handleChange('banco_nombre')}
                placeholder="Bancolombia"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="banco_cuenta" className="label">
                Cuenta
              </label>
              <input
                id="banco_cuenta"
                type="text"
                value={values.banco_cuenta}
                onChange={handleChange('banco_cuenta')}
                placeholder="123-456789-01"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="banco_titular" className="label">
                Titular
              </label>
              <input
                id="banco_titular"
                type="text"
                value={values.banco_titular}
                onChange={handleChange('banco_titular')}
                placeholder="Mi Empresa SAS"
                className="input"
              />
            </div>
          </div>
        )}
      </fieldset>

      {/* Resumen del plan de cuotas */}
      {resumen && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Plan de pagos
            </p>
            <p className="text-xs font-medium text-slate-500">
              {Number(values.cuotas)} cuota{Number(values.cuotas) === 1 ? '' : 's'} ·{' '}
              {formatCurrency(Number(values.monto), values.moneda)}
            </p>
          </div>

          {Number(values.cuotas) === 1 ? (
            <p className="mt-2 text-sm text-slate-700">
              Pago único de{' '}
              <span className="font-semibold">{formatCurrency(Number(values.monto), values.moneda)}</span>
              {values.fecha_vencimiento && ` el ${values.fecha_vencimiento}`}.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-slate-700">
                {Number(values.cuotas)} cuotas de{' '}
                <span className="font-semibold">{formatCurrency(resumen.base, values.moneda)}</span>
                {resumen.ultima !== resumen.base && (
                  <>
                    {' '}
                    (la última de{' '}
                    <span className="font-semibold">{formatCurrency(resumen.ultima, values.moneda)}</span>)
                  </>
                )}
                , una por mes.
              </p>
              {values.fecha_vencimiento && (
                <ul className="mt-3 space-y-1">
                  {resumen.fechas.map((fecha, index) => (
                    <li key={fecha} className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Cuota {index + 1} · {fecha}
                      </span>
                      <span className="font-medium text-slate-700">
                        {formatCurrency(
                          index === Number(values.cuotas) - 1 ? resumen.ultima : resumen.base,
                          values.moneda
                        )}
                      </span>
                    </li>
                  ))}
                  {resumen.restantes > 0 && (
                    <li className="text-xs text-slate-400">… y {resumen.restantes} más</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner className="h-4 w-4" label="Creando factura" />
              Creando…
            </>
          ) : (
            'Crear factura'
          )}
        </button>
      </div>
    </form>
  );
}
