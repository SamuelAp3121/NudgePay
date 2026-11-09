'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Spinner } from '@/components/ui';
import { IconCheck, IconEye, IconEyeOff, IconMail, IconSparkles } from '@/components/icons';
import { clearApiKey, register } from '@/lib/api';
import { useSession } from '@/lib/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const BENEFITS = [
  'Hasta 20 recordatorios automáticos al mes',
  'Facturas ilimitadas con estados y vencimientos',
  'Plantilla de email personalizable',
  'Sin tarjeta de crédito',
];

/** Reglas de contraseña (deben coincidir con el backend). */
function passwordChecks(password) {
  return [
    { label: 'Al menos 8 caracteres', ok: password.length >= 8 },
    { label: 'Una letra', ok: /[a-zA-Z]/.test(password) },
    { label: 'Un número', ok: /\d/.test(password) },
  ];
}

export default function RegisterPage() {
  const router = useRouter();
  const { user } = useSession({ redirectTo: null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión, no tiene sentido registrarse otra vez.
  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const checks = passwordChecks(password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    const nextErrors = {};

    if (!value) nextErrors.email = 'Introduce tu correo electrónico.';
    else if (!EMAIL_REGEX.test(value)) nextErrors.email = 'Introduce un email válido (ej: tu@empresa.com).';

    if (!password) nextErrors.password = 'Crea una contraseña.';
    else if (checks.some((check) => !check.ok)) nextErrors.password = 'La contraseña no cumple los requisitos.';

    if (confirm !== password) nextErrors.confirm = 'Las contraseñas no coinciden.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setError('');
    setSubmitting(true);
    try {
      await register(value, password);
      // El backend abre la sesión con una cookie HttpOnly.
      clearApiKey();
      router.replace('/dashboard');
    } catch (err) {
      if (err?.status === 409) {
        setError('Este correo ya está registrado. Inicia sesión o recupera tu contraseña.');
      } else if (err?.status === 0) {
        setError(err.message);
      } else {
        setError(err?.message || 'No se pudo completar el registro. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 py-6 lg:grid-cols-2 lg:gap-16 lg:py-12">
      {/* Columna informativa */}
      <div className="hidden lg:block">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
          <IconSparkles className="h-3.5 w-3.5" />
          Plan gratuito incluido
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
          Cobra a tiempo, sin perseguir a tus clientes.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-500">
          Crea tu cuenta en segundos y empieza a enviar recordatorios de facturas automáticos por
          email.
        </p>
        <ul className="mt-8 space-y-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3 text-sm text-slate-600">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <IconCheck className="h-3.5 w-3.5" />
              </span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      {/* Tarjeta de registro */}
      <div className="card p-6 sm:p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <IconMail className="h-6 w-6" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-slate-900">Crea tu cuenta</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Solo necesitamos tu email y una contraseña.
        </p>

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
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                if (error) setError('');
              }}
              placeholder="tu@empresa.com"
              className={`input ${errors.email ? 'input-error' : ''}`}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="label">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  if (error) setError('');
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
                  className={`flex items-center gap-1.5 text-xs ${
                    check.ok ? 'text-emerald-600' : 'text-slate-400'
                  }`}
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
              name="confirm"
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
                <Spinner className="h-4 w-4" label="Registrando" />
                Creando tu cuenta…
              </>
            ) : (
              'Crear cuenta'
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          Al registrarte aceptas recibir emails relacionados con tu cuenta.
        </p>

        <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Inicia sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
