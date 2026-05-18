-- ============================================================================
-- BOLSO — schema_review.sql  (substitui o schema RECORRENTE)
-- ============================================================================
-- GATE BLOQUEANTE: este arquivo aguarda aprovação humana explícita.
-- Após aprovado, vira migration Drizzle + script de reset do DB no Coolify
-- (drop schema public CASCADE; recreate; aplica esta migration limpa).
--
-- Cobertura (18 tabelas, espelha §"Entidades principais" do prompt + extras):
--   AUTH                : users, tenants, user_tenants
--   CONFIG              : business_settings, categories
--   CRM                 : contacts, products
--   VENDAS              : sales, sale_items
--   FINANCEIRO          : receivables, payables, expenses, payments
--   PRODUTIVIDADE       : tasks
--   IA + WHATSAPP       : whatsapp_messages, media_attachments, ai_extractions, ai_actions
--   AUDITORIA           : audit_logs
--
-- Convenções (mantidas):
--   • PK  TEXT com gen_random_uuid()::text
--   • "Enums" como TEXT NOT NULL + CHECK (sem ENUM nativo Postgres)
--   • Timestamps TIMESTAMPTZ
--   • Dinheiro em BIGINT *_cents (evita float)
--   • JSONB com DEFAULT '{}'::jsonb para campos configuráveis
--   • Todo índice multi-tenant começa por tenant_id
--   • CASCADE quando deleção do tenant deve apagar a entidade
--   • SET NULL quando relação é informativa (ex.: sale.contact_id pode virar nulo)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. AUTH & MULTI-TENANT  (3 tabelas)
-- ============================================================================

CREATE TABLE users (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  name              TEXT,
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenants (
  id                          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug                        TEXT NOT NULL UNIQUE,
  name                        TEXT NOT NULL,
  business_type               TEXT NOT NULL,
    -- delivery | alimentacao | barbearia | beleza | estetica | loja | servico | outro
  owner_user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  zapi_instance_id            TEXT,
  zapi_instance_token         TEXT,
  zapi_client_token           TEXT,
  timezone                    TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status                      TEXT NOT NULL DEFAULT 'setup'
                                  CHECK (status IN ('active','paused','cancelled','setup')),
  lgpd_data_controller_email  TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_tenants_zapi_instance_id
  ON tenants(zapi_instance_id) WHERE zapi_instance_id IS NOT NULL;

CREATE TABLE user_tenants (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'owner'
                  CHECK (role IN ('owner','manager','operator')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- ex.: {"view_revenue":true,"view_profit":false,"view_expenses":true}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX idx_user_tenants_tenant_id ON user_tenants(tenant_id);

-- ============================================================================
-- 2. CONFIG & CATEGORIAS  (2 tabelas)
-- ============================================================================

CREATE TABLE business_settings (
  id                                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                           TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  -- Identidade da IA
  ai_persona_name                     TEXT NOT NULL DEFAULT 'Assistente',
  ai_tone                             TEXT NOT NULL DEFAULT 'amigavel'
                                          CHECK (ai_tone IN ('amigavel','profissional','descolado')),
  -- Regras de confirmação (§"REGRAS DE CONFIRMAÇÃO")
  ai_auto_confirm_below_cents         BIGINT NOT NULL DEFAULT 5000,
  ai_always_confirm_above_cents       BIGINT NOT NULL DEFAULT 50000,
  ai_always_confirm_new_customer      BOOLEAN NOT NULL DEFAULT TRUE,
  ai_always_confirm_receipt_image     BOOLEAN NOT NULL DEFAULT TRUE,
  ai_allow_audio_auto_create          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Vocabulário do negócio (gírias, abreviações)
  ai_custom_vocabulary                JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Negócio
  business_hours                      JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_summary_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  daily_summary_at_hour               INTEGER NOT NULL DEFAULT 20
                                          CHECK (daily_summary_at_hour BETWEEN 0 AND 23),
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('income','expense')),
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_categories_tenant_kind_name ON categories(tenant_id, kind, name);

-- ============================================================================
-- 3. CRM  (2 tabelas)
-- ============================================================================

CREATE TABLE contacts (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone                   TEXT NOT NULL,
  name                    TEXT,
  email                   TEXT,
  address                 TEXT,
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  origin                  TEXT,
    -- whatsapp | manual | indicacao | rua | instagram | outro
  notes                   TEXT,
  total_spent_cents       BIGINT NOT NULL DEFAULT 0,
  total_due_cents         BIGINT NOT NULL DEFAULT 0,
  last_purchase_at        TIMESTAMPTZ,
  first_contact_at        TIMESTAMPTZ,
  lgpd_consent_at         TIMESTAMPTZ,
  lgpd_opted_out_at       TIMESTAMPTZ,
  custom_attributes       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contacts_phone_e164 CHECK (phone ~ '^\+[1-9]\d{6,14}$')
);
CREATE UNIQUE INDEX idx_contacts_tenant_phone ON contacts(tenant_id, phone);
CREATE INDEX idx_contacts_tenant_last_purchase
  ON contacts(tenant_id, last_purchase_at DESC NULLS LAST);

CREATE TABLE products (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'product'
                          CHECK (type IN ('product','service')),
  default_price_cents BIGINT NOT NULL DEFAULT 0,
  cost_price_cents    BIGINT,
  category_id         TEXT REFERENCES categories(id) ON DELETE SET NULL,
  -- Apelidos pra IA reconhecer fala/escrita do dono.
  -- Ex.: {"quentinha","marmitex"} para "Marmita tradicional".
  aliases             TEXT[] NOT NULL DEFAULT '{}',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active, sort_order);

-- ============================================================================
-- 4. VENDAS  (2 tabelas)
-- ============================================================================

CREATE TABLE sales (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id            TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  total_amount_cents    BIGINT NOT NULL DEFAULT 0,
  discount_cents        BIGINT NOT NULL DEFAULT 0,
  paid_amount_cents     BIGINT NOT NULL DEFAULT 0,
  pending_amount_cents  BIGINT NOT NULL DEFAULT 0,
  payment_method        TEXT,
    -- pix | cash | card_credit | card_debit | transfer | boleto | other
  payment_status        TEXT NOT NULL DEFAULT 'pending'
                            CHECK (payment_status IN ('pending','partial','paid','cancelled')),
  sale_status           TEXT NOT NULL DEFAULT 'registered'
                            CHECK (sale_status IN ('registered','awaiting_payment','partially_paid','paid','cancelled')),
  source                TEXT NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('whatsapp','manual','import','system')),
  sale_date             TIMESTAMPTZ NOT NULL,
  due_date              TIMESTAMPTZ,
  notes                 TEXT,
  source_message_id     TEXT,
  attachment_id         TEXT,
  cancelled_at          TIMESTAMPTZ,
  cancelled_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sales_tenant_date            ON sales(tenant_id, sale_date DESC);
CREATE INDEX idx_sales_tenant_contact         ON sales(tenant_id, contact_id);
CREATE INDEX idx_sales_tenant_payment_status  ON sales(tenant_id, payment_status);
CREATE INDEX idx_sales_tenant_source          ON sales(tenant_id, source);

CREATE TABLE sale_items (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id             TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id          TEXT REFERENCES products(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  quantity            NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price_cents    BIGINT NOT NULL DEFAULT 0,
  total_price_cents   BIGINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sale_items_tenant_sale ON sale_items(tenant_id, sale_id);

-- ============================================================================
-- 5. FINANCEIRO  (4 tabelas)
-- ============================================================================

CREATE TABLE receivables (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id              TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  sale_id                 TEXT REFERENCES sales(id) ON DELETE SET NULL,
  description             TEXT NOT NULL,
  amount_cents            BIGINT NOT NULL,
  amount_received_cents   BIGINT NOT NULL DEFAULT 0,
  amount_pending_cents    BIGINT NOT NULL DEFAULT 0,
  due_date                TIMESTAMPTZ,
  status                  TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','partial','received','overdue','cancelled')),
  payment_method          TEXT,
  notes                   TEXT,
  source                  TEXT NOT NULL DEFAULT 'manual',
  cancelled_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_receivables_tenant_status_due ON receivables(tenant_id, status, due_date);
CREATE INDEX idx_receivables_tenant_contact    ON receivables(tenant_id, contact_id);

CREATE TABLE payables (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_name           TEXT,
  category_id             TEXT REFERENCES categories(id) ON DELETE SET NULL,
  description             TEXT NOT NULL,
  amount_cents            BIGINT NOT NULL,
  amount_paid_cents       BIGINT NOT NULL DEFAULT 0,
  due_date                TIMESTAMPTZ,
  status                  TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','partial','paid','overdue','cancelled')),
  payment_method          TEXT,
  notes                   TEXT,
  source                  TEXT NOT NULL DEFAULT 'manual',
  attachment_id           TEXT,
  cancelled_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payables_tenant_status_due ON payables(tenant_id, status, due_date);

CREATE TABLE expenses (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_name   TEXT,
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,
  amount_cents    BIGINT NOT NULL,
  expense_date    TIMESTAMPTZ NOT NULL,
  payment_method  TEXT,
  status          TEXT NOT NULL DEFAULT 'paid'
                      CHECK (status IN ('paid','cancelled')),
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',
  attachment_id   TEXT,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_expenses_tenant_date      ON expenses(tenant_id, expense_date DESC);
CREATE INDEX idx_expenses_tenant_category  ON expenses(tenant_id, category_id);

CREATE TABLE payments (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount_cents    BIGINT NOT NULL,
  payment_method  TEXT,
  paid_at         TIMESTAMPTZ NOT NULL,
  sale_id         TEXT REFERENCES sales(id) ON DELETE SET NULL,
  receivable_id   TEXT REFERENCES receivables(id) ON DELETE SET NULL,
  payable_id      TEXT REFERENCES payables(id) ON DELETE SET NULL,
  expense_id      TEXT REFERENCES expenses(id) ON DELETE SET NULL,
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_tenant_paid_at ON payments(tenant_id, paid_at DESC);

-- ============================================================================
-- 6. PRODUTIVIDADE  (1 tabela)
-- ============================================================================

CREATE TABLE tasks (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id          TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  due_at              TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','done','cancelled')),
  task_type           TEXT,
    -- collect_payment | deliver | callback | confirm_payment | pay_supplier | prepare | service | other
  source              TEXT NOT NULL DEFAULT 'manual',
  source_message_id   TEXT,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_tenant_status_due ON tasks(tenant_id, status, due_at);

-- ============================================================================
-- 7. WHATSAPP + IA  (4 tabelas)
-- ============================================================================

CREATE TABLE whatsapp_messages (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id               TEXT REFERENCES users(id) ON DELETE SET NULL,
  contact_id            TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  direction             TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number           TEXT NOT NULL,
  to_number             TEXT,
  message_type          TEXT NOT NULL
                            CHECK (message_type IN ('text','audio','image','document','video','sticker','unknown')),
  raw_content           TEXT,
  transcription         TEXT,
  media_url             TEXT,
  zapi_message_id       TEXT,
  whatsapp_status       TEXT
                            CHECK (whatsapp_status IS NULL OR whatsapp_status IN
                              ('queued','sent','delivered','read','failed','received')),
  processing_status     TEXT NOT NULL DEFAULT 'received'
                            CHECK (processing_status IN
                              ('received','processing','interpreted','launched',
                               'pending_confirmation','error','ignored','responded')),
  ai_response           TEXT,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_whatsapp_messages_zapi_id
  ON whatsapp_messages(zapi_message_id) WHERE zapi_message_id IS NOT NULL;
CREATE INDEX idx_whatsapp_messages_tenant_received
  ON whatsapp_messages(tenant_id, received_at DESC);
CREATE INDEX idx_whatsapp_messages_tenant_status
  ON whatsapp_messages(tenant_id, processing_status);
CREATE INDEX idx_whatsapp_messages_tenant_contact
  ON whatsapp_messages(tenant_id, contact_id, received_at DESC);

CREATE TABLE media_attachments (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_message_id   TEXT REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('audio','image','document','receipt','other')),
  storage_url         TEXT NOT NULL,
  mime_type           TEXT,
  size_bytes          BIGINT,
  meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_media_attachments_tenant ON media_attachments(tenant_id);

CREATE TABLE ai_extractions (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id              TEXT REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  intent                  TEXT NOT NULL,
    -- register_sale | register_expense | register_payable | register_receivable |
    -- create_contact | update_contact | create_task | query_revenue_today |
    -- query_overdue | query_expenses | register_payment_received | register_payment_made |
    -- correct_last | cancel_last | add_note | ask_summary | other | unknown
  confidence              NUMERIC(4,3) NOT NULL DEFAULT 0
                              CHECK (confidence >= 0 AND confidence <= 1),
  extracted_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  needs_confirmation      BOOLEAN NOT NULL DEFAULT TRUE,
  status                  TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','confirmed','executed','rejected','expired','error')),
  source_type             TEXT NOT NULL CHECK (source_type IN ('text','audio','image')),
  llm_model               TEXT,
  llm_prompt              JSONB,
  llm_raw_response        JSONB,
  reviewed_by_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_extractions_tenant_status  ON ai_extractions(tenant_id, status, created_at DESC);
CREATE INDEX idx_ai_extractions_tenant_intent  ON ai_extractions(tenant_id, intent);

CREATE TABLE ai_actions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  extraction_id   TEXT NOT NULL REFERENCES ai_extractions(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,
    -- create_sale | create_sale_item | create_receivable | create_payable |
    -- create_expense | record_payment | create_contact | update_contact |
    -- create_task | cancel_sale | answer_query
  entity_type     TEXT,
    -- sale | receivable | payable | expense | contact | task | payment
  entity_id       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','succeeded','failed','rolled_back')),
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  result          JSONB,
  error_message   TEXT,
  executed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_actions_tenant_extraction ON ai_actions(tenant_id, extraction_id);
CREATE INDEX idx_ai_actions_tenant_status     ON ai_actions(tenant_id, status);

-- ============================================================================
-- 8. AUDITORIA  (1 tabela)
-- ============================================================================

CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('user','ai','system')),
  action        TEXT NOT NULL,  -- create | update | delete | cancel | execute
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  old_value     JSONB,
  new_value     JSONB,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_tenant_entity  ON audit_logs(tenant_id, entity_type, entity_id);

-- ============================================================================
-- FIM. 18 tabelas. Aguarda aprovação humana.
-- ============================================================================
