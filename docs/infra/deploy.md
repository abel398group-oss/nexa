# Deploy — Nexa

## Ambiente local

```
# Backend (porta 3001)
cd apps/backend && pnpm start:dev

# Frontend (porta 5174)
cd apps/frontend && pnpm dev
```

Atalho: `Iniciar Nexa.bat` na área de trabalho.

## Dependências locais

| Serviço | Porta | Observação |
|---|---|---|
| PostgreSQL (Nexa) | 5433 | Docker |
| Redis | 6380 | Docker |
| WAHA (WhatsApp) | 3018 | Docker |

## Variáveis de ambiente críticas

> Lista canônica e completa (com regras de rotação/ambiente) em
> [`docs/security/secrets-management.md`](../security/secrets-management.md).
> Abaixo, as mais usadas no deploy:

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL do Nexa |
| `ANTHROPIC_API_KEY` | Chave Claude (nunca commitar) |
| `TMS_DB_URL` | Banco HiperTMS (read-only, acesso direto) |
| `TMS_API_BASE_URL` | URL base da API do TMS (conector) |
| `TMS_SERVICE_TOKEN` | Token de autenticação do conector TMS |
| `WAHA_API_URL` | Gateway WhatsApp |
| `CORS_ORIGINS` | Origens permitidas (CSV) |
| `AI_AUTONOMY_ENABLED` | Kill switch da IA |
| `NEXA_PUBLIC_URL` | URL pública (ngrok/cloudflare para webhooks) |
| `PORTAL_JWT_SECRET` | Segredo da sessão do portal do cliente (≥ 32 chars, ≠ `JWT_SECRET`). **Obrigatório em produção** — sem ele o boot aborta. |

## Migrations (aplicar antes de subir a app)

Em staging/produção use sempre `prisma migrate deploy` (nunca `migrate dev` — ADR 013).
Aplique as migrations pendentes ANTES de iniciar o backend, senão colunas novas
quebram o boot.

```
cd apps/backend
pnpm prisma migrate deploy   # aplica todas as migrations pendentes
pnpm db:generate             # regenera o Prisma Client
```

Migrations recentes que precisam estar aplicadas:

- `external_id` em `ai_conversations` e `contacts` (portal do cliente)
- `support_persona` em `sales_playbook` (Config de Suporte)

Para os SQLs idempotentes avulsos em `apps/backend/prisma/*.sql` (ex.:
`add_support_persona.sql`), rodar via
`npx prisma db execute --file prisma/<arquivo>.sql --schema prisma/schema.prisma`.

## Deploy DigitalOcean (pendente)

- Rodar em App Platform ou Droplet
- Rotacionar `ANTHROPIC_API_KEY` no deploy
- Gerar `PORTAL_JWT_SECRET` forte (≥ 32 chars), distinto do `JWT_SECRET`
- Configurar `NEXA_PUBLIC_URL` com domínio definitivo
- `TMS_DB_URL` já aponta para DigitalOcean (produção)
- Rodar `prisma migrate deploy` + `db:generate` antes de subir (ver seção Migrations)
