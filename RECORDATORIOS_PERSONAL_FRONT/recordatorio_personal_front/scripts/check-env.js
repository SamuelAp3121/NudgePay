/**
 * Comprobación previa al build.
 *
 * `NEXT_PUBLIC_API_URL` se incrusta en el bundle al compilar. Si falta, la app
 * se despliega apuntando a localhost y el registro falla en producción con un
 * error confuso. Este script detiene el build con un mensaje accionable.
 *
 * Se puede omitir con ALLOW_MISSING_API_URL=true (útil para builds locales).
 */

const url = String(process.env.NEXT_PUBLIC_API_URL || '').trim();
const omitir = process.env.ALLOW_MISSING_API_URL === 'true' || process.argv.includes('--allow-missing');

if (!url) {
  if (omitir) {
    console.warn('\n⚠️  NEXT_PUBLIC_API_URL no está definida. Se usará http://localhost:8080.\n');
    process.exit(0);
  }

  console.error(`
╔══════════════════════════════════════════════════════════════════════════╗
║  BUILD DETENIDO: falta NEXT_PUBLIC_API_URL                               ║
╚══════════════════════════════════════════╝

  Esta variable se incrusta en el bundle al compilar. Sin ella, el panel
  intentará llamar a http://localhost:8080 y el registro fallará.

  En Render (servicio del FRONTEND) → Environment:

      NEXT_PUBLIC_API_URL = https://tu-backend.onrender.com

  Después: Manual Deploy → "Clear build cache & deploy".

  Para un build local sin backend, ejecuta:

      npm run build:local
`);
  process.exit(1);
}

if (!/^https?:\/\//i.test(url)) {
  console.error(`\n❌ NEXT_PUBLIC_API_URL debe empezar por http:// o https:// (valor actual: "${url}")\n`);
  process.exit(1);
}

if (url.endsWith('/')) {
  console.warn(`\n⚠️  NEXT_PUBLIC_API_URL termina en "/". Se recomienda quitarla: "${url.replace(/\/+$/, '')}"\n`);
}

console.log(`✅ NEXT_PUBLIC_API_URL = ${url}`);
