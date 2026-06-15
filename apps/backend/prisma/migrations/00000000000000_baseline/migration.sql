-- Baseline migration (squash) - schema completo
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('whatsapp', 'telegram', 'site', 'instagram', 'facebook', 'email', 'portal');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('router', 'sdr', 'sales', 'onboarding', 'support', 'billing', 'knowledge', 'analytics');

-- CreateEnum
CREATE TYPE "CustomerStage" AS ENUM ('lead', 'cliente_novo', 'cliente_ativo');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'waiting_customer', 'waiting_internal', 'escalated', 'opt_out', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('create_payment', 'get_payment_status', 'consult_plan', 'escalate', 'update_context', 'cancel_payment', 'refund', 'cancel_subscription', 'delete_customer', 'alter_contract');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('requested', 'validated', 'executed', 'blocked', 'failed');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('created', 'queued', 'processing', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "EventPriority" AS ENUM ('alta', 'media', 'baixa');

-- CreateEnum
CREATE TYPE "DlqStatus" AS ENUM ('pending', 'reprocessed', 'discarded');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'gestor', 'operacional', 'financeiro', 'vendedor');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'operacional',
    "seller_id" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "name_source" TEXT DEFAULT 'pushname',
    "company" TEXT,
    "email" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lead_status" TEXT,
    "interest_score" INTEGER NOT NULL DEFAULT 0,
    "external_contact_id" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "opt_out_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_code" TEXT,
    "external_id" TEXT,
    "correlation_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source_channel" "SourceChannel" NOT NULL,
    "agent_type" "AgentType" NOT NULL,
    "customer_stage" "CustomerStage" NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_seller_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "outcome" TEXT,
    "outcome_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "auto_close_at" TIMESTAMP(3),
    "ticket_category" TEXT,
    "ticket_priority" TEXT,
    "root_cause" TEXT,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_stage_history" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "from_outcome" TEXT,
    "to_outcome" TEXT,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "intent" TEXT,
    "prompt_version" TEXT,
    "kb_version" TEXT,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "estimated_cost_usd" DECIMAL(10,6),
    "actual_cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER,
    "external_id" TEXT,
    "ack" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_actions" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "action_type" "ActionType" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'requested',
    "requested_by_ai" BOOLEAN NOT NULL DEFAULT true,
    "executed_by_backend" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMP(3),

    CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_customer_profile" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "external_contact_id" TEXT,
    "industry" TEXT,
    "segment" TEXT,
    "fleet_size" INTEGER,
    "satisfaction_score" DECIMAL(3,1),
    "preferred_tone" TEXT,
    "notes" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_customer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_base" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_code" TEXT,
    "topic" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "embedding_model" TEXT,
    "embedding" vector(384),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_knowledge_versions" (
    "id" TEXT NOT NULL,
    "knowledge_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "author" TEXT,
    "reviewer" TEXT,
    "approved_at" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "producer" TEXT,
    "priority" "EventPriority" NOT NULL DEFAULT 'media',
    "subject_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "EventStatus" NOT NULL DEFAULT 'created',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_dlq" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "original_event_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" "DlqStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_dlq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "product_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connector" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_connector_credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "credential_type" TEXT NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_connector_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sender_numbers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "session_name" TEXT NOT NULL DEFAULT 'default',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "daily_limit" INTEGER NOT NULL DEFAULT 30,
    "sent_today" INTEGER NOT NULL DEFAULT 0,
    "day_stamp" TEXT,
    "hourly_limit" INTEGER NOT NULL DEFAULT 8,
    "sent_this_hour" INTEGER NOT NULL DEFAULT 0,
    "hour_stamp" TEXT,
    "warmup_stage" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sender_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "template" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "link" TEXT,
    "send_link_on_first" BOOLEAN NOT NULL DEFAULT false,
    "media_url" TEXT,
    "media_name" TEXT,
    "send_limit" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sender_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "wa_start_hour" INTEGER NOT NULL DEFAULT 7,
    "wa_end_hour" INTEGER NOT NULL DEFAULT 19,
    "email_start_hour" INTEGER NOT NULL DEFAULT 8,
    "email_end_hour" INTEGER NOT NULL DEFAULT 18,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sender_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_targets" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_messages" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_playbook" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "persona" TEXT NOT NULL DEFAULT '',
    "support_persona" TEXT NOT NULL DEFAULT '',
    "objections" JSONB NOT NULL DEFAULT '[]',
    "cta_cold" TEXT NOT NULL DEFAULT '',
    "cta_warm" TEXT NOT NULL DEFAULT '',
    "cta_hot" TEXT NOT NULL DEFAULT '',
    "signup_url" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_channels" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'smtp',
    "from_email" TEXT NOT NULL,
    "from_name" TEXT NOT NULL DEFAULT 'Lia HiperTMS',
    "reply_to" TEXT,
    "smtp_host" TEXT NOT NULL DEFAULT 'mail.hipertms.com.br',
    "smtp_port" INTEGER NOT NULL DEFAULT 465,
    "smtp_user" TEXT NOT NULL,
    "smtp_pass" TEXT NOT NULL,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
    "imap_host" TEXT NOT NULL DEFAULT 'mail.hipertms.com.br',
    "imap_port" INTEGER NOT NULL DEFAULT 993,
    "imap_user" TEXT NOT NULL,
    "imap_pass" TEXT NOT NULL,
    "imap_mailbox" TEXT NOT NULL DEFAULT 'INBOX',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_poll_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_optout_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_optout_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handoff_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "user_name" TEXT,
    "page" TEXT,
    "error_code" TEXT,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handoff_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "conversation_id" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "company" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "interest_score" INTEGER NOT NULL DEFAULT 0,
    "intent" TEXT,
    "summary" TEXT,
    "value" DECIMAL(12,2),
    "assigned_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_stage_history" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_idx" ON "contacts"("tenant_id");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_status_idx" ON "contacts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_external_contact_id_idx" ON "contacts"("tenant_id", "external_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_tenant_id_phone_key" ON "contacts"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_tenant_id_email_key" ON "contacts"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "ai_conversations_tenant_id_idx" ON "ai_conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_conversations_correlation_id_idx" ON "ai_conversations"("correlation_id");

-- CreateIndex
CREATE INDEX "ai_conversations_contact_id_idx" ON "ai_conversations"("contact_id");

-- CreateIndex
CREATE INDEX "ai_conversations_tenant_id_external_id_idx" ON "ai_conversations"("tenant_id", "external_id");

-- CreateIndex
CREATE INDEX "ai_conversations_status_last_activity_at_idx" ON "ai_conversations"("status", "last_activity_at");

-- CreateIndex
CREATE INDEX "conversation_stage_history_conversation_id_idx" ON "conversation_stage_history"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_stage_history_changed_at_idx" ON "conversation_stage_history"("changed_at");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_messages_correlation_id_idx" ON "ai_messages"("correlation_id");

-- CreateIndex
CREATE INDEX "ai_messages_external_id_idx" ON "ai_messages"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_actions_idempotency_key_key" ON "ai_actions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_actions_tenant_id_idx" ON "ai_actions"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_actions_correlation_id_idx" ON "ai_actions"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_customer_profile_contact_id_key" ON "ai_customer_profile"("contact_id");

-- CreateIndex
CREATE INDEX "ai_customer_profile_tenant_id_idx" ON "ai_customer_profile"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_knowledge_base_tenant_id_idx" ON "ai_knowledge_base"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_knowledge_base_category_idx" ON "ai_knowledge_base"("category");

-- CreateIndex
CREATE INDEX "ai_knowledge_versions_knowledge_id_idx" ON "ai_knowledge_versions"("knowledge_id");

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_idempotency_key_key" ON "domain_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "domain_events_tenant_id_idx" ON "domain_events"("tenant_id");

-- CreateIndex
CREATE INDEX "domain_events_correlation_id_idx" ON "domain_events"("correlation_id");

-- CreateIndex
CREATE INDEX "domain_events_status_idx" ON "domain_events"("status");

-- CreateIndex
CREATE INDEX "event_dlq_tenant_id_idx" ON "event_dlq"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "product_connector_credentials_tenant_id_idx" ON "product_connector_credentials"("tenant_id");

-- CreateIndex
CREATE INDEX "product_connector_credentials_product_id_idx" ON "product_connector_credentials"("product_id");

-- CreateIndex
CREATE INDEX "sellers_tenant_id_idx" ON "sellers"("tenant_id");

-- CreateIndex
CREATE INDEX "seller_notifications_tenant_id_idx" ON "seller_notifications"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_notifications_conversation_id_key" ON "seller_notifications"("conversation_id");

-- CreateIndex
CREATE INDEX "sender_numbers_tenant_id_idx" ON "sender_numbers"("tenant_id");

-- CreateIndex
CREATE INDEX "campaigns_tenant_id_idx" ON "campaigns"("tenant_id");

-- CreateIndex
CREATE INDEX "campaigns_archived_at_idx" ON "campaigns"("archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "sender_settings_tenant_id_key" ON "sender_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "campaign_targets_campaign_id_idx" ON "campaign_targets"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_targets_status_idx" ON "campaign_targets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "processed_messages_message_id_key" ON "processed_messages"("message_id");

-- CreateIndex
CREATE INDEX "complaints_tenant_id_idx" ON "complaints"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_read_idx" ON "notifications"("tenant_id", "read");

-- CreateIndex
CREATE UNIQUE INDEX "sales_playbook_tenant_id_key" ON "sales_playbook"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_channels_tenant_id_key" ON "email_channels"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_optout_tokens_token_key" ON "email_optout_tokens"("token");

-- CreateIndex
CREATE INDEX "email_optout_tokens_token_idx" ON "email_optout_tokens"("token");

-- CreateIndex
CREATE INDEX "email_optout_tokens_tenant_id_idx" ON "email_optout_tokens"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "handoff_tokens_token_key" ON "handoff_tokens"("token");

-- CreateIndex
CREATE INDEX "handoff_tokens_token_idx" ON "handoff_tokens"("token");

-- CreateIndex
CREATE INDEX "handoff_tokens_tenant_id_idx" ON "handoff_tokens"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_conversation_id_key" ON "follow_ups"("conversation_id");

-- CreateIndex
CREATE INDEX "follow_ups_tenant_id_idx" ON "follow_ups"("tenant_id");

-- CreateIndex
CREATE INDEX "follow_ups_status_idx" ON "follow_ups"("status");

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_idx" ON "opportunities"("tenant_id");

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_stage_idx" ON "opportunities"("tenant_id", "stage");

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_conversation_id_idx" ON "opportunities"("tenant_id", "conversation_id");

-- CreateIndex
CREATE INDEX "opportunity_stage_history_opportunity_id_idx" ON "opportunity_stage_history"("opportunity_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_assigned_seller_id_fkey" FOREIGN KEY ("assigned_seller_id") REFERENCES "sellers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_stage_history" ADD CONSTRAINT "conversation_stage_history_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_versions" ADD CONSTRAINT "ai_knowledge_versions_knowledge_id_fkey" FOREIGN KEY ("knowledge_id") REFERENCES "ai_knowledge_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_connector_credentials" ADD CONSTRAINT "product_connector_credentials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_notifications" ADD CONSTRAINT "seller_notifications_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
