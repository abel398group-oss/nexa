# Deploy — Baseline de Migrations (BLOQUEADOR CRÍTICO)

> Procedimento para garantir que um **banco novo** receba o schema **completo** via
> `prisma migrate deploy`. Sem isto, o primeiro deploy sobe um schema **incompleto**
> e o backend **quebra no boot**. Resolver **antes** do deploy.

## 1. O problema

Hoje o histórico do Prisma tem **25 migrations commitadas**, porém **~10 alterações
foram aplicadas direto no banco via `prisma db execute`** (fora das migrations) —
por exemplo: tabela/campos de `opportunities`, valor `portal` no enum `SourceChannel`,
`support_persona`, `archived`, `send_schedule`, `catchup_drift`, entre outros.

Consequência: o banco de **dev/produção atual** "tem tudo", mas as **migrations não**.
Num **banco vazio**, `prisma migrate deploy` aplica só as 25 migrations → o schema
fica **sem** as alterações ad-hoc → o backend referencia colunas/enums inexistentes e
**falha no boot**.

> Regra ADR 013: produção usa **`migrate deploy`** (nunca `migrate dev`). Portanto o
> histórico de migrations **precisa** reproduzir o schema completo sozinho.

## 2. Objetivo

Produzir um histórico de migrations que, **partindo de um banco vazio**, recrie
**exatamente** o schema descrito no `schema.prisma` atual — incluindo tudo que hoje
só existe via SQL ad-hoc. Validável de forma objetiva (diff vazio).

## 3. Pré-condição inegociável — `schema.prisma` é a fonte de verdade

O squash parte do `schema.prisma`. Se o `schema.prisma` **não** refletir 100% do
banco real, o baseline nasce errado. Então, **antes de tudo**, reconciliar:

```bash
# 1) Aponte para um banco que JÁ tem tudo (o dev/produção atual, com os SQLs ad-hoc).
#    NÃO use o banco novo aqui.
export DEV_DB="postgresql://...banco-completo..."

# 2) Há divergência entre o schema.prisma e o banco real?
pnpm --filter backend exec prisma migrate diff \
  --from-schema-datamodel apps/backend/prisma/schema.prisma \
  --to-url "$DEV_DB" \
  --script
```

- Se o diff **não** vier vazio, o `schema.prisma` está atrás do banco. Atualize o
  `schema.prisma` (manualmente ou via `prisma db pull` num clone) até o comando acima
  produzir **vazio** (sem statements). Só então o schema é a fonte de verdade.
- Confirme também o valor `portal` no enum, os campos `external_id`, `kb_embeddings`,
  e demais deltas ad-hoc citados — todos devem estar no `schema.prisma`.

## 4. Gerar a migration baseline (squash)

Com o `schema.prisma` reconciliado, gerar **um** script que cria o schema do zero:

```bash
# Cria a pasta da baseline e gera o SQL completo a partir do schema (do-empty)
mkdir -p apps/backend/prisma/migrations/00000000000000_baseline
pnpm --filter backend exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel apps/backend/prisma/schema.prisma \
  --script > apps/backend/prisma/migrations/00000000000000_baseline/migration.sql
```

- Garanta que a baseline **cria a extensão pgvector** antes de usar o tipo `vector`.
  Se o script gerado não incluir, adicionar no topo do `migration.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
  (ou garantir que a extensão é habilitada no provisionamento — ver
  [`deploy-managed-postgres.md`](deploy-managed-postgres.md)).

### Duas estratégias (escolher uma)

| Estratégia | Como | Quando usar |
|---|---|---|
| **A — Squash total (recomendada p/ 1º deploy)** | Arquivar as 25 migrations antigas e deixar **só** a `00000000000000_baseline`. Banco novo = `migrate deploy` aplica a baseline → schema completo. | Não há ainda produção; quer histórico limpo. |
| **B — Catch-up (preserva histórico)** | Manter as 25 + adicionar **uma** migration nova (`..._catchup_ad_hoc`) com os deltas que faltavam (os SQLs ad-hoc). | Já existe ambiente com as 25 aplicadas e não se quer mexer no histórico. |

> Para o **primeiro** deploy do Nexa, a estratégia **A** é mais simples e segura
> (banco novo, sem legado). A **B** é o caminho se algum ambiente já dependa do
> histórico atual.

## 5. Conciliar ambientes existentes (dev) — `migrate resolve`

Em qualquer banco que **já** tinha as 25 migrations aplicadas (ex.: dev), a baseline
não deve ser re-executada. Marcar como já aplicada:

```bash
pnpm --filter backend exec prisma migrate resolve \
  --applied 00000000000000_baseline
```

(No **banco novo de produção** isso **não** é necessário — lá a baseline roda de fato.)

## 6. Validação objetiva (prova de que reproduz o schema completo)

Antes do deploy, provar num **banco vazio descartável** (scratch):

```bash
export SCRATCH_DB="postgresql://...banco-vazio-de-teste..."

# 1) Aplica só o histórico de migrations (como faz a produção)
DATABASE_URL="$SCRATCH_DB" pnpm --filter backend exec prisma migrate deploy

# 2) O schema resultante bate 100% com o schema.prisma? (deve sair VAZIO / exit 0)
pnpm --filter backend exec prisma migrate diff \
  --from-url "$SCRATCH_DB" \
  --to-schema-datamodel apps/backend/prisma/schema.prisma \
  --exit-code
# exit-code: 0 = sem diferenças (OK) · 2 = há diferenças (baseline incompleta → corrigir)
```

- **Critério de aceite:** o passo 2 sai com **exit 0** (sem drift). Isso prova que
  `migrate deploy` num banco vazio reproduz o schema **completo**.
- Bônus: subir o backend apontando para o `SCRATCH_DB` e confirmar que **não quebra
  no boot** (sem erro de coluna/enum ausente).

## 7. Checklist

- [ ] `schema.prisma` reconciliado (diff vs banco completo = vazio).
- [ ] Baseline gerada (`--from-empty --to-schema-datamodel`) e revisada (inclui `vector`).
- [ ] Estratégia escolhida (A squash total / B catch-up) e aplicada.
- [ ] Ambientes existentes marcados com `migrate resolve --applied` (se aplicável).
- [ ] Validação em banco vazio: `migrate deploy` + `migrate diff --exit-code` = 0.
- [ ] Backend sobe no banco de teste sem erro de schema.
- [ ] Confirmado: produção usará **`migrate deploy`** (ADR 013), nunca `migrate dev`.

## Relacionados

- `docs/infra/prisma-migrations.md` · `docs/schema/migrations.md` · ADR 013
- [`deploy-managed-postgres.md`](deploy-managed-postgres.md) ·
  [`deploy/implementation.md`](../features/deploy/implementation.md)
