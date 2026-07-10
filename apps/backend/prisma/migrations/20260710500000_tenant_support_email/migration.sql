-- support_email: configurable escalation address per tenant (UI-editable).
-- Fallback: SUPPORT_EMAIL env var (existing behaviour preserved when null).
ALTER TABLE "tenants"
  ADD COLUMN "support_email" TEXT;
