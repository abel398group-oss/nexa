-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('whatsapp', 'telegram', 'site', 'instagram', 'facebook', 'email');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('router', 'sdr', 'sales', 'onboarding', 'support', 'billing', 'knowledge', 'analytics');

-- CreateEnum
CREATE TYPE "CustomerStage" AS ENUM ('lead', 'cliente_novo', 'cliente_ativo');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'escalated', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('create_payment', 'consult_plan', 'escalate', 'update_context');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('requested', 'validated', 'executed', 'blocked', 'failed');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('created', 'queued', 'processing', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "EventPriority" AS ENUM ('alta', 'media', 'baixa');

-- CreateEnum
CREATE TYPE "DlqStatus" AS ENUM ('pending', 'reprocessed', 'discarded');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'gestor', 'operacional', 'financeiro');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'operacional',
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
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_code" TEXT,
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

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "ai_conversations_tenant_id_idx" ON "ai_conversations"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_conversations_correlation_id_idx" ON "ai_conversations"("correlation_id");

-- CreateIndex
CREATE INDEX "ai_conversations_contact_id_idx" ON "ai_conversations"("contact_id");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_messages_correlation_id_idx" ON "ai_messages"("correlation_id");

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
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "product_connector_credentials_tenant_id_idx" ON "product_connector_credentials"("tenant_id");

-- CreateIndex
CREATE INDEX "product_connector_credentials_product_id_idx" ON "product_connector_credentials"("product_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_knowledge_versions" ADD CONSTRAINT "ai_knowledge_versions_knowledge_id_fkey" FOREIGN KEY ("knowledge_id") REFERENCES "ai_knowledge_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_connector_credentials" ADD CONSTRAINT "product_connector_credentials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
