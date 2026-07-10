-- N3: ticket_number (sequential per tenant) + subject (customer-entered, separate from root_cause)
ALTER TABLE "ai_conversations"
  ADD COLUMN "ticket_number" INTEGER,
  ADD COLUMN "subject"       TEXT;

-- Partial index speeds up MAX(ticket_number) lookups when assigning the next number per tenant
CREATE INDEX "ai_conversations_tenant_ticket_number_idx"
  ON "ai_conversations"("tenant_id", "ticket_number")
  WHERE "ticket_number" IS NOT NULL;
