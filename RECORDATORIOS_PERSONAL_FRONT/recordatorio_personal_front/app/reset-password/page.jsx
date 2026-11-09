'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Spinner } from '@/components/ui';
import { IconCheck, IconEye, IconEyeOff, IconKey } from '@/components/icons';
import { resetPassword } from '@/lib/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function passwordChecks(password) {
  return [
    { label: 'Al menos 8 caracteres', ok: password.length >= 8 },
    { label: 'Una letra', ok: /[a-zA-Z]/.test(password) },
    { label: 'Un número', ok: /\d/.test(password) },
  ];
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const checks = passwordChecks(password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    const nextErrors = {};

    if (!value) nextErrors.email = 'Introduce tu correo electrónico.';
    else if (!EMAIL_REGEX.test(value)) nextErrors.email = 'Introduce un email válido.';
    if (!/^\d{6}$/.test(codigo.trim())) nextErrors.codigo = 'El código tiene 6 dígitos.';
    if (checks.some((check) => !check.ok)) nextErrors.password = 'La contraseña no cumple los requisitos.';
    if (confirm !== password) nextErrors.confirm = 'Las contraseñas no coinciden.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setError('');
    setSubmitting(true);
    try {
      await resetPassword({ email: value, codigo: codigo.trim(), passwordNueva: password });
      setDone(true);
    } catch (err) {
      setError(err?.message || 'No se pudo restablecer la contraseña.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <>
        <Alert type="success" className="mt-5" title="Contraseña actualizada">
          Ya puedes iniciar sesión con tu nueva contraseña.
        </Alert>
        <button type="button" onClick={() => router.push('/login')} className="btn-primary mt-5 w-full">
          Ir a iniciar sesión
        </button>
      </>
    );
  }

  return (
    <>
      {error && (
        <Alert type="error" className="mt-5" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="label">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="tu@empresa.com"
            className={`input ${errors.email ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>

        <div>
          <label htmlFor="codigo" className="label">
            Código de 6 dígitos
          </label>
          <input
            id="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(event) => {
              setCodigo(event.target.value.replace(/\D/g, ''));
              if (errors.codigo) setErrors((prev) => ({ ...prev, codigo: undefined }));
            }}
            placeholder="123456"
            className={`input text-center font-mono text-lg tracking-[0.5em] ${errors.codigo ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.codigo)}
          />
          {errors.codigo && <p className="field-error">{errors.codigo}</p>}
        </div>

        <div>
          <label htmlFor="password" className="label">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Mínimo 8 caracteres"
              className={`input pr-11 ${errors.password ? 'input-error' : ''}`}
              aria-invalid={Boolean(errors.password)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-700"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="field-error">{errors.password}</p>}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
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
        </div>

        <div>
          <label htmlFor="confirm" className="label">
            Repite la contraseña
          </label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value);
              if (errors.confirm) setErrors((prev) => ({ ...prev, confirm: undefined }));
            }}
            placeholder="••••••••"
            className={`input ${errors.confirm ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.confirm)}
          />
          {errors.confirm && <p className="field-error">{errors.confirm}</p>}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner className="h-4 w-4" label="Guardando" />
              Guardando…
            </>
          ) : (
            'Cambiar contraseña'
          )}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card p-6 sm:p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <IconKey className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Nueva contraseña</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Introduce el código que recibiste por email y elige una contraseña nueva.
        </p>

        <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-lg bg-slate-100" />}>
          <ResetPasswordForm />
        </Suspense>

        <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
          ¿No recibiste el código?{' '}
          <Link href="/forgot-password" className="font-semibold text-brand-600 hover:text-brand-700">
            Solicitar otro
          </Link>
        </div>
      </div>
    </div>
  );
}
