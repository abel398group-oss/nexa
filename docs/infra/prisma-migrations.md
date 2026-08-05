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

## Armadilhas conhecidas (Windows + DO managed Postgres)

### 1. `P1002` — "Timed out trying to acquire a postgres advisory lock"

**Sintoma:** `prisma migrate deploy` local trava 10s e falha com P1002, mesmo
com o banco no ar e respondendo.

**Causa (confirmada em 2026-08-05):** a produção conecta pelo **connection pool
do DigitalOcean** (PgBouncer, porta 25061 / pool `Nexa`), enquanto a máquina do
Abel conecta **direto** (porta 25060 / banco `nexa`). O `pg_advisory_lock()` do
Prisma é preso à **sessão**, mas o PgBouncer devolve a conexão ao pool ao fim da
transação — o cadeado fica **órfão**: ninguém o segura de fato e ninguém o
solta. Toda migration local seguinte fica esperando por ele.

Diagnóstico (leitura pura) — quem segura o cadeado:

```sql
SELECT l.pid, l.granted, a.client_addr, a.state, left(a.query, 80)
  FROM pg_locks l LEFT JOIN pg_stat_activity a ON a.pid = l.pid
 WHERE l.locktype = 'advisory';
```

`client_addr = 127.0.0.1` → é o pool (produção). `granted = true` + `state =
idle` → cadeado órfão.

**Contorno** (PowerShell), seguro quando as migrations são aditivas e não há
outra migration rodando de verdade:

```powershell
$env:PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK="1" ; pnpm prisma:deploy
```

**Antes de usar o contorno, confirme se a migration já não foi aplicada.** O
deploy automático de produção roda `migrate deploy` no boot — foi exatamente
ele que aplicou as migrations E orfanou o cadeado nos dois casos observados
(`contact_abuse_records` em 2026-08-04 e `partners`/`seller_activities` em
2026-08-05). Nos dois, "No pending migrations to apply" localmente estava
**certo**: já tinha sido aplicado pelo deploy.

Verificar de verdade em vez de deduzir da mensagem:

```sql
SELECT migration_name, finished_at, rolled_back_at
  FROM _prisma_migrations ORDER BY finished_at DESC NULLS FIRST LIMIT 5;
```

### 2. `EPERM: operation not permitted, rename query_engine-windows.dll.node`

**Sintoma:** `prisma generate` falha ao renomear o binário do motor.

**Causa:** o backend local (ou qualquer processo Node com o client carregado)
mantém o `.dll.node` aberto — o Windows não permite substituir arquivo em uso.

**Solução:** parar o backend antes (`Ctrl+C`), ou derrubar tudo:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

**Efeito colateral que se acumula:** cada tentativa falha deixa um
`query_engine-windows.dll.node.tmpNNNN` de ~18 MB órfão em
`node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/`. Em
2026-08-05 havia **33 deles (~594 MB)**. Vale limpar de tempos em tempos:

```powershell
Remove-Item "node_modules\.pnpm\@prisma+client@*\node_modules\.prisma\client\query_engine-windows.dll.node.tmp*" -Force
```

Nunca apagar o `query_engine-windows.dll.node` (sem `.tmp`) — esse é o real.

**Nota:** o `generate` escreve os tipos TypeScript **antes** de trocar o
binário, então mesmo falhando com EPERM o client normalmente já conhece os
modelos novos. Confirme antes de insistir:

```powershell
Select-String -Path "node_modules\.pnpm\@prisma+client@*\node_modules\.prisma\client\index.d.ts" -Pattern "SellerActivity" -Quiet
```

## Relacionados

- `docs/schema/migrations.md` (estratégia) · `docs/schema/README.md`
- `docs/infra/ci-cd.md` · ADR 013 — Environment Strategy · `CLAUDE.md`
