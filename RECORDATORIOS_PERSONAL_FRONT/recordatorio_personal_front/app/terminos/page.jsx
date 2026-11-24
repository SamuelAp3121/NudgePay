'use client';

import LegalLayout, { Seccion } from '@/components/LegalLayout';

export default function TerminosPage() {
  return (
    <LegalLayout titulo="Términos y Condiciones del Servicio" actualizado="24 de noviembre de 2026">
      <p>
        Estos Términos y Condiciones (&quot;Términos&quot;) regulan el uso de ToquePay, una plataforma de
        recordatorios de pago y gestión de cobros (&quot;el Servicio&quot;) operada por ToquePay
        (&quot;ToquePay&quot;, &quot;nosotros&quot;). Al crear una cuenta o usar el Servicio, aceptas estos Términos.
        Si no estás de acuerdo, no utilices el Servicio.
      </p>

      <Seccion numero={1} titulo="Descripción del Servicio">
        <p>
          ToquePay permite a sus usuarios (freelancers, comercios y negocios) registrar facturas y cuotas,
          enviar recordatorios de pago a sus clientes por email y, en planes de pago, por WhatsApp, generar
          enlaces de pago y consultar reportes de cobro. ToquePay es una herramienta de gestión y
          comunicación; <strong>no somos un recaudador, entidad financiera ni procesador de fondos</strong> de
          tus clientes.
        </p>
      </Seccion>

      <Seccion numero={2} titulo="Cuenta y elegibilidad">
        <p>
          Debes ser mayor de 18 años y proporcionar un email válido. Eres responsable de la confidencialidad
          de tu contraseña y de la actividad en tu cuenta. Una misma persona puede mantener una sola cuenta;
          las cuentas creadas para abusar del Servicio pueden ser suspendidas.
        </p>
      </Seccion>

      <Seccion numero={3} titulo="Planes y pagos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Plan Gratuito:</strong> hasta 10 recordatorios por mes (solo email), 10 facturas
            pendientes y 3 cuotas por factura.
          </li>
          <li>
            <strong>Plan Pro:</strong> suscripción mensual de $19.900 COP; recordatorios ilimitados por email
            y WhatsApp, facturas ilimitadas, hasta 12 cuotas, plantilla personalizable y reportes.
          </li>
          <li>
            <strong>Plan Business:</strong> suscripción mensual de $49.900 COP; incluye todo lo de Pro con
            hasta 60 cuotas y reportes avanzados.
          </li>
        </ul>
        <p>
          Los cobros de suscripción se procesan a través de la pasarela Wompi (tarjeta, PSE, Nequi). La
          suscripción es mensual y se renueva automáticamente salvo cancelación. Puedes cancelar en
          cualquier momento desde Facturación; la cancelación elimina la renovación futura y no genera
          reembolso proporcional del periodo en curso salvo que la ley lo exija.
        </p>
      </Seccion>

      <Seccion numero={4} titulo="Responsabilidad sobre tus mensajes y tus clientes">
        <p>
          Tú eres el único responsable de la veracidad de los datos que registres (montos, fechas, emails,
          teléfonos) y de que tus recordatorios correspondan a deudas reales. Prohibido usar ToquePay para
          cobrar deudas ficticias, acosar a terceros o enviar mensajes masivos no solicitados. El envío de
          recordatorios por WhatsApp está sujeto a las políticas de WhatsApp Business / Meta; si Meta bloquea
          tu número o plantilla, el canal puede dejar de funcionar sin que ello dé derecho a reembolso.
        </p>
      </Seccion>

      <Seccion numero={5} titulo="Pagos de tus clientes">
        <p>
          Cuando activas el portal de pago, tus clientes pagan directamente a tus cuentas (transferencia, QR)
          o a través de la pasarela configurada. ToquePay no retiene, custodia ni transfiere esos fondos.
          Verificar la recepción real del dinero es tu responsabilidad; marcar una cuota como pagada es una
          acción administrativa dentro del panel.
        </p>
      </Seccion>

      <Seccion numero={6} titulo="Disponibilidad y soporte">
        <p>
          Buscamos mantener el Servicio disponible de forma continua, pero no garantizamos operación
          ininterrumpida: pueden existir mantenimientos, interrupciones de proveedores (nube, email, WhatsApp,
          pasarela) o limitaciones del plan Gratuito. El soporte prioritario por email está incluido en los
          planes de pago.
        </p>
      </Seccion>

      <Seccion numero={7} titulo="Suspensión y terminación">
        <p>
          Puedes cancelar tu cuenta en cualquier momento. Podemos suspender o cerrar cuentas que incumplan
          estos Términos, hagan uso fraudulento del Servicio o generen riesgo para otros usuarios, con aviso
          por email cuando sea posible. Al cerrar la cuenta se eliminan sus datos conforme a la Política de
          Privacidad.
        </p>
      </Seccion>

      <Seccion numero={8} titulo="Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la ley, ToquePay no será responsable por daños indirectos,
          lucro cesante, deudas no recuperadas ni perjuicios derivados de mensajes no entregados, errores en
          los datos que ingreses o fallas de terceros. La responsabilidad total de ToquePay se limita, como
          máximo, al valor de tu última suscripción mensual pagada.
        </p>
      </Seccion>

      <Seccion numero={9} titulo="Cambios">
        <p>
          Podemos actualizar estos Términos; publicaremos la versión vigente en esta página con su fecha de
          actualización. Los cambios relevantes se avisarán por email o dentro del panel. El uso continuado
          tras la publicación implica la aceptación de la nueva versión.
        </p>
      </Seccion>

      <Seccion numero={10} titulo="Contacto">
        <p>
          Para cualquier consulta sobre estos Términos: <strong>soporte@toquepay.app</strong>.
        </p>
      </Seccion>
    </LegalLayout>
  );
}
