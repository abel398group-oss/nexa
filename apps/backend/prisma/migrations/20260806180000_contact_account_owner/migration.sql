-- F16: unificação Contatos+Inbox — dono da conta (manual) + índice de histórico de chamados por contato.
ALTER TABLE "contacts" ADD COLUMN "account_owner" TEXT;

CREATE INDEX "ai_conversations_tenant_id_contact_id_idx" ON "ai_conversations"("tenant_id", "contact_id");
