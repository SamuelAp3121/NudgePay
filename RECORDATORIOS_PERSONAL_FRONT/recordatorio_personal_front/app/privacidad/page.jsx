'use client';

import LegalLayout, { Seccion } from '@/components/LegalLayout';

export default function PrivacidadPage() {
  return (
    <LegalLayout titulo="Política de Privacidad" actualizado="24 de noviembre de 2026">
      <p>
        Esta Política describe cómo ToquePay recoge, usa y protege los datos personales cuando usas nuestra
        plataforma de recordatorios de pago. Tratamos los datos conforme a la Ley 1581 de 2012 (Colombia) y
        buenas prácticas internacionales de protección de datos.
      </p>

      <Seccion numero={1} titulo="Datos que recopilamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Cuenta:</strong> email y contraseña (guardada como hash cifrado, nunca en texto plano).
          </li>
          <li>
            <strong>Datos de facturación que tú registras:</strong> nombre, email y teléfono de tus clientes,
            concepto, montos, moneda, fechas y, si activas transferencia, los datos bancarios que decidas
            mostrar.
          </li>
          <li>
            <strong>Datos de envío:</strong> registro de cada recordatorio enviado (destino, canal, fecha,
            estado y, si falló, el motivo técnico).
          </li>
          <li>
            <strong>Configuración opcional:</strong> credenciales de WhatsApp Business y plantillas de
            mensaje si decides conectar tu propia cuenta.
          </li>
          <li>
            <strong>Datos de pago del plan:</strong> los cobros los procesa Wompi; ToquePay guarda solo la
            referencia de la transacción, el monto y el estado — <strong>nunca el número de tarjeta</strong>.
          </li>
          <li>
            <strong>Datos técnicos:</strong> cookies de sesión (HttpOnly) necesarias para mantener tu sesión
            iniciada y logs de seguridad.
          </li>
        </ul>
      </Seccion>

      <Seccion numero={2} titulo="Para qué usamos los datos">
        <ul className="list-disc space-y-2 pl-5">
          <li>Operar el Servicio: crear tus facturas, enviar los recordatorios y mostrar tus reportes.</li>
          <li>Gestionar tu plan, suscripciones y cobros por la pasarela.</li>
          <li>Enviarte comunicaciones de la cuenta (bienvenida, seguridad, cambios del servicio).</li>
          <li>Prevenir abuso, fraude y uso indebido de la plataforma.</li>
        </ul>
        <p>
          <strong>No vendemos ni alquilamos tus datos personales a terceros</strong> con fines publicitarios.
        </p>
      </Seccion>

      <Seccion numero={3} titulo="Datos de TUS clientes">
        <p>
          Como usuario de ToquePay, tú registras los datos de tus propios clientes para poder cobrarles. En
          ese caso tú actúas como responsable del tratamiento de esos datos y ToquePay como encargado: los
          usamos exclusivamente para enviar los recordatorios que tú configuras y mostrarlos en tu panel. Si
          uno de tus clientes quiere ejercer derechos sobre sus datos, debe dirigirse a ti como responsable;
          puedes eliminarlos borrando la factura correspondiente.
        </p>
      </Seccion>

      <Seccion numero={4} titulo="Terceros con los que compartimos datos">
        <p>Solo compartimos lo mínimo necesario para operar el Servicio:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Proveedor de email transaccional</strong> (p. ej. Resend): para entregar los
            recordatorios y correos de la cuenta.
          </li>
          <li>
            <strong>Meta / WhatsApp Cloud API</strong> (planes de pago): para entregar los recordatorios por
            WhatsApp al número de tu cliente.
          </li>
          <li>
            <strong>Wompi:</strong> para procesar los pagos de tus clientes y de tu suscripción.
          </li>
          <li>
            <strong>Proveedor de base de datos y hosting</strong> (p. ej. Supabase, Render): para almacenar y
            operar la plataforma.
          </li>
        </ul>
        <p>
          También podemos revelar datos si una autoridad competente lo exige por ley o proceso judicial
          válido.
        </p>
      </Seccion>

      <Seccion numero={5} titulo="Seguridad">
        <p>
          Ciframos las conexiones (HTTPS/TLS), guardamos las contraseñas con algoritmos de hash seguros y las
          cookies de sesión son HttpOnly. Las credenciales que configuras (API de WhatsApp, tokens) se
          almacenan en el servidor y nunca se devuelven completas al navegador. Ningún sistema es 100% infalible;
          si detectamos un incidente que afecte tus datos, te lo notificaremos.
        </p>
      </Seccion>

      <Seccion numero={6} titulo="Conservación y eliminación">
        <p>
          Conservamos tus datos mientras tu cuenta esté activa. Al eliminar facturas se borran sus datos y
          sus cuotas; el registro histórico de envíos se mantiene para calcular el consumo de tu plan. Si
          eliminas tu cuenta (o la cerramos por Términos), eliminamos o anonimizamos tus datos personales en
          un plazo máximo de 30 días, salvo que la ley exija conservar registros de facturación.
        </p>
      </Seccion>

      <Seccion numero={7} titulo="Tus derechos">
        <p>
          Puedes acceder, actualizar, rectificar y solicitar la eliminación de tus datos, así como revocar la
          autorización para su tratamiento, escribiendo a <strong>soporte@toquepay.app</strong> desde el email
          de tu cuenta. Responderemos en los plazos legales aplicables. También puedes cerrar tu sesión en
          cualquier momento con el botón &quot;Cerrar sesión&quot; del panel.
        </p>
      </Seccion>

      <Seccion numero={8} titulo="Cookies">
        <p>
          Usamos únicamente la cookie técnica de sesión (<code>ir_session</code>) y, para el panel de
          administración, <code>ir_admin_session</code>. Son estrictamente funcionales: no las usamos para
          publicidad ni seguimiento de terceros.
        </p>
      </Seccion>

      <Seccion numero={9} titulo="Menores de edad">
        <p>El Servicio no está dirigido a menores de 18 años y no recopilamos sus datos a sabiendas.</p>
      </Seccion>

      <Seccion numero={10} titulo="Cambios y contacto">
        <p>
          Publicaremos aquí cualquier cambio con su fecha de actualización. Para ejercer tus derechos o
          resolver dudas: <strong>soporte@toquepay.app</strong>.
        </p>
      </Seccion>
    </LegalLayout>
  );
}
