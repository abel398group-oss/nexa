-- AlterTable
ALTER TABLE "campaigns" ALTER COLUMN "status_posted_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "response_status" INTEGER,
    "error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "max_contacts" INTEGER,
    "max_campaigns" INTEGER,
    "max_messages_month" INTEGER,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_notification_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "send_hour" INTEGER NOT NULL DEFAULT 7,
    "send_weekends" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "fiscal_enabled" BOOLEAN NOT NULL DEFAULT true,
    "logistic_enabled" BOOLEAN NOT NULL DEFAULT true,
    "frota_enabled" BOOLEAN NOT NULL DEFAULT true,
    "finance_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_notification_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_states" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tms_event_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "snoozed_until" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "notify_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_conversation_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "pending_conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proactive_rule_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "level" TEXT NOT NULL DEFAULT 'L1',
    "threshold_min" INTEGER NOT NULL DEFAULT 240,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proactive_rule_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_subscriptions_tenant_id_idx" ON "webhook_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_subscription_id_status_idx" ON "webhook_deliveries"("subscription_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_tenant_id_key" ON "plan_limits"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_notification_configs_tenant_id_key" ON "tenant_notification_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "alert_states_tenant_id_status_idx" ON "alert_states"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "alert_states_tenant_id_tms_event_id_key" ON "alert_states"("tenant_id", "tms_event_id");

-- CreateIndex
CREATE INDEX "notification_logs_tenant_id_idx" ON "notification_logs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_conversation_events_dedupe_key_key" ON "pending_conversation_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "pending_conversation_events_tenant_id_status_idx" ON "pending_conversation_events"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "pending_conversation_events_tenant_id_rule_id_status_idx" ON "pending_conversation_events"("tenant_id", "rule_id", "status");

-- CreateIndex
CREATE INDEX "proactive_rule_configs_tenant_id_idx" ON "proactive_rule_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "proactive_rule_configs_tenant_id_rule_id_key" ON "proactive_rule_configs"("tenant_id", "rule_id");

-- CreateIndex
CREATE INDEX "ai_messages_tenant_id_intent_idx" ON "ai_messages"("tenant_id", "intent");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
