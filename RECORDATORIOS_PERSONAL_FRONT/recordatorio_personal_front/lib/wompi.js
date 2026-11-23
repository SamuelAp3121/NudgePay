/**
 * Utilidades para abrir el checkout de Wompi (Web Checkout).
 *
 * Wompi espera el formulario con nombre "checkout" y método POST a
 * https://checkout.wompi.co/p/ con:
 *   public-key, currency, amount-in-cents, reference, signature:integrity, redirect-url
 *
 * Docs: https://docs.wompi.co/docs/colombia/widget-checkout-web/
 */
export const WOMPI_CHECKOUT_URL = 'https://checkout.wompi.co/p/';

/**
 * Envía el usuario al Web Checkout de Wompi mediante redirección GET con query params.
 * @param {{ public_key: string, moneda: string, monto_centavos: number, referencia: string, signature: string, redirect_url?: string, email?: string }} data
 */
export function abrirCheckoutWompi(data) {
  if (typeof window === 'undefined') return false;

  const requeridos = {
    'public-key': data?.public_key,
    currency: data?.moneda,
    'amount-in-cents': data?.monto_centavos,
    reference: data?.referencia,
    'signature:integrity': data?.signature,
  };

  const faltantes = Object.entries(requeridos)
    .filter(([, valor]) => valor === undefined || valor === null || valor === '')
    .map(([campo]) => campo);

  if (faltantes.length > 0) {
    throw new Error(
      `El backend no devolvió datos completos del checkout (faltan: ${faltantes.join(', ')}). ` +
        'Verifica que el servidor tenga WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET y que esté actualizado.',
    );
  }

  const redirectUrl = data.redirect_url || `${window.location.origin}/billing?pago=ok`;

  const params = new URLSearchParams();
  params.set('public-key', String(data.public_key));
  params.set('currency', String(data.moneda || 'COP'));
  params.set('amount-in-cents', String(data.monto_centavos));
  params.set('reference', String(data.referencia));
  params.set('signature:integrity', String(data.signature));
  params.set('redirect-url', redirectUrl);

  if (data.email) {
    params.set('customer-data:email', String(data.email));
  }

  window.location.href = `${WOMPI_CHECKOUT_URL}?${params.toString()}`;
  return true;
}
