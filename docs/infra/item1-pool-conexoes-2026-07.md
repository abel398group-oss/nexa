# Item 1 — Pool de conexões (DO Managed Connection Pool)

> Parte do `docs/infra/plano-escala-2026-07.md`. Menor risco dos três, único que
> se ativa e valida com 1 réplica. Protege o banco de esgotar conexão quando o
> volume subir — o gargalo que derruba primeiro.

## O problema, com número

- O Postgres gerenciado do DO tem `max_connections=25` (compartilhado).
- O Nexa abre `PRISMA_CONNECTION_LIMIT` conexões POR instância — hoje **3**
  (`infra/prisma/prisma.service.ts:10`), conservador de propósito.
- Conta: 1 réplica = 3 conexões. Subir réplicas ou o pool multiplica direto
  contra o teto de 25. Sem pooler, cada conexão do app segura um slot real do
  Postgres o tempo todo.

## A solução (sem instalar nada)

O DO Managed Postgres já traz um **connection pool nativo** (PgBouncer
gerenciado). Não se sobe container nem se mantém processo — cria-se um "pool"
no painel do DO e aponta-se o app pra ele:

- O app conecta em CENTENAS de conexões lógicas; o pool multiplexa num punhado
  de conexões físicas reais contra o Postgres.
- Modo recomendado: **`transaction`** (a conexão física volta ao pool no fim de
  cada transação — máxima reutilização; funciona com Prisma).

## Passo a passo (painel DO + Nexa)

1. **Painel DO** → Databases → cluster `db-postgresql-nyc3-37059` → aba
   **Connection Pools** → **Create Pool**:
   - Database: `nexa`
   - Pool mode: **Transaction**
   - Pool size: começar com **10** (ajustável)
   - Nome: `nexa-pool`
2. O DO gera um endpoint/porta NOVOS para o pool (host igual, **porta
   diferente**, database = nome do pool).
3. **Produção** (`/root/nexa/.env`): trocar o `DATABASE_URL` pra apontar pro
   pool. Conferir com `cat /root/nexa/.env` ANTES (REGRAS-SQUAD) — nunca assumir.
   - ⚠️ Prisma + PgBouncer transaction mode: acrescentar `pgbouncer=true` na
     URL (desliga prepared statements que o modo transaction não suporta).
   - Manter `connection_limit` baixo na URL do Prisma — agora ele conta contra o
     pool lógico, não contra o Postgres direto.
4. **Migrations continuam no endpoint DIRETO**, nunca no pool — `migrate deploy`
   precisa de sessão estável (o pool transaction quebra migration). Guardar as
   duas URLs: `DATABASE_URL` (pool, runtime) e uma direta só pra migrations.
5. Restart do backend. Validar (abaixo).

## Validação

- Backend sobe sem erro de conexão.
- `GET /api/health` → 200.
- Logs sem `P2037` ("Too many database connections") nem `pool_timeout`.
- Rodar um fluxo real (uma conversa, um digest forçado) e conferir que grava.

## Reverter (1 linha)

Voltar o `DATABASE_URL` pro endpoint direto (porta 25060) e restart. O pool
fica criado no DO mas ocioso — nenhum efeito. Zero mudança de código.

## Impacto no código do Nexa

Nenhum obrigatório. O `prisma.service.ts` já lê `DATABASE_URL` e injeta os
params — só a string muda. Opcional (melhora clareza): documentar no
`.env.example` a diferença entre `DATABASE_URL` (pool) e `DIRECT_DATABASE_URL`
(migrations). Ver a mudança de `.env.example` neste commit.

## TMS

Nada. O banco do Nexa é separado do banco do TMS (`hipertms_v12`). Este item
não toca em nenhum contrato nem serviço compartilhado.
