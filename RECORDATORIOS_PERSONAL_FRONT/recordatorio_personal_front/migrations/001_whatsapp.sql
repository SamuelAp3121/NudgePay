-- ============================================================================
--  ToquePay — Migración: recordatorios por WhatsApp
--
--  Aplica SOLO los cambios nuevos sobre una base que ya existe.
--  Es idempotente: puedes ejecutarlo varias veces sin efectos secundarios.
--
--  Uso:
--    psql "$DATABASE_URL" -f migrations/001_whatsapp.sql
--  o pega el contenido en el SQL Editor de Supabase.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. FACTURAS: teléfono del cliente y canal de recordatorio
--    canal_recordatorio: email | whatsapp | ambos
-- ----------------------------------------------------------------------------
ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS cliente_telefono TEXT;

ALTER TABLE facturas
ADD COLUMN IF NOT EXISTS canal_recordatorio TEXT NOT NULL DEFAULT 'email';

-- ----------------------------------------------------------------------------
-- 2. USUARIOS: credenciales propias de WhatsApp (opcional)
--    Si están vacías se usan las del .env del backend.
-- ----------------------------------------------------------------------------
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS whatsapp_telefono TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS whatsapp_token TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS whatsapp_template_name TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS whatsapp_template_lang TEXT;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS whatsapp_activo BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- 3. RECORDATORIOS ENVIADOS: canal, estado y error
--    canal: email | whatsapp
--    estado: enviado | fallido
-- ----------------------------------------------------------------------------
ALTER TABLE recordatorios_enviados
ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'email';

ALTER TABLE recordatorios_enviados
ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'enviado';

ALTER TABLE recordatorios_enviados
ADD COLUMN IF NOT EXISTS error TEXT;

-- ----------------------------------------------------------------------------
-- 4. ÍNDICES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_recordatorios_canal
ON recordatorios_enviados (canal, enviado_en DESC);

CREATE INDEX IF NOT EXISTS idx_facturas_canal
ON facturas (canal_recordatorio);

COMMIT;

-- ============================================================================
-- COMPROBACIÓN
-- ============================================================================
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'facturas'
--    AND column_name IN ('cliente_telefono', 'canal_recordatorio');
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'usuarios' AND column_name LIKE 'whatsapp%';
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'recordatorios_enviados';
