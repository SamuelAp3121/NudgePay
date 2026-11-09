'use client';

import { useState } from 'react';
import { Alert, Spinner } from './ui';
import { IconCheck, IconKey } from './icons';
import { changePassword } from '@/lib/api';

const INITIAL = { actual: '', nueva: '', confirmar: '' };

function passwordChecks(password) {
  return [
    { label: 'Al menos 8 caracteres', ok: password.length >= 8 },
    { label: 'Una letra', ok: /[a-zA-Z]/.test(password) },
    { label: 'Un número', ok: /\d/.test(password) },
  ];
}

/** Cambio de contraseña de la cuenta (sesión por cookie). */
export default function PasswordCard({ email }) {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null); // { type, message }
  const [saving, setSaving] = useState(false);

  const checks = passwordChecks(values.nueva);

  const handleChange = (field) => (event) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (notice) setNotice(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!values.actual) nextErrors.actual = 'Introduce tu contraseña actual.';
    if (checks.some((check) => !check.ok)) nextErrors.nueva = 'La contraseña no cumple los requisitos.';
    if (values.confirmar !== values.nueva) nextErrors.confirmar = 'Las contraseñas no coinciden.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await changePassword({ passwordActual: values.actual, passwordNueva: values.nueva });
      setValues(INITIAL);
      setNotice({ type: 'success', message: 'Contraseña actualizada correctamente.' });
    } catch (error) {
      setNotice({ type: 'error', message: error?.message || 'No se pudo cambiar la contraseña.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <IconKey className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Contraseña</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {email ? (
              <>
                Cuenta: <span className="font-medium text-slate-700">{email}</span>
              </>
            ) : (
              'Cambia la contraseña de tu cuenta.'
            )}
          </p>
        </div>
      </div>

      {notice && (
        <Alert type={notice.type} className="mt-4" onClose={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <div>
          <label htmlFor="password-actual" className="label">
            Contraseña actual
          </label>
          <input
            id="password-actual"
            type="password"
            autoComplete="current-password"
            value={values.actual}
            onChange={handleChange('actual')}
            className={`input ${errors.actual ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.actual)}
          />
          {errors.actual && <p className="field-error">{errors.actual}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password-nueva" className="label">
              Nueva contraseña
            </label>
            <input
              id="password-nueva"
              type="password"
              autoComplete="new-password"
              value={values.nueva}
              onChange={handleChange('nueva')}
              className={`input ${errors.nueva ? 'input-error' : ''}`}
              aria-invalid={Boolean(errors.nueva)}
            />
            {errors.nueva && <p className="field-error">{errors.nueva}</p>}
          </div>
          <div>
            <label htmlFor="password-confirmar" className="label">
              Repite la nueva contraseña
            </label>
            <input
              id="password-confirmar"
              type="password"
              autoComplete="new-password"
              value={values.confirmar}
              onChange={handleChange('confirmar')}
              className={`input ${errors.confirmar ? 'input-error' : ''}`}
              aria-invalid={Boolean(errors.confirmar)}
            />
            {errors.confirmar && <p className="field-error">{errors.confirmar}</p>}
          </div>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {checks.map((check) => (
            <li
              key={check.label}
              className={`flex items-center gap-1.5 text-xs ${check.ok ? 'text-emerald-600' : 'text-slate-400'}`}
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                  check.ok ? 'bg-emerald-100' : 'bg-slate-100'
                }`}
              >
                <IconCheck className="h-2.5 w-2.5" />
              </span>
              {check.label}
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? (
              <>
                <Spinner className="h-4 w-4" label="Guardando" />
                Guardando…
              </>
            ) : (
              'Cambiar contraseña'
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
