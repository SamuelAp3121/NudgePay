# ToquePay — Frontend

ToquePay es el panel SaaS de cobros: facturas y cuotas, recordatorios automáticos por email,
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

## Panel de administración (soporte)

Las cuentas con `usuarios.rol = 'admin'` ven un ítem **Administración** en el menú lateral
y acceden a `/admin`. El resto de usuarios no ve el enlace y, si entra por URL, es
redirigido a `/dashboard`.

### Activación (una sola vez)

1. Ejecuta la migración de `schema.sql` (añade `rol`, `suspendido`, `suspendido_motivo`,
   `ultimo_acceso` y la tabla `admin_auditoria`). Es idempotente.
2. Promueve tu cuenta desde la carpeta del backend:

   ```bash
   go run ./cmd/crear_admin tu@email.com
   # o, si la cuenta aún no existe:
   go run ./cmd/crear_admin tu@email.com -password "TuClave123"
   ```

   También sirve el SQL directo:

   ```sql
   UPDATE usuarios SET rol = 'admin' WHERE lower(email) = 'tu@email.com';
   ```

3. Reinicia el backend y vuelve a iniciar sesión (el rol se lee en cada petición).

### Qué puede hacer un administrador

| Sección | Acciones |
| ------- | -------- |
| Resumen | Métricas globales, estado de BD/email/pasarela, últimos registros |
| Usuarios | Buscar y filtrar, ver ficha completa, cambiar plan, suspender/reactivar, dar o quitar rol admin, restablecer contraseña, cerrar sesiones, entrar como usuario |
| Facturas | Ver todas las facturas, cuotas por factura, marcar cuota o factura como pagada, revertir una cuota, eliminar factura |
| Pagos | Historial de transacciones de la pasarela con cliente y cuenta |
| Suscripciones | Conciliar una orden pendiente (activa Pro 1 mes) o cancelar el plan |

Todas las acciones sensibles quedan registradas en `admin_auditoria` (quién, qué, cuándo).

### Impersonación

"Entrar como usuario" abre una sesión de ese usuario y guarda la del admin en la cookie
`ir_admin_session`. Mientras dura, aparece un aviso fijo con el botón
**Volver a administración**, que restaura la sesión original.

### Endpoints nuevos

Todos bajo `/api/v1/admin` y protegidos por `AuthMiddleware` + `AdminMiddleware`:

```
GET    /resumen
GET    /sistema
GET    /auditoria
GET    /usuarios                     ?q=&plan=&rol=&suspendido=&page=&limit=
GET    /usuarios/:id
PATCH  /usuarios/:id/plan            { plan, dias }
PATCH  /usuarios/:id/suspender       { suspendido, motivo }
PATCH  /usuarios/:id/rol             { rol }
POST   /usuarios/:id/password        { password_nueva }
POST   /usuarios/:id/cerrar-sesiones
POST   /usuarios/:id/impersonar
POST   /salir-impersonacion
GET    /facturas                     ?q=&estado=&usuario_id=&page=&limit=
GET    /facturas/:id/cuotas
POST   /facturas/:id/cuotas/:numero/pagar
POST   /facturas/:id/cuotas/:numero/revertir
POST   /facturas/:id/pagar
DELETE /facturas/:id
GET    /pagos                        ?q=&estado=&page=&limit=
GET    /suscripciones                ?q=&estado=&page=&limit=
POST   /suscripciones/:referencia/activar
POST   /suscripciones/:referencia/cancelar
```

## Conexión a base de datos (pruebas y producción)

El backend usa un único binario para ambos entornos. La conexión en `config/db.go`
resuelve el SSL automáticamente:

| `DATABASE_URL` | Comportamiento |
| -------------- | -------------- |
| sin `sslmode` | Prueba `require` → `prefer` → `disable` hasta que una funcione |
| `?sslmode=require` | Lo respeta; si el servidor no soporta SSL, reintenta con `prefer`/`disable` (deja un aviso en el log) |
| `?sslmode=verify-full` / `verify-ca` | **Nunca** se degrada: si el certificado no valida, falla |
| `?sslmode=disable` | Conexión sin cifrar |

### Ejemplos

```bash
# PRODUCCIÓN — Supabase (SSL obligatorio)
DATABASE_URL=postgres://postgres.PROYECTO:CLAVE@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require

# PRODUCCIÓN — PostgreSQL propio con certificado
DATABASE_URL=postgres://usuario:clave@db.midominio.com:5432/toquepay?sslmode=verify-full&sslrootcert=certs/ca.pem

# PRUEBAS — PostgreSQL local sin SSL
DATABASE_URL=postgres://postgres:postgres@localhost:5432/toquepay?sslmode=disable

# PRUEBAS — detección automática
DATABASE_URL=postgres://postgres:postgres@localhost:5432/toquepay
```

El log al arrancar indica qué se usó:

```
⚡ Conexión exitosa a PostgreSQL: localhost:5432/toquepay (sslmode=disable)
```

Si el error es de credenciales, host o base de datos inexistente, el proceso se detiene
con una pista accionable en lugar de reintentar SSL.

### Health check

`GET /health` responde `200` con `{"status":"ok","database":"ok"}`, o `503` si la base
de datos no responde. Úsalo como healthcheck del contenedor/plataforma en producción.

### Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores. Las secciones con claves vacías
(`RESEND_API_KEY`, `WOMPI_*`) deshabilitan solo esa función: el resto del panel sigue
operativo.
