# Deploy — Variáveis de Ambiente (Produção)

> O `.env` de produção vive **só no droplet** (`~/nexa/.env`), criado a partir do
> `.env.production.example` versionado (sem valores reais). **Nunca commitar segredos.**
> Ver [`deploy/implementation.md`](../features/deploy/implementation.md) e
> `docs/security/secrets-management.md`.

## Regras

- `validateEnv()` roda no boot e, em **produção**, **aborta** se faltar/estiver com
  placeholder qualquer **variável obrigatória** (marcadas com 🔴 abaixo).
- Gerar segredos fortes: `openssl rand -base64 48`. `JWT_SECRET ≠ JWT_REFRESH_SECRET`
  (o validateEnv recusa se forem iguais).
- Cuidado com `$` literal dentro do `env_file` do compose: duplicar (`$` → `$$`),
  mesmo cuidado do TMS.
- Valores reais: só no deploy; rotação conforme `secrets-management.md`.

## `.env.production.example` (template — sem valores reais)

```bash
# .env.production.example — Nexa
# COMO USAR (no droplet): cp .env.production.example .env && nano .env
# NUNCA commitar o .env real. "$" literal em valores → escapar como "$$".

# ---- Geral / Runtime ----
NODE_ENV=production
PORT=3001
TZ=America/Sao_Paulo

# ---- Banco (PostgreSQL gerenciado — DigitalOcean) ----
# sslmode=require obrigatório; usuário dedicado nexa_app (ver deploy-managed-postgres.md)
DATABASE_URL=postgresql://nexa_app:SENHA@HOST:25060/nexa?sslmode=require&schema=public&connection_limit=20&pool_timeout=10

# ---- Redis (container interno da nexa-network) ----
REDIS_URL=redis://:SENHA_REDIS@redis:6379
REDIS_PASSWORD=SENHA_REDIS

# ---- IA (Anthropic / Lia) ----
ANTHROPIC_API_KEY=GERE_NO_PAINEL_ANTHROPIC
AI_MODEL=claude-haiku-4-5-20251001
AI_AUTONOMY_ENABLED=false            # kill switch default (ADR 012) — ligar com cautela
# TRANSFORMERS_CACHE=/usr/src/app/.cache   # cache dos embeddings (ver deploy-dockerization.md)

# ---- Auth (sessões internas) ----
JWT_SECRET=GERE_FORTE_32+            # openssl rand -base64 48
JWT_REFRESH_SECRET=GERE_OUTRO_FORTE  # DIFERENTE do JWT_SECRET
PORTAL_JWT_SECRET=GERE_OUTRO_FORTE   # sessão do Portal (aud:portal) — isolado do interno

# ---- WhatsApp (WAHA — provisório, será trocado pela Cloud API) ----
WAHA_API_URL=http://waha:3000        # host interno da nexa-network (container waha)
WAHA_API_KEY=GERE_FORTE              # mesma chave do container waha (header X-Api-Key)
WAHA_SESSION=default                 # nome da sessão do WAHA
WAHA_WEBHOOK_TOKEN=GERE_FORTE        # autentica os webhooks do WAHA (?token=...)
WAHA_SENDER_PHONE=55XXXXXXXXXXX      # número pareado no WAHA (opcional/diagnóstico)
WAHA_SEND_ALLOWLIST=                 # CSV de números liberados p/ envio (vazio = libera geral)
# WAHA_REACHABLE_BASE=               # base p/ reescrever URLs de mídia, se o WAHA não for alcançável direto
# WHATSAPP_MEDIA_ENABLED=true        # liga envio/recebimento de mídia
# WHATSAPP_INVITE_LINK=              # link de convite do grupo/contato, se usado

# ---- Conector HiperTMS (read-only) ----
TMS_DB_URL=postgresql://LEITURA@HOST_TMS:25060/tms?sslmode=require   # SELECT-only
TMS_API_BASE_URL=https://api.hipertms.SEU_DOMINIO
TMS_SERVICE_TOKEN=TOKEN_SERVER_TO_SERVER

# ---- URLs públicas / CORS ----
NEXA_PUBLIC_URL=https://nexa.SEU_DOMINIO       # base pública (webhooks, server-to-server)
NEXA_API_URL=https://nexa.SEU_DOMINIO/api      # base da API (frontend/integrações)
NEXA_PORTAL_URL=https://nexa.SEU_DOMINIO/portal # entrada do Portal do cliente
MEDIA_PUBLIC_BASE=https://material.hipertms.com.br  # link de PDF VISÍVEL pro lead (subdomínio neutro → mesmo backend)
CORS_ORIGINS=https://nexa.SEU_DOMINIO,https://app.hipertms.SEU_DOMINIO  # CSV de origens
```

## Tabela de variáveis

| Variável | 🔴 Obrigatória em prod? | Descrição |
|---|:--:|---|
| `NODE_ENV` | — | `production` (ativa o validateEnv estrito, Swagger off, etc.). |
| `PORT` | — | Porta do backend (3001). Forçada no compose. |
| `TZ` | — | `America/Sao_Paulo` (regras de horário/janela). |
| `DATABASE_URL` | 🔴 | Postgres do Nexa (`nexa_app`@cluster, `sslmode=require`). |
| `REDIS_URL` | — | Conexão ao Redis interno (`redis://:senha@redis:6379`). |
| `REDIS_PASSWORD` | — | Senha do container Redis (usada no compose e no `REDIS_URL`). |
| `ANTHROPIC_API_KEY` | 🔴 | Chave do Claude (a Lia). |
| `AI_MODEL` | — | Modelo da Lia (default `claude-haiku-4-5-20251001`). |
| `AI_AUTONOMY_ENABLED` | — | Default do kill switch de autonomia (ADR 012). |
| `TRANSFORMERS_CACHE` | — | Caminho do cache dos embeddings (alinhar build/runtime). |
| `JWT_SECRET` | 🔴 | Assinatura do access token. Forte; ≠ refresh. |
| `JWT_REFRESH_SECRET` | 🔴 | Assinatura do refresh token. |
| `PORTAL_JWT_SECRET` | 🔴 | Sessão do Portal (`aud:portal`), isolada do JWT interno. |
| `WAHA_API_URL` | — | Gateway WhatsApp (WAHA). Em prod: `http://waha:3000` (rede interna). |
| `WAHA_API_KEY` | — | Chave da API do WAHA (header `X-Api-Key`). **Igual** à do container `waha`. |
| `WAHA_SESSION` | — | Nome da sessão do WAHA (default `default`). |
| `WAHA_WEBHOOK_TOKEN` | 🔴 | Autentica webhooks do WAHA (`/api/webhooks/waha?token=`). |
| `WAHA_SENDER_PHONE` | — | Número pareado no WAHA (diagnóstico). |
| `WAHA_SEND_ALLOWLIST` | — | CSV de números liberados p/ envio (vazio = libera geral). |
| `WAHA_REACHABLE_BASE` | — | Base p/ reescrever URLs de mídia, se necessário. |
| `WHATSAPP_MEDIA_ENABLED` | — | Liga envio/recebimento de mídia. |
| `WHATSAPP_INVITE_LINK` | — | Link de convite, se usado. |
| `TMS_DB_URL` | — | Banco do TMS, **read-only** (conector). Nunca migrar/escrever aqui. |
| `TMS_API_BASE_URL` | — | API do TMS (endpoints `/nexa/*` read-only). |
| `TMS_SERVICE_TOKEN` | — | Token server-to-server do conector/handoff. |
| `NEXA_PUBLIC_URL` | — | Base pública do Nexa (webhooks WAHA, server-to-server). Não é vista pelo lead — pode ser `nexa.*`. |
| `MEDIA_PUBLIC_BASE` | — | Domínio do link de PDF/material **visível pro lead**. Tem prioridade sobre `NEXA_PUBLIC_URL`. Use subdomínio neutro/da marca (ex.: `material.hipertms.com.br`) apontando pro mesmo backend que serve `/uploads/`. |
| `NEXA_API_URL` | — | Base da API (consumida pelo frontend/integrações). |
| `NEXA_PORTAL_URL` | — | URL de entrada do Portal do cliente. |
| `CORS_ORIGINS` | — | Origens permitidas (CSV) — inclui o domínio do Nexa e o do TMS (widget). |

> 🔴 = `validateEnv` aborta o boot em produção se ausente, fraca ou com placeholder.
> Lista canônica e regras de rotação: `docs/security/secrets-management.md`.

## Variáveis de build do frontend (CI)

**Nenhuma.** O frontend usa `baseURL: '/api'` (relativo) e o Socket.IO conecta na
mesma origem — ou seja, não há `VITE_*` de API/WS a injetar no build. O reverse proxy
do host serve o SPA em `/` e roteia `/api` e `/ws` para o backend no **mesmo domínio**.
Basta `pnpm --filter frontend build` gerar o `dist/`; o `Dockerfile` do frontend só
empacota os estáticos no nginx.

## Checklist

- [ ] `.env.production.example` versionado (sem valores reais).
- [ ] `.env` criado no droplet a partir do exemplo, com segredos fortes.
- [ ] `JWT_SECRET ≠ JWT_REFRESH_SECRET`; nenhuma var 🔴 com placeholder.
- [ ] `$` literais escapados (`$$`) no `.env`.
- [ ] `CORS_ORIGINS` inclui o domínio do Nexa (e do TMS, p/ o widget de chat).

## Relacionados

- `docs/security/secrets-management.md` · [`deploy-dockerization.md`](deploy-dockerization.md) ·
  [`deploy-managed-postgres.md`](deploy-managed-postgres.md)
