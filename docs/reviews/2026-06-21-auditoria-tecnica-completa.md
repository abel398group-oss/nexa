# Auditoria Técnica Completa — Nexa

> **Data:** 2026-06-21
> **Realizada por:** Analista Supremo (full-audit — 7 fases)
> **Escopo:** Codebase completo — `apps/backend` + `apps/frontend` + `packages/`
> **Cobertura:** 47 arquivos lidos, buscas de padrão em todo o `src/`, 845 linhas de schema Prisma

---

## Resultado — Matriz de Risco

| Área         | Críticos | Altos | Médios | Baixos |
|--------------|----------|-------|--------|--------|
| Segurança    | 1        | 2     | 4      | 2      |
| Bugs         | 0        | 2     | 4      | 1      |
| Arquitetura  | 0        | 1     | 4      | 1      |
| Performance  | 0        | 2     | 3      | 1      |
| Qualidade    | 0        | 1     | 2      | 2      |
| **TOTAL**    | **1**    | **8** | **17** | **7**  |

---

## Ações imediatas (antes do próximo deploy)

| # | ID | Arquivo | Ação |
|---|----|---------|------|
| 1 | SEC-001 | `.env` raiz | Revogar e regenerar `ANTHROPIC_API_KEY` — ⚠️ **pendente intencionalmente** (ver nota abaixo) |
| 2 | SEC-003 | `portal-session.service.ts:17` | Adicionar `{ audience: 'portal' }` no `sign()` — portal quebrado |
| 3 | SEC-002 | `auth.module.ts:14`, `jwt.strategy.ts:17` | Remover fallback `?? 'dev-secret-trocar'` do JWT |

> ⚠️ **SEC-001 — API key Anthropic:** A chave atual no `.env` local será rotacionada
> ao final do ciclo de desenvolvimento ativo. **Não commitar o `.env` por nenhum motivo
> antes da troca.** Responsável: Abel. Ver `docs/security/secrets-management.md`.

---

## Findings completos

O relatório detalhado com evidência (arquivo:linha), impacto e exemplo de correção
para cada um dos 33 findings está em:

```
docs/reviews/2026-06-21-fixes-auditoria.md
```

---

## Pontos positivos identificados

- Kill switch de IA (ADR 012) persistido em banco — sobrevive restart
- Supervisora com prompt injection detection e fallback conservador (fail-closed)
- LGPD tratada: opt-out, anonimização por prazo, rodapé obrigatório
- Multi-tenant correto: `tenantId` derivado do token em 100% das queries
- Platform admin com auditoria e glass-breaking (`x-acting-override`)
- `validateEnv()` abortando boot em produção com configuração insegura
- Idempotência no sender (claim atômico `queued→sending`)
- HMAC-SHA256 nos webhooks outbound com secret criptografado (AES-256-GCM)
- Refresh token rotation com bcrypt no banco + revogação por sessão
- Documentação (28 ADRs + docs estruturados) acima da média para o estágio do projeto

---

## ADRs e docs afetados

| Finding | Doc afetado |
|---------|-------------|
| SEC-002 (JWT fallback) | `docs/security/security-overview.md` — já descreve que `validateEnv` bloqueia |
| SEC-003 (portal JWT audience) | `docs/features/support-portal/implementation.md` — mencionar fix |
| BUG-001 (sender state multi-instance) | `docs/infra/escalabilidade-nexa.md` — pré-requisito para escalar |
| BUG-002 (webhook retry in-memory) | `docs/features/` webhooks — TODO já documentado no código |
| ARCH-001 (ConversationAgentService god object) | `docs/architecture/` — candidato a ADR |
| QUAL-001 (zero testes nos serviços críticos) | `docs/quality/plano-testes.md` — atualizar cobertura alvo |

---

## Relacionados

- `docs/security/secrets-management.md`
- `docs/security/security-overview.md`
- `docs/infra/escalabilidade-nexa.md`
- `docs/quality/plano-testes.md`
- `docs/reviews/2026-06-21-fixes-auditoria.md` ← guia de correção para o squad
