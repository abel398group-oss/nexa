-- DISP-005 (auditoria 2026-08-02): índice composto para a query mais quente do
-- worker de disparo — "próximo alvo desta campanha, com este status, mais antigo
-- primeiro" (sender.service.tick / email-campaign-sender.tick).
--
-- Antes existiam só @@index([campaign_id]) e @@index([status]) separados, que
-- resolvem metade do predicado cada um e deixam o ORDER BY para um sort.
--
-- ADITIVA: só cria índice, não altera dados nem colunas.
-- IF NOT EXISTS mantém a migration idempotente (ver docs/infra/prisma-migrations.md).
CREATE INDEX IF NOT EXISTS "campaign_targets_campaign_id_status_created_at_idx"
  ON "campaign_targets" ("campaign_id", "status", "created_at");
