# Deploy — Nexa

## Ambiente local

```
# Backend (porta 3001)
cd apps/backend && npm run start:dev

# Frontend (porta 5174)
cd apps/frontend && npm run dev
```

Atalho: `Iniciar Nexa.bat` na área de trabalho.

## Dependências locais

| Serviço | Porta | Observação |
|---|---|---|
| PostgreSQL (Nexa) | 5433 | Docker |
| Redis | 6380 | Docker |
| WAHA (WhatsApp) | 3018 | Docker |

## Variáveis de ambiente críticas

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL do Nexa |
| `ANTHROPIC_API_KEY` | Chave Claude (nunca commitar) |
| `TMS_DB_URL` | Banco HiperTMS (read-only) |
| `WAHA_API_URL` | Gateway WhatsApp |
| `AI_AUTONOMY_ENABLED` | Kill switch da IA |
| `NEXA_PUBLIC_URL` | URL pública (ngrok/cloudflare para webhooks) |

## Deploy DigitalOcean (pendente)

- Rodar em App Platform ou Droplet
- Rotacionar `ANTHROPIC_API_KEY` no deploy
- Configurar `NEXA_PUBLIC_URL` com domínio definitivo
- `TMS_DB_URL` já aponta para DigitalOcean (produção)
