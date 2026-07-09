-- ============================================================================
-- A1 (auditoria 2026-07-08) — Detecção de órfãos de tenant_id  [READ-ONLY]
-- ============================================================================
-- Passo obrigatório ANTES de transformar os tenant_id String em Foreign Keys.
-- Para cada tabela com coluna tenant_id, conta quantas linhas apontam para um
-- tenant_id que NÃO existe em tenants(id). Se a criação da FK for tentada com
-- órfãos presentes, ela FALHA. Este script só faz SELECT — seguro em produção.
--
-- Como rodar (no droplet, na pasta do Nexa):
--   docker compose -f docker-compose.production.yml exec -T backend \
--     node -e "const{Client}=require('pg');const fs=require('fs');const c=new Client(process.env.DATABASE_URL);c.connect().then(()=>c.query(fs.readFileSync('/dev/stdin','utf8'))).then(r=>{console.log('done');return c.end()}).catch(e=>{console.error(e.message);process.exit(1)})" < scripts/check-tenant-orphans.sql
--
-- Ou, se tiver psql apontando para o banco:
--   psql "$DATABASE_URL" -f scripts/check-tenant-orphans.sql
--
-- Interpretação: linhas "ORFAOS: <tabela> -> N" indicam N registros a limpar/religar
-- antes da FK. Se sair só "ok:", a migração de FK é segura de escrever.
-- ============================================================================

DO $$
DECLARE
  r   RECORD;
  cnt BIGINT;
  total_orphans BIGINT := 0;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name  = 'tenant_id'
      AND table_schema = 'public'
      AND table_name  <> 'tenants'
    ORDER BY table_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I t
         WHERE t.tenant_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM tenants x WHERE x.id = t.tenant_id)',
      r.table_name
    ) INTO cnt;

    IF cnt > 0 THEN
      total_orphans := total_orphans + cnt;
      RAISE NOTICE 'ORFAOS: %  ->  % linha(s) com tenant_id sem Tenant', r.table_name, cnt;
    ELSE
      RAISE NOTICE 'ok: %', r.table_name;
    END IF;
  END LOOP;

  RAISE NOTICE '----------------------------------------';
  IF total_orphans = 0 THEN
    RAISE NOTICE 'RESULTADO: nenhum orfao. A migracao de FK e SEGURA de escrever.';
  ELSE
    RAISE NOTICE 'RESULTADO: % orfao(s) no total — limpar/religar ANTES da FK.', total_orphans;
  END IF;
END $$;
