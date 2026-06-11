# Migrations (Prisma) — Guia Operacional

> A **estratégia** detalhada vive em `docs/schema/migrations.md`. Este guia é o
> resumo operacional do dia a dia e da fronteira com agentes de IA.

## Regras de ouro (resumo)

1. Toda mudança de schema passa por **migration** — nunca alterar o banco na mão.
2. **dev**: `prisma migrate dev --name <descricao>` (gera + aplica + atualiza client).
3. **staging/prod**: `prisma migrate deploy` (só aplica o que já está versionado).
4. **Nunca `db push`** em produção.
5. Migrations são versionadas no Git (`apps/backend/prisma/migrations/`).
6. Migration aplicada **não se edita** — corrige-se com uma nova migration.

## Fluxo

```
1. Editar apps/backend/prisma/schema.prisma
2. pnpm db:migrate            # = prisma migrate dev (USER ONLY)
3. Revisar o SQL gerado em prisma/migrations/<timestamp>_<descricao>/
4. Commit do schema + migration juntos
5. Deploy: prisma migrate deploy (CI/CD)
```

Comandos pela raiz: `pnpm db:generate` (client, sem DB), `pnpm db:migrate`
(USER ONLY), `pnpm db:seed` (USER ONLY), `pnpm db:studio`.

## Fronteira com agentes de IA

Agentes/Claude **não rodam migrations nem seed** (sem `.env`/DB). Quando uma
mudança exige migration, o agente edita `schema.prisma` e **pede ao usuário** para
rodar `pnpm db:migrate` (ver `CLAUDE.md`).

## Nomenclatura

snake_case, verbo no início, descritivo — alinhado ao histórico real do projeto:
`add_contacts`, `add_billing`, `expand_action_types`, `email_channel_smtp`,
`conversation_status_v2`. Ver migrations existentes em `apps/backend/prisma/migrations/`.

## Boas práticas

- Migrations pequenas e frequentes (não acumular numa só).
- Campos novos preferencialmente **opcionais** (não quebram dados existentes).
- Mudança incompatível (renomear/remover) → planejar backfill.

## Relacionados

- `docs/schema/migrations.md` (estratégia) · `docs/schema/README.md`
- `docs/infra/ci-cd.md` · ADR 013 — Environment Strategy · `CLAUDE.md`
