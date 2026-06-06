# ADR 013 — Environment Strategy (ambientes, branches, deploy)

**Status:** Aceito · **Data:** 2026-06

## Contexto
Sem separação de ambientes definida cedo, o primeiro deploy vira caos (secrets misturados,
dados de teste em produção, deploy quebrado). Decidir antes do Sprint 1.

## Decisão

### Ambientes
| Ambiente | Uso | Dados |
|---|---|---|
| **dev** | Desenvolvimento local | Fake/seed |
| **staging** | Homologação (espelha prod) | Cópia anonimizada |
| **production** | Clientes reais | Reais |

### Branches (Git)
```
main        → production (deploy automático após CI verde)
staging     → staging
feature/*   → dev (PR para staging)
```

### Bancos (isolados por ambiente)
- Cada ambiente tem seu PostgreSQL e Redis próprios (nunca compartilhar)
- `DATABASE_URL` por ambiente (via secrets)

### Secrets por ambiente
- **dev:** `.env` local (não commitado)
- **staging/prod:** Docker Secrets → DigitalOcean Secrets
- Nunca reusar a mesma chave entre ambientes (Anthropic/WAHA/encryption)

### Deploy
- CI/CD: build + test + migrate deploy + start
- `prisma migrate deploy` (nunca `migrate dev` em staging/prod)
- Rollback: manter versão anterior pronta

### Domínios (exemplo)
```
dev       → localhost
staging   → staging.leads.hipervias.com
production→ leads.hipervias.com
```

## Consequências
- (+) Deploy previsível; sem dado de teste em produção; secrets isolados
- (−) Mais infra para manter (3 bancos) — aceitável e padrão de mercado

## Pendências (preencher na implementação)
- Provedor de CI (GitHub Actions?) · estratégia de migração de secrets
- Confirmar se MVP n8n fica em ambiente separado durante a transição
