CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"slug" text NOT NULL,
	"business_name" text NOT NULL,
	"business_type" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"zapi_instance_id" text,
	"zapi_instance_token" text,
	"zapi_client_token" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"plan_id" text,
	"status" text DEFAULT 'setup' NOT NULL,
	"lgpd_data_controller_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_status_check" CHECK ("tenants"."status" IN ('active','paused','cancelled','setup'))
);
--> statement-breakpoint
CREATE TABLE "user_tenants" (
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tenants_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id"),
	CONSTRAINT "user_tenants_role_check" CHECK ("user_tenants"."role" IN ('owner','admin','operator'))
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_persona_name" text DEFAULT 'Assistente' NOT NULL,
	"agent_tone" text DEFAULT 'amigavel' NOT NULL,
	"business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recovery_message_template" text,
	"referral_reward_text" text,
	"referral_enabled" boolean DEFAULT true NOT NULL,
	"auto_pause_on_human_reply_hours" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "tenant_settings_tone_check" CHECK ("tenant_settings"."agent_tone" IN ('amigavel','profissional','descolado'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"email" text,
	"first_contact_at" timestamp with time zone,
	"last_visit_at" timestamp with time zone,
	"lgpd_consent_at" timestamp with time zone,
	"lgpd_opted_out_at" timestamp with time zone,
	"referral_source_customer_id" text,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"total_revenue_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"custom_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_e164" CHECK ("customers"."phone" ~ '^\+[1-9]\d{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "service_catalog" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"recurrence_days" integer DEFAULT 30 NOT NULL,
	"recovery_after_days" integer DEFAULT 45 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_recovery_after_recurrence" CHECK ("service_catalog"."recovery_after_days" >= "service_catalog"."recurrence_days")
);
--> statement-breakpoint
CREATE TABLE "scheduled_actions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"action_type" text NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"generated_message" text,
	"sent_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"bull_job_id" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actions_action_type_check" CHECK ("scheduled_actions"."action_type" IN ('recurrence_nudge','recovery_attempt','referral_ask','birthday','custom')),
	CONSTRAINT "actions_status_check" CHECK ("scheduled_actions"."status" IN ('pending','sent','replied','converted','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"service_id" text NOT NULL,
	"visited_at" timestamp with time zone NOT NULL,
	"revenue_cents" bigint DEFAULT 0 NOT NULL,
	"recorded_via" text NOT NULL,
	"recovered_from_task_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visits_recorded_via_check" CHECK ("visits"."recorded_via" IN ('agent_auto','owner_manual','inbox_chat'))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"agent_paused_until" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"last_human_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_status_check" CHECK ("conversations"."status" IN ('open','closed'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"sender" text NOT NULL,
	"content" text NOT NULL,
	"media_url" text,
	"zapi_message_id" text,
	"whatsapp_status" text,
	"related_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_direction_check" CHECK ("messages"."direction" IN ('inbound','outbound')),
	CONSTRAINT "messages_sender_check" CHECK ("messages"."sender" IN ('customer','agent','owner','system')),
	CONSTRAINT "messages_whatsapp_status_check" CHECK ("messages"."whatsapp_status" IS NULL OR "messages"."whatsapp_status" IN ('queued','sent','delivered','read','failed'))
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"referrer_customer_id" text NOT NULL,
	"referred_customer_id" text,
	"referred_phone" text NOT NULL,
	"referred_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reward_config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reward_granted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_status_check" CHECK ("referrals"."status" IN ('pending','contacted','visited','rewarded','lost')),
	CONSTRAINT "referrals_phone_e164" CHECK ("referrals"."referred_phone" ~ '^\+[1-9]\d{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "agent_decisions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"customer_id" text,
	"conversation_id" text,
	"related_action_id" text,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"llm_model" text,
	"prompt_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"llm_response" jsonb,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_decisions_decision_check" CHECK ("agent_decisions"."decision" IN ('sent','not_sent','paused','escalated'))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_referral_source_customer_id_customers_id_fk" FOREIGN KEY ("referral_source_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_catalog" ADD CONSTRAINT "service_catalog_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD CONSTRAINT "scheduled_actions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_service_id_service_catalog_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service_catalog"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_recovered_from_task_id_scheduled_actions_id_fk" FOREIGN KEY ("recovered_from_task_id") REFERENCES "public"."scheduled_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_related_action_id_scheduled_actions_id_fk" FOREIGN KEY ("related_action_id") REFERENCES "public"."scheduled_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_customer_id_customers_id_fk" FOREIGN KEY ("referrer_customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_customer_id_customers_id_fk" FOREIGN KEY ("referred_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_related_action_id_scheduled_actions_id_fk" FOREIGN KEY ("related_action_id") REFERENCES "public"."scheduled_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_zapi_instance_id" ON "tenants" USING btree ("zapi_instance_id") WHERE "tenants"."zapi_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_tenants_owner_user_id" ON "tenants" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_user_tenants_tenant_id" ON "user_tenants" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_customers_tenant_phone" ON "customers" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant_last_visit" ON "customers" USING btree ("tenant_id","last_visit_at");--> statement-breakpoint
CREATE INDEX "idx_customers_referral_source" ON "customers" USING btree ("referral_source_customer_id") WHERE "customers"."referral_source_customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_service_tenant_active" ON "service_catalog" USING btree ("tenant_id","is_active","sort_order");--> statement-breakpoint
CREATE INDEX "idx_actions_tenant_status_scheduled" ON "scheduled_actions" USING btree ("tenant_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "idx_actions_tenant_customer_type" ON "scheduled_actions" USING btree ("tenant_id","customer_id","action_type");--> statement-breakpoint
CREATE INDEX "idx_visits_tenant_customer_visited" ON "visits" USING btree ("tenant_id","customer_id","visited_at");--> statement-breakpoint
CREATE INDEX "idx_visits_tenant_visited" ON "visits" USING btree ("tenant_id","visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_conversations_tenant_customer" ON "conversations" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_tenant_open_lastmsg" ON "conversations" USING btree ("tenant_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_messages_tenant_conv_created" ON "messages" USING btree ("tenant_id","conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_messages_zapi_message_id" ON "messages" USING btree ("zapi_message_id") WHERE "messages"."zapi_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_referrals_tenant_status" ON "referrals" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_referrals_tenant_referrer" ON "referrals" USING btree ("tenant_id","referrer_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_referrals_tenant_pending_phone" ON "referrals" USING btree ("tenant_id","referred_phone") WHERE "referrals"."status" IN ('pending','contacted');--> statement-breakpoint
CREATE INDEX "idx_agent_decisions_tenant_created" ON "agent_decisions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_decisions_tenant_customer" ON "agent_decisions" USING btree ("tenant_id","customer_id","created_at");