'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Spinner } from '@/components/ui';
import { IconEye, IconEyeOff, IconMail } from '@/components/icons';
import { clearApiKey, login } from '@/lib/api';
import { useSession } from '@/lib/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function LoginPage() {
  const router = useRouter();
  const { user } = useSession({ redirectTo: null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Si ya hay sesión activa, entra directo al dashboard.
  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    const nextErrors = {};

    if (!value) nextErrors.email = 'Introduce tu correo electrónico.';
    else if (!EMAIL_REGEX.test(value)) nextErrors.email = 'Introduce un email válido.';
    if (!password) nextErrors.password = 'Introduce tu contraseña.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setError('');
    setSubmitting(true);
    try {
      await login(value, password);
      // La sesión vive en una cookie HttpOnly: no se guarda nada en localStorage.
      clearApiKey();
      router.replace('/dashboard');
    } catch (err) {
      if (err?.status === 401) {
        setError(err.message || 'Email o contraseña incorrectos.');
      } else if (err?.status === 0) {
        setError(err.message);
      } else {
        setError(err?.message || 'No se pudo iniciar sesión. Inténtalo de nuevo.');
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
          Acceso seguro
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900">
          Bienvenido de nuevo.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-500">
          Inicia sesión con tu email y contraseña para gestionar tus facturas y recordatorios.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-slate-600">
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Tu sesión se guarda en una cookie segura (HttpOnly), no en el navegador.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Contraseñas cifradas con bcrypt.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
            Recuperación por código enviado a tu correo.
          </li>
        </ul>
      </div>

      {/* Tarjeta de login */}
      <div className="card p-6 sm:p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <IconMail className="h-6 w-6" />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-slate-900">Iniciar sesión</h2>
        <p className="mt-1.5 text-sm text-slate-500">Accede a tu panel de ToquePay.</p>

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
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="label mb-0">
                Contraseña
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  if (error) setError('');
                }}
                placeholder="••••••••"
                className={`input pr-11 ${errors.password ? 'input-error' : ''}`}
                aria-invalid={Boolean(errors.password)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-700"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                title={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="field-error">{errors.password}</p>}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner className="h-4 w-4" label="Entrando" />
                Entrando…
              </>
            ) : (
              'Entrar al panel'
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
          ¿Todavía no tienes cuenta?{' '}
          <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Crea tu cuenta gratis
          </Link>
        </div>
      </div>
    </div>
  );
}
