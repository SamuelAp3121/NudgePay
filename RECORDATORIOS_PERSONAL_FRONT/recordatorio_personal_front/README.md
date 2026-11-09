# NudgePay — Frontend

NudgePay es el panel SaaS de cobros: facturas y cuotas, recordatorios automáticos por email,
plantillas personalizables, portal de pago para el cliente y suscripciones con Wompi.
Construido con **Next.js (App Router)**, **React 19** y **Tailwind CSS**.

## Requisitos

- Node.js 18.18+ (recomendado 20+)
- Backend en Go escuchando en `NEXT_PUBLIC_API_URL`

## Puesta en marcha

1. **Backend Go** (carpeta `c:\Desarrollos\RECORDATORIOS_PERSONAL`):

   ```bash
   go run .        # escucha en http://localhost:8080
   ```

2. **Frontend**:

   ```bash
   npm install
   copy .env.local.example .env.local   # ajusta NEXT_PUBLIC_API_URL
   npm run dev
   ```

3. Abre http://localhost:3000 (redirige a `/dashboard`) e introduce tu **API Key**
   (la de la tabla `usuarios` de Supabase).

## Endpoints del backend que consume el frontend

| Método | Ruta                                  | Uso                                   |
| ------ | ------------------------------------- | ------------------------------------- |
| GET    | `/api/v1/me`                          | Plan, API Key y recordatorios usados  |
| GET    | `/api/v1/facturas`                    | Listar facturas del usuario           |
| POST   | `/api/v1/facturas`                    | Crear factura                         |
| POST   | `/api/v1/facturas/:id/pagar`          | Marcar como pagada                    |
| POST   | `/api/v1/facturas/:id/recordatorio`   | Enviar recordatorio por email ahora   |
| DELETE | `/api/v1/facturas/:id`                | Eliminar factura                      |

Todas requieren el header `X-API-Key`. El backend debe permitir CORS desde
`http://localhost:3000` (variable `CORS_ORIGINS` en su `.env`).

## Variables de entorno

| Variable              | Descripción                                  |
| --------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | URL base del backend Go (sin barra final)    |

## Estructura

```
app/
  layout.jsx            Layout raíz + sidebar
  page.jsx              Redirige a /dashboard
  globals.css           Tailwind + clases de componentes (.btn, .card, .input…)
  dashboard/page.jsx    Tabla de facturas, métricas y modal de creación
  settings/page.jsx     API Key (copiar/editar) + uso del plan
  billing/page.jsx      Planes Free / Pro y upgrade
components/
  Sidebar.jsx           Navegación lateral (desktop) + drawer (móvil)
  FacturasTable.jsx     Tabla con estados, vencimientos y acciones
  FacturaForm.jsx       Formulario validado de nueva factura
  ApiKeyCard.jsx        Tarjeta de API Key con copiar al portapapeles
  ApiKeyGate.jsx        Pantalla para introducir la API Key si no existe
  PlanUsageCard.jsx     Indicador "15/20 recordatorios usados"
  ui.jsx                Spinner, Alert, Modal, PageHeader, EmptyState
  icons.jsx             Iconos SVG inline
lib/
  api.js                Cliente fetch con header X-API-Key
  format.js             Formateo de moneda/fechas y normalización de datos
```

## Autenticación

La sesión del panel va por cookie HttpOnly (`ir_session`). La API Key solo se usa en
integraciones/scripts, guardada en `localStorage` (clave `invoice_reminder_api_key`) y enviada
con el header `X-API-Key`.
introducirla; también se puede gestionar desde **Configuración**.

## Endpoints utilizados

| Método | Ruta                    | Uso                                  |
| ------ | ----------------------- | ------------------------------------ |
| GET    | `/api/v1/facturas`      | Listar facturas                      |
| POST   | `/api/v1/facturas`      | Crear factura                        |
| PATCH  | `/api/v1/facturas/:id`  | Marcar como pagada (`{ estado: "pagada" }`) |
| DELETE | `/api/v1/facturas/:id`  | Eliminar factura                     |
| GET    | `/api/v1/me`            | Plan y uso de recordatorios          |

> Si tu backend usa otros nombres de campos (p. ej. `client_name`, `due_date`, `amount`),
> `lib/format.js` ya normaliza las variantes más comunes. Ajusta `normalizeFactura` si es necesario.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — build de producción
- `npm start` — servir el build
