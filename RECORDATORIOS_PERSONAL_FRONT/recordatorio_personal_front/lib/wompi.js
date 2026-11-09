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
 * Envía el usuario al checkout de Wompi.
 * @param {{ public_key: string, moneda: string, monto_centavos: number, referencia: string, signature: string, redirect_url?: string, email?: string }} data
 */
export function abrirCheckoutWompi(data) {
  if (typeof document === 'undefined') return;

  const redirectUrl = data.redirect_url || `${window.location.origin}/billing?pago=ok`;

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = WOMPI_CHECKOUT_URL;
  form.name = 'checkout';
  form.target = '_top';
  form.style.display = 'none';

  const campos = {
    'public-key': data.public_key,
    currency: data.moneda || 'COP',
    'amount-in-cents': String(data.monto_centavos),
    reference: data.referencia,
    'signature:integrity': data.signature,
    'redirect-url': redirectUrl,
    'customer-data:email': data.email || '',
  };

  Object.entries(campos).forEach(([name, value]) => {
    if (!value) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
