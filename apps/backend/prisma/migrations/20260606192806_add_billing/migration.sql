-- CreateEnum
CREATE TYPE "BillingRequestStatus" AS ENUM ('requested', 'processing', 'link_sent', 'pending_payment', 'confirmed', 'failed', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "ai_billing_requests" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "correlation_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "tenant_id" TEXT,
    "product_code" TEXT,
    "external_tenant_id" TEXT,
    "plan_code" TEXT,
    "requested_amount" DECIMAL(12,2),
    "idempotency_key" TEXT NOT NULL,
    "status" "BillingRequestStatus" NOT NULL DEFAULT 'requested',
    "payment_link" TEXT,
    "external_subscription_id" TEXT,
    "external_invoice_id" TEXT,
    "external_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "ai_billing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "ai_billing_request_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "correlation_id" TEXT,
    "asaas_payment_id" TEXT,
    "event_type" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL DEFAULT '{}',
    "signature_valid" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_status_sync" (
    "id" TEXT NOT NULL,
    "ai_billing_request_id" TEXT NOT NULL,
    "asaas_payment_id" TEXT,
    "expected_status" TEXT,
    "actual_status" TEXT,
    "divergence" BOOLEAN NOT NULL DEFAULT false,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_billing_requests_idempotency_key_key" ON "ai_billing_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_billing_requests_correlation_id_idx" ON "ai_billing_requests"("correlation_id");

-- CreateIndex
CREATE INDEX "ai_billing_requests_tenant_id_idx" ON "ai_billing_requests"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_idempotency_key_key" ON "billing_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "billing_events_ai_billing_request_id_idx" ON "billing_events"("ai_billing_request_id");

-- CreateIndex
CREATE INDEX "payment_status_sync_ai_billing_request_id_idx" ON "payment_status_sync"("ai_billing_request_id");

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_ai_billing_request_id_fkey" FOREIGN KEY ("ai_billing_request_id") REFERENCES "ai_billing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_sync" ADD CONSTRAINT "payment_status_sync_ai_billing_request_id_fkey" FOREIGN KEY ("ai_billing_request_id") REFERENCES "ai_billing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
