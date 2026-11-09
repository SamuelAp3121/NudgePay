import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Página no encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        La página que buscas no existe o fue movida a otra ubicación.
      </p>
      <Link href="/dashboard" className="btn-primary mt-6">
        Volver al dashboard
      </Link>
    </div>
  );
}
