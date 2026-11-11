import './globals.css';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import RouteGuard from '@/components/RouteGuard';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'ToquePay — Cobra sin perseguir a tus clientes',
  description:
    'ToquePay: recordatorios de facturas por email, pagos en línea y control de cuotas en un solo panel.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
              <RouteGuard>
                <ImpersonationBanner />
                {children}
              </RouteGuard>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
