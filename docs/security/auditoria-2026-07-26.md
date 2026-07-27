# Auditoria de segurança — Nexa (2026-07-26)

> Pedida pelo Abel com foco em: (1) segredo/token no frontend, (2) isolamento
> entre clientes (RLS). Feita lendo o código (file:line), não os docs.

## Resumo executivo

| Área | Situação |
|---|---|
| Segredos no frontend | ✅ **limpo** — nenhum |
| Token de sessão | ✅ cookie **HttpOnly** (JS não lê) |
| Isolamento por tenant | ✅ forte (na aplicação; sem RLS no Postgres — decisão consciente) |
| Defesas de borda | ✅ Helmet, CORS restrito, rate limit, validação estrita |
| Comparação de segredos | ⚠️→✅ **corrigido nesta auditoria** (timing attack) |
| Token legado duplicado | ⚠️ **pendente** — depende do TMS (ver prompt) |

## 1. Segredos no frontend — LIMPO ✅

Varredura em `apps/frontend/src` por `ANTHROPIC_API_KEY`, `sk-ant-`, `JWT_SECRET`,
`WAHA_API_KEY`, `SERVICE_TOKEN`, `SMTP_PASS`, `DATABASE_URL`, `PORTAL_JWT`:
**zero ocorrências**.

- Único `import.meta.env` exposto: `VITE_SENTRY_DSN` (`main.tsx:8`) — DSN de
  Sentry é público por design.
- `.env` do frontend está no `.gitignore`.
- **`localStorage` NÃO guarda token** — só preferência de UI (tema, menu,
  tour). O JWT vai em **cookie HttpOnly** (`main.ts:31,37`), inacessível a
  JavaScript: protege contra roubo de sessão via XSS.

## 2. Isolamento entre clientes (o "RLS") — FORTE ✅

**Não há Row Level Security no Postgres** — e a decisão é consciente: RLS exigiria
setar o tenant por conexão a cada request, o que briga com o pool de conexões
(e o pool do DO está ativo). O isolamento é feito na aplicação:

- `tenantId` **nunca** vem do corpo da requisição — sempre do token autenticado
  (`shared/decorators/current-user.decorator.ts:11-29`, ADR 005).
- Platform admin só age num cliente via header validado
  (`EffectiveTenantInterceptor`); **sem cliente selecionado → 403**.
- Queries de dados de cliente filtram por `tenantId`.

**Disciplina exigida:** toda query nova precisa do `tenantId` no `where`. Jobs
internos que varrem todos os tenants (ex.: `ticket-intelligence`) são exceção
legítima — rodam fora de request, sem usuário.

## 3. Defesas de borda ✅

Helmet, CORS restrito por domínio (`CORS_ORIGINS`), rate limit global
(ThrottlerGuard), `ValidationPipe` com `forbidNonWhitelisted`, senha SMTP
criptografada (AES-256-GCM), e `validateEnv` que **aborta o boot em produção**
se faltar segredo obrigatório.

Rotas públicas (sem JWT) são todas de integração e **têm autenticação própria**:
webhook WAHA (`WAHA_WEBHOOK_TOKEN`), handoff/portal (`TMS_SERVICE_TOKEN`),
plan-sync (`TMS_SYNC_SECRET`), health (sem dado sensível).

## 4. Corrigido nesta auditoria ✅

**Timing attack na comparação de tokens.** `===`/`!==` faz short-circuit no
primeiro byte diferente e vaza, pelo tempo de resposta, quanto do segredo o
atacante acertou. O repo já tinha o helper `safeEqual` (`shared/utils/safe-compare.ts`,
B1 da auditoria 2026-07-08), mas dois pontos ficaram de fora:

- `shared/guards/service-token.guard.ts` — token principal E alias legado
- `application/handoff/handoff.service.ts:37` — validação do handoff

Ambos passaram a usar `safeEqual`. Cobertura nova: `service-token.guard.spec.ts`
(7 casos, incluindo token de mesmo tamanho e fail-closed sem env).

## 5. Pendente (depende do TMS) ⚠️

**Alias `NEXA_SERVICE_TOKEN` ainda aceito.** O guard aceita DOIS segredos:
`TMS_SERVICE_TOKEN` (oficial) e `NEXA_SERVICE_TOKEN` (marcado DEPRECADO no
código, mantido para permitir rotação sem quebrar o TMS). Dois segredos válidos
= dobro de superfície de ataque e de risco de vazamento.

**Ação:** confirmar com o squad do TMS se todas as chamadas já usam
`TMS_SERVICE_TOKEN`; se sim, remover o alias do guard. Prompt de handoff
entregue ao Abel em 2026-07-26.

## 6. Observação menor

`handoff.service.ts:33-35`: fora de produção, se `TMS_SERVICE_TOKEN` não estiver
setado, aceita qualquer token (com warning no log). Em produção é **fail-closed**.
Só vira risco se algum ambiente exposto rodar sem `NODE_ENV=production` — vale
conferir no deploy (hoje o `.env` de produção tem `NODE_ENV=production` ✅).
