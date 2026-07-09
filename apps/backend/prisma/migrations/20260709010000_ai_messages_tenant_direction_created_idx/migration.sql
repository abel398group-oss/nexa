-- A6 (auditoria 2026-07-08): índice para a contagem mensal de mensagens outbound por
-- tenant, usada pelo cap de plano (ConversationAgentService.isOverMonthlyLimit).
-- Sem ele, o count filtra ai_messages por (tenant_id, direction, created_at) sem índice.
--
-- ⚠️ PRODUÇÃO AO VIVO (Abel): ai_messages é a maior tabela. Um CREATE INDEX normal pega
-- lock de escrita durante a criação. Para ZERO downtime, PRÉ-CRIE o índice manualmente
-- com CONCURRENTLY (fora de transação, NÃO trava escrita) ANTES de rodar migrate deploy:
--
--   docker compose -f docker-compose.production.yml exec -T backend \
--     node -e "const{Client}=require('pg');const c=new Client(process.env.DATABASE_URL);c.connect().then(()=>c.query('CREATE INDEX CONCURRENTLY IF NOT EXISTS \"ai_messages_tenant_id_direction_created_at_idx\" ON \"ai_messages\"(\"tenant_id\",\"direction\",\"created_at\")')).then(()=>{console.log('ok');return c.end()}).catch(e=>{console.error(e.message);process.exit(1)})"
--
-- Depois disso, o comando abaixo (IF NOT EXISTS) vira no-op e o migrate deploy passa limpo.
-- Se a tabela ainda for pequena, pode ignorar o pré-passo e deixar rodar aqui mesmo.

CREATE INDEX IF NOT EXISTS "ai_messages_tenant_id_direction_created_at_idx"
  ON "ai_messages"("tenant_id", "direction", "created_at");
