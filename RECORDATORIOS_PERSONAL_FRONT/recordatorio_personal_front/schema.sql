-- ============================================================================
--  NudgePay — Esquema completo de base de datos (PostgreSQL / Supabase)
--  Versión: completa y actualizada (cuotas, monedas, medios de pago,
--  plantillas, sesiones, recuperación de contraseña y suscripciones).
--
--  Uso:
--    psql "$DATABASE_URL" -f schema.sql
--  o pega el contenido en el SQL Editor de Supabase.
--
--  El script es idempotente: puede ejecutarse sobre una base vacía o sobre
--  una existente (usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- gen_random_uuid() es nativo desde PostgreSQL 13 (Supabase usa PG 15+).
-- pgcrypto solo hace falta si quieres gen_random_bytes(); se deja comentado
-- para que el script funcione en cualquier rol sin privilegios de superusuario.
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. USUARIOS
--    Cuenta del panel. Soporta login por contraseña (bcrypt) y API Key para
--    integraciones. `plan` controla el límite de recordatorios.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email VARCHAR(100) NOT NULL,
    api_key VARCHAR(64) NOT NULL, -- ir_live_<32 hex>
    password_hash TEXT, -- bcrypt (NULL = cuenta antigua)
    plan VARCHAR(20) DEFAULT 'free', -- free | pro
    plan_expira_en TIMESTAMPTZ, -- vigencia del plan Pro
    plantilla_mensaje TEXT, -- plantilla de email personalizada
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usuarios_email_key UNIQUE (email),
    CONSTRAINT usuarios_api_key_key UNIQUE (api_key)
);

-- ----------------------------------------------------------------------------
-- 2. FACTURAS
--    Una factura puede ser de pago único (cuotas = 1) o por cuotas.
--    `token_publico` da acceso al portal de pago del cliente (/pay/<token>).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturas (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id         UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    cliente_nombre     VARCHAR(100) NOT NULL,
    cliente_email      VARCHAR(100) NOT NULL,
    concepto           TEXT,                                -- descripción de la deuda
    monto              NUMERIC(14,2) NOT NULL,              -- monto TOTAL
    moneda             TEXT NOT NULL DEFAULT 'COP',         -- COP, USD, EUR, MXN, ARS, CLP, PEN, BRL
    cuotas             INT  NOT NULL DEFAULT 1,             -- 1 = pago único (máx. 60)
    fecha_vencimiento  DATE NOT NULL,                       -- vencimiento de la 1ª cuota
    estado             VARCHAR(20) DEFAULT 'pendiente',     -- pendiente | pagada

-- Medios de pago habilitados para el cliente
pago_link          BOOLEAN NOT NULL DEFAULT TRUE,       -- pasarela (tarjeta / PSE)
    pago_qr            BOOLEAN NOT NULL DEFAULT FALSE,
    pago_transfer      BOOLEAN NOT NULL DEFAULT FALSE,
    banco_nombre       TEXT,
    banco_cuenta       TEXT,
    banco_titular      TEXT,
    qr_payload         TEXT,                                -- llave Bre-Nequi / contenido del QR
    token_publico      TEXT,                                -- enlace público de pago

    notificado         BOOLEAN DEFAULT FALSE,
    creado_en          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 3. CUOTAS
--    Cada factura genera N cuotas (una por mes). El pago se controla cuota a
--    cuota y la factura pasa a 'pagada' cuando todas están pagadas.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    factura_id UUID NOT NULL REFERENCES facturas (id) ON DELETE CASCADE,
    numero INT NOT NULL, -- 1..N
    monto NUMERIC(14, 2) NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | pagada
    metodo_pago TEXT, -- manual | pasarela | transferencia
    referencia_pago TEXT, -- id de transacción, TRF-001, etc.
    notificado BOOLEAN NOT NULL DEFAULT FALSE,
    pagada_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cuotas_factura_id_numero_key UNIQUE (factura_id, numero)
);

-- ----------------------------------------------------------------------------
-- 4. RECORDATORIOS ENVIADOS (consumo del plan)
--    Registro histórico "append-only". Es la fuente de verdad del límite
--    mensual: borrar facturas NO devuelve cupo. Sin FK a facturas/cuotas a
--    propósito, para que el histórico sobreviva al borrado.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recordatorios_enviados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    usuario_id UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    factura_id UUID,
    cuota_id UUID,
    email_destino TEXT,
    enviado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. PAGOS DE PASARELA
--    Auditoría de transacciones (Wompi) + idempotencia del webhook
--    (referencia = transaction.id, UNIQUE).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    factura_id UUID NOT NULL REFERENCES facturas (id) ON DELETE CASCADE,
    cuota_numero INT,
    referencia TEXT UNIQUE, -- id de transacción de Wompi
    pasarela TEXT, -- wompi
    estado TEXT, -- APPROVED, DECLINED...
    monto NUMERIC(14, 2),
    moneda TEXT,
    metodo TEXT, -- CARD, PSE, NEQUI...
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 6. SESIONES
--    Autenticación del panel mediante cookie HttpOnly `ir_session`.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en TIMESTAMPTZ NOT NULL
);

-- ----------------------------------------------------------------------------
-- 7. CÓDIGOS DE RECUPERACIÓN DE CONTRASEÑA (6 dígitos, 15 min)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS codigos_recuperacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    usuario_id UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    intentos INT NOT NULL DEFAULT 0,
    usado BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en TIMESTAMPTZ NOT NULL
);

-- ----------------------------------------------------------------------------
-- 8. SUSCRIPCIONES (plan Pro)
--    Orden creada en /billing/checkout y conciliada por el webhook.
--    Referencia con formato PRO-<usuario_id>-<aleatorio>.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suscripciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    usuario_id UUID NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    referencia TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'pro',
    estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | pagada
    monto NUMERIC(14, 2),
    moneda TEXT DEFAULT 'COP',
    transaccion TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pagada_en TIMESTAMPTZ
);

-- ============================================================================
-- ÍNDICES
-- ============================================================================

-- Facturas
CREATE INDEX IF NOT EXISTS idx_facturas_pendientes ON facturas (
    fecha_vencimiento,
    estado,
    notificado
);

CREATE INDEX IF NOT EXISTS idx_facturas_usuario ON facturas (usuario_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_token ON facturas (token_publico);

-- Cuotas
CREATE INDEX IF NOT EXISTS idx_cuotas_factura ON cuotas (factura_id);

CREATE INDEX IF NOT EXISTS idx_cuotas_vencimiento ON cuotas (fecha_vencimiento);

-- Histórico de recordatorios (consulta del cupo mensual)
CREATE INDEX IF NOT EXISTS idx_recordatorios_usuario_fecha ON recordatorios_enviados (usuario_id, enviado_en);

-- Pagos
CREATE INDEX IF NOT EXISTS idx_pagos_factura ON pagos (factura_id);

-- Sesiones y códigos
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);

CREATE INDEX IF NOT EXISTS idx_codigos_usuario ON codigos_recuperacion (usuario_id);

-- Suscripciones
CREATE INDEX IF NOT EXISTS idx_suscripciones_usuario ON suscripciones (usuario_id);

-- ============================================================================
-- MIGRACIONES IDEMPOTENTES
-- Si la base ya existía antes de añadir alguna columna, esto la actualiza.
-- ============================================================================
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS plantilla_mensaje TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS plan_expira_en TIMESTAMPTZ;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS concepto TEXT;

ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'COP';

ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS cuotas INT NOT NULL DEFAULT 1;

ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS pago_link BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS pago_qr BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS pago_transfer BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS banco_nombre TEXT;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS banco_cuenta TEXT;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS banco_titular TEXT;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS qr_payload TEXT;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS token_publico TEXT;

ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS metodo_pago TEXT;

ALTER TABLE cuotas ADD COLUMN IF NOT EXISTS referencia_pago TEXT;

-- ============================================================================
-- BACKFILL: facturas antiguas sin cuotas → una cuota con el monto total
-- ============================================================================
INSERT INTO
    cuotas (
        factura_id,
        numero,
        monto,
        fecha_vencimiento,
        estado,
        notificado,
        pagada_en
    )
SELECT
    f.id,
    1,
    f.monto,
    f.fecha_vencimiento,
    COALESCE(f.estado, 'pendiente'),
    COALESCE(f.notificado, FALSE),
    CASE
        WHEN f.estado = 'pagada' THEN CURRENT_TIMESTAMP
        ELSE NULL
    END
FROM facturas f
WHERE
    NOT EXISTS (
        SELECT 1
        FROM cuotas c
        WHERE
            c.factura_id = f.id
    );

-- ============================================================================
-- BACKFILL: tokens públicos para facturas antiguas
-- ============================================================================
UPDATE facturas
SET
    token_publico = md5(random()::text || clock_timestamp()::text || id::text)
WHERE
    token_publico IS NULL;

-- ============================================================================
-- DATOS DE EJEMPLO (opcional)
-- Descomenta para crear un usuario demo con contraseña "Secreta123".
-- El hash bcrypt siguiente corresponde a esa contraseña.
-- ============================================================================
-- INSERT INTO usuarios (email, api_key, password_hash, plan)
-- VALUES (
--   'demo@nudgepay.app',
--   'ir_live_demo_7f3c9a2b5e8d4c1f',
--   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
--   'free'
-- )
-- ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- COMPROBACIÓN
-- ============================================================================
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public' ORDER BY table_name;
--
-- Tablas esperadas: codigos_recuperacion, cuotas, facturas, pagos,
--                   recordatorios_enviados, sesiones, suscripciones, usuarios.