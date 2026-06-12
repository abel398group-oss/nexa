# Gestão de Segredos — Nexa

> Como segredos são armazenados, injetados e nunca expostos. Liga ADR 005 D6 e
> ADR 013 (Environment Strategy).

## Princípios

- **Fora do repositório**: nenhum segredo no Git. `.env` está no `.gitignore`;
  o repo versiona apenas `.env.example` (sem valores reais).
- **Por ambiente**: chaves distintas em dev / staging / production. **Nunca**
  reusar a mesma chave entre ambientes (Anthropic, WAHA, encryption, DB).
- **Nunca logar**: JWT, API keys, credenciais ou payloads sensíveis (ADR 005 D6).
  O logger pino serializa apenas método/URL/status, não o corpo.

## Onde ficam

| Ambiente | Armazenamento |
|---|---|
| **dev** | `.env` local (não commitado) |
| **staging / production** | Docker Secrets → DigitalOcean Secrets |

## Segredos e variáveis críticas (lista canônica)

> Esta é a **lista de referência** do projeto. Outros docs (`infra/deploy.md`,
> `features/connectors/prd.md`) apontam para cá em vez de manter listas paralelas.

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL do Nexa (por ambiente) |
| `ANTHROPIC_API_KEY` | Chave Claude (a Lia) — nunca commitar |
| `AI_MODEL` | Modelo da Lia (default `claude-haiku-4-5-20251001`) |
| `AI_AUTONOMY_ENABLED` | Default do kill switch de autonomia |
| `TMS_DB_URL` | Banco HiperTMS (read-only, acesso direto p/ campanhas/lookup) |
| `TMS_API_BASE_URL` | URL base da API do TMS (conector) |
| `TMS_SERVICE_TOKEN` | Token de autenticação do conector TMS |
| `WAHA_API_URL` | Gateway WhatsApp (WAHA) |
| `NEXA_PUBLIC_URL` | URL pública (webhooks — ngrok/cloudflare/domínio) |
| `CORS_ORIGINS` | Origens permitidas (CSV) |
| `JWT`/`encryption` keys | Auth e criptografia (distintas por ambiente) |

> `AI_MODEL` não é segredo, mas entra aqui por ser configuração de ambiente
> relevante. Os preços (`AI_PRICE_IN`/`AI_PRICE_OUT`) são opcionais.

> O cliente Anthropic trata `ANTHROPIC_API_KEY` ausente/placeholder (`xxxxx`)
> como "não configurado" e degrada com segurança, sem vazar a chave.

## Rotação e incidentes

- Rotacionar chaves periodicamente e imediatamente após qualquer suspeita de
  vazamento; como são isoladas por ambiente, o raio de impacto é contido.
- Atualizar o segredo no secret manager do ambiente e reiniciar o serviço — sem
  tocar no código.

## Relacionados

- ADR 005 — Segurança e Permissões · ADR 013 — Environment Strategy
- `docs/security/security-overview.md` · `docs/infra/ci-cd.md` · `.env.example`
