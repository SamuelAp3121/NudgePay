/**
 * Comprobación previa al build.
 *
 * La URL del backend está fija en `lib/api.js` (BACKEND_URL), así que el build
 * funciona sin variables de entorno. Si `NEXT_PUBLIC_API_URL` está definida,
 * tiene prioridad y se valida aquí.
 */

const url = String(process.env.NEXT_PUBLIC_API_URL || '').trim();

if (!url) {
  console.log('ℹ️  NEXT_PUBLIC_API_URL no definida: se usará la URL fija del backend.');
  process.exit(0);
}

if (!/^https?:\/\//i.test(url)) {
  console.error(`\n❌ NEXT_PUBLIC_API_URL debe empezar por http:// o https:// (valor actual: "${url}")\n`);
  process.exit(1);
}

if (url.endsWith('/')) {
  console.warn(`\n⚠️  NEXT_PUBLIC_API_URL termina en "/". Se recomienda quitarla: "${url.replace(/\/+$/, '')}"\n`);
}

console.log(`✅ NEXT_PUBLIC_API_URL = ${url}`);
