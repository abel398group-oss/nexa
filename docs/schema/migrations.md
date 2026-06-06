# Migration Strategy — Prisma

> Disciplina de migrations para o projeto não virar bagunça ao longo dos meses.
> Vale desde o Sprint 1.

## Regras de ouro
1. **Toda mudança de schema passa por migration.** Nunca alterar o banco na mão.
2. **Desenvolvimento:** `prisma migrate dev` (gera + aplica + atualiza client).
3. **Produção:** `prisma migrate deploy` (só aplica migrations já versionadas).
4. **Nunca `db push` em produção** (não versiona — só para protótipo descartável).
5. Migrations são **versionadas no Git** (pasta `prisma/migrations/`).
6. Migration aplicada **não se edita** — corrige-se com uma nova migration.

## Fluxo padrão
```
1. Editar schema.prisma
2. prisma migrate dev --name descricao_curta
3. Revisar o SQL gerado (pasta migrations/)
4. Commit (schema + migration juntos)
5. Em produção: prisma migrate deploy
```

## Nomenclatura
- `add_ai_conversations`, `add_product_connector_credentials`, `alter_billing_add_external_ids`
- snake_case, verbo no início (add/alter/drop), descritivo

## Boas práticas
- Migrations pequenas e frequentes (não acumular muita coisa numa só)
- Campos novos preferencialmente **opcionais** (não quebram dados existentes)
- Mudança incompatível (renomear/remover) → planejar (backfill se preciso)
- Backup do banco antes de `migrate deploy` em produção
- Rodar migrations no CI/CD (deploy automático), não manual no servidor

## Seeds
- `prisma/seed.ts` para dados base (produto HiperTMS, KB inicial, planos de teste)
- Seed é idempotente (rodar 2x não duplica)

## Anti-bagunça (o que NÃO fazer)
- ❌ Alterar tabela direto no PostgreSQL (psql/DBeaver) sem migration
- ❌ Editar uma migration já aplicada
- ❌ `db push` em ambiente compartilhado
- ❌ Migration gigante com 20 mudanças misturadas
