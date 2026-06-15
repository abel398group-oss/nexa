# Deploy — Provisionamento do Banco Gerenciado (DigitalOcean)

> Como preparar o banco do Nexa **no cluster Postgres gerenciado existente** do
> DigitalOcean: database `nexa`, usuário dedicado `nexa_app`, extensão `pgvector`
> e `DATABASE_URL`. Parte da suíte de deploy — ver
> [`deploy/implementation.md`](../features/deploy/implementation.md).

## Decisão

O banco do Nexa vive **no mesmo cluster gerenciado do TMS**, porém em um **database
separado** (`nexa`) com **usuário próprio** (`nexa_app`) que só tem acesso a esse
database. Não compartilha credenciais nem schema com o TMS.

## 0. Validar o cluster

- Confirmar a **versão do PostgreSQL** do cluster: precisa ser **16** (alinha com o
  dev, `pgvector/pgvector:pg16`). Painel DO → Databases → o cluster → *Overview*.
- Confirmar que o cluster suporta **pgvector** (Postgres gerenciado do DO oferece a
  extensão `vector`). Se a versão for < 16, validar compatibilidade antes de seguir.

## 1. Criar database e usuário dedicado

Pelo painel (Databases → cluster → **Users & Databases**) **ou** via `psql`
conectado como usuário admin do cluster (`doadmin`):

```sql
-- Database do Nexa (isolado do TMS)
CREATE DATABASE nexa;

-- Usuário da aplicação (senha forte — gerar com: openssl rand -base64 24)
CREATE USER nexa_app WITH PASSWORD '<SENHA_FORTE>';

-- Acesso só a este database
GRANT CONNECT ON DATABASE nexa TO nexa_app;
```

> No DO, criar pelo painel já gera o usuário com senha; ainda assim aplique o
> isolamento de privilégios abaixo.

## 2. Isolamento de privilégios (least privilege)

Conectado **ao database `nexa`** (não ao `defaultdb`), como admin:

```sql
\connect nexa

-- dono do schema public = nexa_app (deixa o Prisma migrar sem precisar de superuser)
ALTER SCHEMA public OWNER TO nexa_app;
GRANT ALL ON SCHEMA public TO nexa_app;

-- nexa_app NÃO deve acessar outros databases (TMS) — garantir que não há GRANT cruzado
REVOKE ALL ON DATABASE nexa FROM PUBLIC;
GRANT CONNECT ON DATABASE nexa TO nexa_app;
```

- `nexa_app` **não** é superuser e **não** tem acesso ao database do TMS.
- O conector do TMS é outra conexão (`TMS_DB_URL`, read-only) — **nunca** usa `nexa_app`.

## 3. Habilitar a extensão pgvector

O Nexa usa embeddings (`@xenova/transformers` + migration `add_kb_embeddings`), que
dependem do tipo `vector`. Habilitar **uma vez por database**, conectado ao `nexa`:

```sql
\connect nexa
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extversion FROM pg_extension WHERE extname = 'vector';  -- confirma
```

- No Postgres gerenciado do DO, `CREATE EXTENSION vector` costuma ser permitido ao
  dono do database. Se exigir privilégio, rodar como `doadmin` **antes** do 1º
  `migrate deploy`.
- A baseline de migrations deve assumir a extensão presente (ver
  [`deploy-migrations-baseline.md`](deploy-migrations-baseline.md)).

## 4. Montar a `DATABASE_URL`

Formato (TLS obrigatório no cluster gerenciado):

```
DATABASE_URL="postgresql://nexa_app:<SENHA>@<HOST>:25060/nexa?sslmode=require&schema=public&connection_limit=20&pool_timeout=10"
```

- `<HOST>` e porta `25060`: painel DO → *Connection Details* (usar o host do cluster).
- **`sslmode=require`** obrigatório (o cluster recusa conexão sem TLS).
- `connection_limit=20&pool_timeout=10`: evita esgotar slots do pool (mesmo cuidado
  do TMS). Ajustar conforme o limite de conexões do plano do cluster.
- O valor real vai **só** no `.env` do droplet — nunca no repositório
  (ver `deploy-env-production.md` e `secrets-management.md`).

## 5. Validar o acesso

```bash
# conexão da app (deve listar e permitir criar/!apagar só no db nexa)
psql "postgresql://nexa_app:<SENHA>@<HOST>:25060/nexa?sslmode=require" -c "\conninfo"
psql "postgresql://nexa_app:<SENHA>@<HOST>:25060/nexa?sslmode=require" -c "SELECT current_database(), current_user;"
# pgvector ativo?
psql "...nexa?sslmode=require" -c "SELECT '1'::vector;"  # não pode dar erro de tipo
```

## 6. Checklist

- [ ] Cluster confirmado em PostgreSQL 16 e com suporte a `vector`.
- [ ] Database `nexa` criado.
- [ ] Usuário `nexa_app` criado, dono do schema `public` do `nexa`, sem acesso a outros DBs.
- [ ] `CREATE EXTENSION vector` aplicado no `nexa`.
- [ ] `DATABASE_URL` com `sslmode=require` montada e testada (fora do repo).
- [ ] Firewall do cluster (Trusted Sources) libera o IP do droplet (ver runbook).

## Relacionados

- [`deploy/implementation.md`](../features/deploy/implementation.md) ·
  [`deploy-migrations-baseline.md`](deploy-migrations-baseline.md) ·
  [`deploy-env-production.md`](deploy-env-production.md)
- ADR 013 · `docs/security/secrets-management.md`
