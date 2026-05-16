-- ============================================================================
-- RECORRENTE — schema_review.sql
-- ============================================================================
-- ESTE ARQUIVO É O GATE DA SEÇÃO 3.3 DO PROMPT FUNDACIONAL.
-- ELE NÃO FOI APLICADO. AGUARDA APROVAÇÃO HUMANA EXPLÍCITA.
--
-- Cobertura:
--   • Todas as tabelas da seção 5 do prompt fundacional.
--   • Extras (justificados abaixo): users, user_tenants, agent_decisions.
--
-- Convenções:
--   • PK: TEXT (UUID v4 gerado pelo Postgres) — `gen_random_uuid()::text`.
--   • Timestamps: TIMESTAMPTZ.
--   • "Enums": TEXT NOT NULL + CHECK constraint (Drizzle-friendly,
--     fácil de evoluir, evita migration de tipo Postgres).
--   • JSONB com DEFAULT '{}'::jsonb para colunas configuráveis.
--   • Todo índice multi-tenant lidera por `tenant_id`.
--
-- Pré-requisito de banco:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- para gen_random_uuid()
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. AUTH MÍNIMA (extra — justificativa abaixo)
-- ----------------------------------------------------------------------------
-- Justificativa: o entregável 8 do prompt exige "signup → criar tenant →
-- conectar Z-API". Sem `users` não há a quem associar `tenants.owner_user_id`.
-- Mantenho enxuto: campos suficientes para auth por email+senha. Multi-usuário
-- por tenant fica para prompt subsequente conforme seção 12.

CREATE TABLE users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT,
  email_verified_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 1. TENANTS — seção 4.2 do prompt
-- ----------------------------------------------------------------------------
CREATE TABLE tenants (
  id                          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug                        TEXT NOT NULL UNIQUE,
  business_name               TEXT NOT NULL,
  business_type               TEXT NOT NULL,
  owner_user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  zapi_instance_id            TEXT,
  zapi_instance_token         TEXT,
  zapi_client_token           TEXT,
  timezone                    TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  plan_id                     TEXT,
  status                      TEXT NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','paused','cancelled','setup')),
  lgpd_data_controller_email  TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_tenants_zapi_instance_id
  ON tenants(zapi_instance_id) WHERE zapi_instance_id IS NOT NULL;
CREATE INDEX idx_tenants_owner_user_id ON tenants(owner_user_id);

-- ----------------------------------------------------------------------------
-- 0b. user_tenants — vínculo many-to-many (extra, mínimo)
-- ----------------------------------------------------------------------------
-- Justificativa: já hoje precisamos suportar "este usuário tem acesso a este
-- tenant" para o getTenantId(ctx) validar permissão. Mantenho com role text
-- para evoluir sem migration de enum.

CREATE TABLE user_tenants (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'owner'
                  CHECK (role IN ('owner','admin','operator')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX idx_user_tenants_tenant_id ON user_tenants(tenant_id);

-- ----------------------------------------------------------------------------
-- 2. CUSTOMERS — seção 5.1
-- ----------------------------------------------------------------------------
CREATE TABLE customers (
  id                              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone                           TEXT NOT NULL,  -- E.164 ex: +5511999990000
  name                            TEXT,
  email                           TEXT,
  first_contact_at                TIMESTAMPTZ,
  last_visit_at                   TIMESTAMPTZ,
  lgpd_consent_at                 TIMESTAMPTZ,
  lgpd_opted_out_at               TIMESTAMPTZ,
  referral_source_customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  total_visits                    INTEGER NOT NULL DEFAULT 0,
  total_revenue_cents             BIGINT NOT NULL DEFAULT 0,
  notes                           TEXT,
  custom_attributes               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT customers_phone_e164 CHECK (phone ~ '^\+[1-9]\d{6,14}$')
);

CREATE UNIQUE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX idx_customers_tenant_last_visit ON customers(tenant_id, last_visit_at);
CREATE INDEX idx_customers_referral_source ON customers(referral_source_customer_id)
  WHERE referral_source_customer_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. SERVICE_CATALOG — seção 5.2
-- ----------------------------------------------------------------------------
CREATE TABLE service_catalog (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  price_cents         BIGINT NOT NULL DEFAULT 0,
  duration_minutes    INTEGER NOT NULL DEFAULT 30,
  recurrence_days     INTEGER NOT NULL DEFAULT 30,
  recovery_after_days INTEGER NOT NULL DEFAULT 45,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT service_recovery_after_recurrence
    CHECK (recovery_after_days >= recurrence_days)
);

CREATE INDEX idx_service_tenant_active ON service_catalog(tenant_id, is_active, sort_order);

-- ----------------------------------------------------------------------------
-- 4. VISITS — seção 5.3
-- ----------------------------------------------------------------------------
CREATE TABLE visits (
  id                          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id                 TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id                  TEXT NOT NULL REFERENCES service_catalog(id) ON DELETE RESTRICT,
  visited_at                  TIMESTAMPTZ NOT NULL,
  revenue_cents               BIGINT NOT NULL DEFAULT 0,
  recorded_via                TEXT NOT NULL
                                  CHECK (recorded_via IN ('agent_auto','owner_manual','inbox_chat')),
  recovered_from_task_id      TEXT,  -- FK adicionada após criar scheduled_actions
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_visits_tenant_customer_visited ON visits(tenant_id, customer_id, visited_at DESC);
CREATE INDEX idx_visits_tenant_visited ON visits(tenant_id, visited_at DESC);

-- ----------------------------------------------------------------------------
-- 5. SCHEDULED_ACTIONS — seção 5.4 (coração do sistema)
-- ----------------------------------------------------------------------------
CREATE TABLE scheduled_actions (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id         TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  action_type         TEXT NOT NULL
                          CHECK (action_type IN
                            ('recurrence_nudge','recovery_attempt','referral_ask','birthday','custom')),
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  scheduled_for       TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN
                            ('pending','sent','replied','converted','failed','cancelled')),
  generated_message   TEXT,
  sent_at             TIMESTAMPTZ,
  replied_at          TIMESTAMPTZ,
  converted_at        TIMESTAMPTZ,
  bull_job_id         TEXT,
  context             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_tenant_status_scheduled
  ON scheduled_actions(tenant_id, status, scheduled_for);
CREATE INDEX idx_actions_tenant_customer_type
  ON scheduled_actions(tenant_id, customer_id, action_type);

-- FK reversa (visits.recovered_from_task_id) agora que scheduled_actions existe
ALTER TABLE visits
  ADD CONSTRAINT visits_recovered_from_task_fk
    FOREIGN KEY (recovered_from_task_id) REFERENCES scheduled_actions(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 6. CONVERSATIONS + MESSAGES — seção 5.5
-- ----------------------------------------------------------------------------
CREATE TABLE conversations (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id             TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','closed')),
  agent_paused_until      TIMESTAMPTZ,
  last_message_at         TIMESTAMPTZ,
  last_human_message_at   TIMESTAMPTZ,
  unread_count            INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_conversations_tenant_customer
  ON conversations(tenant_id, customer_id);
CREATE INDEX idx_conversations_tenant_open_lastmsg
  ON conversations(tenant_id, status, last_message_at DESC);

CREATE TABLE messages (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id     TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction           TEXT NOT NULL
                          CHECK (direction IN ('inbound','outbound')),
  sender              TEXT NOT NULL
                          CHECK (sender IN ('customer','agent','owner','system')),
  content             TEXT NOT NULL,
  media_url           TEXT,
  zapi_message_id     TEXT,
  whatsapp_status     TEXT
                          CHECK (whatsapp_status IS NULL OR
                            whatsapp_status IN ('queued','sent','delivered','read','failed')),
  related_action_id   TEXT REFERENCES scheduled_actions(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_tenant_conv_created
  ON messages(tenant_id, conversation_id, created_at);
CREATE UNIQUE INDEX idx_messages_zapi_message_id
  ON messages(zapi_message_id) WHERE zapi_message_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. REFERRALS — seção 5.6
-- ----------------------------------------------------------------------------
CREATE TABLE referrals (
  id                          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referrer_customer_id        TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referred_customer_id        TEXT REFERENCES customers(id) ON DELETE SET NULL,
  referred_phone              TEXT NOT NULL,
  referred_name               TEXT,
  status                      TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN
                                    ('pending','contacted','visited','rewarded','lost')),
  reward_config_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_granted_at           TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referrals_phone_e164 CHECK (referred_phone ~ '^\+[1-9]\d{6,14}$')
);

CREATE INDEX idx_referrals_tenant_status ON referrals(tenant_id, status);
CREATE INDEX idx_referrals_tenant_referrer ON referrals(tenant_id, referrer_customer_id);
CREATE UNIQUE INDEX idx_referrals_tenant_pending_phone
  ON referrals(tenant_id, referred_phone)
  WHERE status IN ('pending','contacted');

-- ----------------------------------------------------------------------------
-- 8. TENANT_SETTINGS — seção 5.7
-- ----------------------------------------------------------------------------
CREATE TABLE tenant_settings (
  id                                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                           TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  agent_persona_name                  TEXT NOT NULL DEFAULT 'Assistente',
  agent_tone                          TEXT NOT NULL DEFAULT 'amigavel'
                                          CHECK (agent_tone IN ('amigavel','profissional','descolado')),
  business_hours                      JSONB NOT NULL DEFAULT '{}'::jsonb,
  recovery_message_template           TEXT,
  referral_reward_text                TEXT,
  referral_enabled                    BOOLEAN NOT NULL DEFAULT TRUE,
  auto_pause_on_human_reply_hours     INTEGER NOT NULL DEFAULT 6,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 9. AGENT_DECISIONS — seção 7.4 (extra, mas exigida pelo prompt)
-- ----------------------------------------------------------------------------
-- Justificativa: a seção 7.4 fala literalmente "tabela a criar". Cobre o
-- requisito de auditoria das decisões do agente. Retenção 90d via job de purge.

CREATE TABLE agent_decisions (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id         TEXT REFERENCES customers(id) ON DELETE SET NULL,
  conversation_id     TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  related_action_id   TEXT REFERENCES scheduled_actions(id) ON DELETE SET NULL,
  decision            TEXT NOT NULL
                          CHECK (decision IN ('sent','not_sent','paused','escalated')),
  reason              TEXT NOT NULL,
  llm_model           TEXT,
  prompt_input        JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_response        JSONB,
  context             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_decisions_tenant_created
  ON agent_decisions(tenant_id, created_at DESC);
CREATE INDEX idx_agent_decisions_tenant_customer
  ON agent_decisions(tenant_id, customer_id, created_at DESC);

-- ============================================================================
-- FIM DO SCHEMA — gate aguardando aprovação humana antes de virar migration.
-- ============================================================================
