# Segurança — Referências

Pontos de entrada de segurança no código e na documentação.

## Documentos

- `docs/security/security-overview.md` — pilares e controles.
- `docs/security/secrets-management.md` — segredos por ambiente.
- `docs/ai/ai-guardrails.md` — limites da IA, action policy, kill switch.
- ADR 005 — Segurança e Permissões (RBAC, LGPD, retenção).
- ADR 012 — Segurança da IA & Prompt Injection.
- ADR 013 — Environment Strategy (isolamento por ambiente).

## Código

| Tema | Caminho |
|---|---|
| Bootstrap seguro (helmet, CORS, ValidationPipe, cookies) | `apps/backend/src/main.ts` |
| Rate limiting, logger c/ correlationId, guard global | `apps/backend/src/app.module.ts` |
| JWT (cookie HttpOnly) | `apps/backend/src/shared/auth/jwt.strategy.ts`, `jwt-auth.guard.ts` |
| RBAC / permissões | `apps/backend/src/shared/auth/permissions.guard.ts` (`@RequirePerm`) |
| Kill switch de autonomia | `apps/backend/src/shared/governance/autonomy.service.ts` |
| Action policy (ações que exigem humano) | `apps/backend/src/application/actions/action-policy.ts` |
| Auditoria | `apps/backend/src/shared/audit/` |
| correlationId | `apps/backend/src/shared/middleware/correlation-id.middleware.ts` |
