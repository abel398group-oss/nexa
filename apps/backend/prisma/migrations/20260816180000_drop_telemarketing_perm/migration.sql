-- Remove a permissão legada `telemarketing`, substituída por `sdr` + `closer`.
--
-- Segura de rodar porque a migration anterior (20260816160000) já deu `sdr` e `closer` a
-- todo mundo que tinha `telemarketing`, e a conferência antes desta mostrou zero usuários
-- com a permissão antiga — ela não carregava ninguém.
--
-- `array_remove` é no-op em quem não tem, então isto é idempotente. Ainda assim o WHERE
-- fica explícito: sem ele, a linha de TODO usuário seria reescrita à toa.
UPDATE "users"
   SET permissions = array_remove(permissions, 'telemarketing')
 WHERE 'telemarketing' = ANY(permissions);
