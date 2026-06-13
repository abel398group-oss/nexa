# Segurança — Visão Geral (Nexa)

> Pilares de segurança do Nexa. Decisões em **ADR 005** (RBAC/LGPD/Retenção) e
> **ADR 012** (Segurança da IA & Prompt Injection). Implementação em
> `main.ts`, `app.module.ts` e `shared/auth/`.

## Objetivo

Proteger uma plataforma SaaS multi-tenant em que uma IA toca dados pessoais,
financeiros e de acesso. Segurança é requisito de design, não camada posterior.

## Pilares

- **Tenant isolation** como regra padrão: `tenantId` deriva do contexto
  autenticado, **nunca** do body ou da fala do lead (ADR 005 D2).
- **Least privilege**: permissões explícitas por recurso/ação (RBAC + `@RequirePerm`).
- **Backend como autoridade**: a IA solicita; o backend valida identidade, tenant,
  perfil e executa (regra de ouro, ADR 005 / ADR 012).
- **Segredos fora do repositório**: `.env`/secret manager (ver `secrets-management.md`).

## Controles implementados (backend)

Configurados em `apps/backend/src/main.ts` e `app.module.ts`:

- **Auth**: JWT em **cookie HttpOnly** (`shared/auth/jwt.strategy.ts`,
  `jwt-auth.guard.ts`), `cookie-parser`.
- **RBAC / permissões**: `PermissionsGuard` + `@RequirePerm('...')`; `admin` passa
  sempre, demais perfis precisam da permissão explícita.
- **Rate limiting**: `@nestjs/throttler`, 100 req/min por IP, guard global.
- **Headers**: Helmet (HSTS, X-Frame, nosniff). CSP desativado apenas para não
  quebrar o Swagger UI.
- **CORS restrito**: apenas origens em `CORS_ORIGINS`, com `credentials: true`.
- **Validação**: `ValidationPipe` com `whitelist + forbidNonWhitelisted` →
  proteção contra mass-assignment.
- **Prefixo global** `/api`; Swagger desativado em produção.
- **Observabilidade**: logging estruturado (pino) com `correlationId` por request
  (`shared/middleware/correlation-id.middleware.ts`); auditoria em `shared/audit/`.

## Perfis (RBAC — ADR 005 D1)

| Perfil | Pode |
|---|---|
| Admin | tudo |
| Gestor | operação |
| Operacional | uso do sistema |
| Financeiro | cobranças |
| IA | read-only (solicita; backend executa conforme o perfil do solicitante) |

## Platform Admin e atuação multi-tenant (acting-as)

O **admin da plataforma** (`User.tenantId === null`) opera acima dos tenants.
Dois controles garantem isolamento e auditoria:

- **`PlatformAdminGuard`** (`shared/auth/platform-admin.guard.ts`) — libera apenas
  rotas de plataforma para quem não tem tenant; demais usuários recebem 403.
- **`EffectiveTenantInterceptor`** (`shared/tenant/effective-tenant.interceptor.ts`,
  registrado como `APP_INTERCEPTOR`) — resolve o **tenant efetivo** antes do handler:
  - Cliente comum: `tenantId` vem **sempre** do token; o header é ignorado (ADR 005 D2).
  - Platform admin: só atua num cliente via header validado `x-acting-tenant-id`
    (tenant precisa existir e estar `active`).
  - Escrita em modo cliente é **permitida porém auditada**; ações **irreversíveis**
    (DELETE, disparar campanha) exigem override explícito `x-acting-override`
    — a "quebra de vidro".

Decisão consolidada em **ADR 025**; detalhes e fases em
`docs/features/platform-admin/` (STATUS e implementation).

## Validação de ambiente no boot

`validateEnv()` (`shared/config/validate-env.ts`) roda no início do `main.ts`. Em
**produção**, aborta o boot se um segredo crítico (`DATABASE_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `ANTHROPIC_API_KEY`, `WAHA_WEBHOOK_TOKEN`) estiver ausente,
fraco ou ainda com valor placeholder do `.env.example`. Em dev, apenas avisa.
Evita subir em produção com chave insegura.

## Segurança da IA

Validação de entrada (prompt injection) e saída (alucinação/LGPD/tom) pelo
Supervisor; ações irreversíveis exigem humano; kill switch de autonomia. Detalhes
em `docs/ai/ai-guardrails.md` e ADR 012.

## LGPD e retenção (ADR 005 D4/D5)

Conversas, memória e health score são dado pessoal. Direitos de exclusão,
exportação, consentimento e anonimização. Retenção: mensagens 24m, auditoria 60m,
financeiro conforme legislação; após o prazo, anonimizar/expurgar (`audit_retention`).

## Ambientes e isolamento (ADR 013)

dev / staging / production têm bancos e segredos isolados; nunca compartilhar
chave entre ambientes; staging usa cópia anonimizada de dados (ver
`docs/infra/ci-cd.md` e `secrets-management.md`).

## Relacionados

- ADR 005 — Segurança e Permissões · ADR 012 — Segurança da IA · ADR 013 — Environment
- `docs/security/secrets-management.md` · `docs/ai/ai-guardrails.md`
- `docs/api/api-standards.md` · `docs/api/error-handling.md`
