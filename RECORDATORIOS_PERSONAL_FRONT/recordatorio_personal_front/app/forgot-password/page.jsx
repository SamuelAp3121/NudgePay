'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Spinner } from '@/components/ui';
import { IconKey } from '@/components/icons';
import { forgotPassword } from '@/lib/api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = email.trim().toLowerCase();

    if (!value) {
      setFieldError('Introduce tu correo electrónico.');
      return;
    }
    if (!EMAIL_REGEX.test(value)) {
      setFieldError('Introduce un email válido.');
      return;
    }

    setFieldError('');
    setError('');
    setSubmitting(true);
    try {
      await forgotPassword(value);
      setSent(true);
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el código. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card p-6 sm:p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <IconKey className="h-6 w-6" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-slate-900">Recupera tu contraseña</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Te enviaremos un código de 6 dígitos a tu correo para crear una contraseña nueva.
        </p>

        {error && (
          <Alert type="error" className="mt-5" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {sent ? (
          <>
            <Alert type="success" className="mt-5" title="Revisa tu correo">
              Si <span className="font-semibold">{email.trim().toLowerCase()}</span> está registrado,
              recibirás un código válido durante 15 minutos.
            </Alert>
            <button
              type="button"
              onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`)}
              className="btn-primary mt-5 w-full"
            >
              Introducir el código
            </button>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="btn-ghost mt-2 w-full"
            >
              Usar otro correo
            </button>
          </>
        ) : (
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
                  if (fieldError) setFieldError('');
                  if (error) setError('');
                }}
                placeholder="tu@empresa.com"
                className={`input ${fieldError ? 'input-error' : ''}`}
                aria-invalid={Boolean(fieldError)}
              />
              {fieldError && <p className="field-error">{fieldError}</p>}
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner className="h-4 w-4" label="Enviando" />
                  Enviando código…
                </>
              ) : (
                'Enviar código'
              )}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
