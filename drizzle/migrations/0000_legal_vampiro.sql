CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
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
	"name" text NOT NULL,
	"business_type" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"zapi_instance_id" text,
	"zapi_instance_token" text,
	"zapi_client_token" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
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
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tenants_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id"),
	CONSTRAINT "user_tenants_role_check" CHECK ("user_tenants"."role" IN ('owner','manager','operator'))
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"ai_persona_name" text DEFAULT 'Assistente' NOT NULL,
	"ai_tone" text DEFAULT 'amigavel' NOT NULL,
	"ai_auto_confirm_below_cents" bigint DEFAULT 5000 NOT NULL,
	"ai_always_confirm_above_cents" bigint DEFAULT 50000 NOT NULL,
	"ai_always_confirm_new_customer" boolean DEFAULT true NOT NULL,
	"ai_always_confirm_receipt_image" boolean DEFAULT true NOT NULL,
	"ai_allow_audio_auto_create" boolean DEFAULT false NOT NULL,
	"ai_custom_vocabulary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_summary_enabled" boolean DEFAULT true NOT NULL,
	"daily_summary_at_hour" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_settings_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "business_settings_tone_check" CHECK ("business_settings"."ai_tone" IN ('amigavel','profissional','descolado')),
	CONSTRAINT "business_settings_hour_check" CHECK ("business_settings"."daily_summary_at_hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" IN ('income','expense'))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"email" text,
	"address" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"origin" text,
	"notes" text,
	"total_spent_cents" bigint DEFAULT 0 NOT NULL,
	"total_due_cents" bigint DEFAULT 0 NOT NULL,
	"last_purchase_at" timestamp with time zone,
	"first_contact_at" timestamp with time zone,
	"lgpd_consent_at" timestamp with time zone,
	"lgpd_opted_out_at" timestamp with time zone,
	"custom_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_phone_e164" CHECK ("contacts"."phone" ~ '^\+[1-9]\d{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'product' NOT NULL,
	"default_price_cents" bigint DEFAULT 0 NOT NULL,
	"cost_price_cents" bigint,
	"category_id" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_type_check" CHECK ("products"."type" IN ('product','service'))
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"product_id" text,
	"description" text NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"unit_price_cents" bigint DEFAULT 0 NOT NULL,
	"total_price_cents" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_id" text,
	"total_amount_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"paid_amount_cents" bigint DEFAULT 0 NOT NULL,
	"pending_amount_cents" bigint DEFAULT 0 NOT NULL,
	"payment_method" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"sale_status" text DEFAULT 'registered' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"sale_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"source_message_id" text,
	"attachment_id" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_payment_status_check" CHECK ("sales"."payment_status" IN ('pending','partial','paid','cancelled')),
	CONSTRAINT "sales_sale_status_check" CHECK ("sales"."sale_status" IN ('registered','awaiting_payment','partially_paid','paid','cancelled')),
	CONSTRAINT "sales_source_check" CHECK ("sales"."source" IN ('whatsapp','manual','import','system'))
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"supplier_name" text,
	"category_id" text,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"payment_method" text,
	"status" text DEFAULT 'paid' NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"attachment_id" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_status_check" CHECK ("expenses"."status" IN ('paid','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"supplier_name" text,
	"category_id" text,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"amount_paid_cents" bigint DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"payment_method" text,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"attachment_id" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payables_status_check" CHECK ("payables"."status" IN ('open','partial','paid','overdue','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"direction" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"payment_method" text,
	"paid_at" timestamp with time zone NOT NULL,
	"sale_id" text,
	"receivable_id" text,
	"payable_id" text,
	"expense_id" text,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_direction_check" CHECK ("payments"."direction" IN ('in','out'))
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_id" text,
	"sale_id" text,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"amount_received_cents" bigint DEFAULT 0 NOT NULL,
	"amount_pending_cents" bigint DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"payment_method" text,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivables_status_check" CHECK ("receivables"."status" IN ('open','partial','received','overdue','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"contact_id" text,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"task_type" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_message_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" IN ('open','done','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "media_attachments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"source_message_id" text,
	"kind" text NOT NULL,
	"storage_url" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_attachments_kind_check" CHECK ("media_attachments"."kind" IN ('audio','image','document','receipt','other'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"contact_id" text,
	"direction" text NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text,
	"message_type" text NOT NULL,
	"raw_content" text,
	"transcription" text,
	"media_url" text,
	"zapi_message_id" text,
	"whatsapp_status" text,
	"processing_status" text DEFAULT 'received' NOT NULL,
	"ai_response" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wmsg_direction_check" CHECK ("whatsapp_messages"."direction" IN ('inbound','outbound')),
	CONSTRAINT "wmsg_message_type_check" CHECK ("whatsapp_messages"."message_type" IN ('text','audio','image','document','video','sticker','unknown')),
	CONSTRAINT "wmsg_whatsapp_status_check" CHECK ("whatsapp_messages"."whatsapp_status" IS NULL OR "whatsapp_messages"."whatsapp_status" IN ('queued','sent','delivered','read','failed','received')),
	CONSTRAINT "wmsg_processing_status_check" CHECK ("whatsapp_messages"."processing_status" IN ('received','processing','interpreted','launched','pending_confirmation','error','ignored','responded'))
);
--> statement-breakpoint
CREATE TABLE "ai_actions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"extraction_id" text NOT NULL,
	"action_type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_actions_status_check" CHECK ("ai_actions"."status" IN ('pending','succeeded','failed','rolled_back'))
);
--> statement-breakpoint
CREATE TABLE "ai_extractions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"message_id" text,
	"intent" text NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"extracted_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"needs_confirmation" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_type" text NOT NULL,
	"llm_model" text,
	"llm_prompt" jsonb,
	"llm_raw_response" jsonb,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_extractions_status_check" CHECK ("ai_extractions"."status" IN ('pending','confirmed','executed','rejected','expired','error')),
	CONSTRAINT "ai_extractions_source_check" CHECK ("ai_extractions"."source_type" IN ('text','audio','image')),
	CONSTRAINT "ai_extractions_confidence_check" CHECK ("ai_extractions"."confidence" >= 0 AND "ai_extractions"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_check" CHECK ("audit_logs"."actor_type" IN ('user','ai','system'))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payable_id_payables_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."payables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_source_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_extraction_id_ai_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."ai_extractions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_message_id_whatsapp_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."whatsapp_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_extractions" ADD CONSTRAINT "ai_extractions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_zapi_instance_id" ON "tenants" USING btree ("zapi_instance_id") WHERE "tenants"."zapi_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_user_tenants_tenant_id" ON "user_tenants" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_categories_tenant_kind_name" ON "categories" USING btree ("tenant_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_contacts_tenant_phone" ON "contacts" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "idx_contacts_tenant_last_purchase" ON "contacts" USING btree ("tenant_id","last_purchase_at");--> statement-breakpoint
CREATE INDEX "idx_products_tenant_active" ON "products" USING btree ("tenant_id","is_active","sort_order");--> statement-breakpoint
CREATE INDEX "idx_sale_items_tenant_sale" ON "sale_items" USING btree ("tenant_id","sale_id");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_date" ON "sales" USING btree ("tenant_id","sale_date");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_contact" ON "sales" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_payment_status" ON "sales" USING btree ("tenant_id","payment_status");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_source" ON "sales" USING btree ("tenant_id","source");--> statement-breakpoint
CREATE INDEX "idx_expenses_tenant_date" ON "expenses" USING btree ("tenant_id","expense_date");--> statement-breakpoint
CREATE INDEX "idx_expenses_tenant_category" ON "expenses" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_payables_tenant_status_due" ON "payables" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "idx_payments_tenant_paid_at" ON "payments" USING btree ("tenant_id","paid_at");--> statement-breakpoint
CREATE INDEX "idx_receivables_tenant_status_due" ON "receivables" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "idx_receivables_tenant_contact" ON "receivables" USING btree ("tenant_id","contact_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_tenant_status_due" ON "tasks" USING btree ("tenant_id","status","due_at");--> statement-breakpoint
CREATE INDEX "idx_media_attachments_tenant" ON "media_attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_whatsapp_messages_zapi_id" ON "whatsapp_messages" USING btree ("zapi_message_id") WHERE "whatsapp_messages"."zapi_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_whatsapp_messages_tenant_received" ON "whatsapp_messages" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_messages_tenant_status" ON "whatsapp_messages" USING btree ("tenant_id","processing_status");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_messages_tenant_contact" ON "whatsapp_messages" USING btree ("tenant_id","contact_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_ai_actions_tenant_extraction" ON "ai_actions" USING btree ("tenant_id","extraction_id");--> statement-breakpoint
CREATE INDEX "idx_ai_actions_tenant_status" ON "ai_actions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_ai_extractions_tenant_status" ON "ai_extractions" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_extractions_tenant_intent" ON "ai_extractions" USING btree ("tenant_id","intent");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant_created" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_tenant_entity" ON "audit_logs" USING btree ("tenant_id","entity_type","entity_id");