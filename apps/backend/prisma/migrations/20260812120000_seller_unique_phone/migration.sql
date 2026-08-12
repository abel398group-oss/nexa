-- Unicidade de telefone por tenant em `sellers`.
--
-- Por quê: dois cliques no "Salvar" criavam DOIS vendedores com o mesmo número.
-- A checagem no service é check-then-act — as duas requisições passam pelo
-- SELECT antes de qualquer uma gravar —, então só o banco arbitra a corrida.
-- O estrago não era a linha repetida: era o handoff saindo duas vezes para a
-- mesma pessoa e a distribuição de lote contando o vendedor em dobro.
--
-- Aditiva e segura: verificado em 12/08/2026 que a base NÃO tem nenhum par
-- (tenant_id, phone) repetido, então o índice aplica sem backfill. Se algum dia
-- este arquivo rodar numa base que tenha, ele falha em vez de apagar dado —
-- que é o comportamento desejado. Para achar os duplicados antes:
--
--   SELECT tenant_id, phone, count(*) FROM sellers
--    GROUP BY 1, 2 HAVING count(*) > 1;
--
-- IF NOT EXISTS porque a migration pode reencontrar um índice criado à mão em
-- produção durante um incidente.
CREATE UNIQUE INDEX IF NOT EXISTS "sellers_tenant_id_phone_key"
  ON "sellers" ("tenant_id", "phone");
