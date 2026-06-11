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

## Segredos críticos

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL do Nexa (por ambiente) |
| `ANTHROPIC_API_KEY` | Chave Claude (a Lia) — nunca commitar |
| `TMS_DB_URL` | Banco HiperTMS (read-only, via conector) |
| `WAHA_API_URL` | Gateway WhatsApp (WAHA) |
| `CORS_ORIGINS` | Origens permitidas (CSV) |
| `AI_AUTONOMY_ENABLED` | Default do kill switch de autonomia |
| `JWT`/`encryption` keys | Auth e criptografia (distintas por ambiente) |

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
