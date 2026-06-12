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

## Deploy DigitalOcean (pendente)

- Rodar em App Platform ou Droplet
- Rotacionar `ANTHROPIC_API_KEY` no deploy
- Configurar `NEXA_PUBLIC_URL` com domínio definitivo
- `TMS_DB_URL` já aponta para DigitalOcean (produção)
