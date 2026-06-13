# ADR 025 — Platform Admin, Atuação Multi-tenant (acting-as) e Break-glass

**Status:** Aceito (implementado) · **Data:** 2026-06

> Consolida a decisão de arquitetura por trás do módulo de Platform Admin. O
> detalhamento de produto/fases vive em `docs/features/platform-admin/`
> (STATUS.md + implementation.md). Esta ADR registra os invariantes de segurança.

## Contexto

A plataforma é multi-tenant. Além dos usuários de cada cliente, existe um **admin
da plataforma** (operação Hipervias) que precisa dar suporte, configurar e
diagnosticar dentro de um cliente específico — sem furar o isolamento por tenant
(ADR 005) nem permitir ações destrutivas acidentais em produção.

O desafio: como deixar o admin da plataforma "entrar" num cliente de forma
controlada, auditável e reversível, mantendo a regra de ouro de que o cliente
comum nunca escapa do próprio tenant.

## Decisão

### D1 — Identidade do platform admin
O admin da plataforma é o usuário com `tenantId === null`. `PlatformAdminGuard`
(`shared/auth/platform-admin.guard.ts`) libera rotas exclusivas de plataforma
apenas para ele; qualquer outro usuário recebe 403.

### D2 — Tenant efetivo resolvido por interceptor
Um `EffectiveTenantInterceptor` global (`APP_INTERCEPTOR`,
`shared/tenant/effective-tenant.interceptor.ts`) resolve `req.effectiveTenantId`
**antes** do handler:

- **Cliente comum:** tenant vem **sempre** do token; o header de atuação é
  **ignorado** (reforça ADR 005 D2 — tenant nunca vem do body/header do cliente).
- **Platform admin:** só atua num cliente via header validado
  `x-acting-tenant-id`. O tenant precisa existir e estar `active`, senão 403.
  Sem header → nenhum cliente selecionado (sem efeito).

### D3 — Escrita auditada em modo cliente
Quando o admin atua como um cliente, operações de escrita são **permitidas, porém
auditadas** (`AuditService`), com `req.isActingAsTenant = true`.

### D4 — Break-glass para ações irreversíveis
Ações irreversíveis em modo cliente são **bloqueadas por padrão** e só liberadas
com override explícito `x-acting-override` ("quebra de vidro"). Definição em
`isDestructiveAction(method, url)`: qualquer `DELETE` e o disparo de campanha
(`POST /campaigns/:id/start`).

### D5 — Validação de segredos no boot (hardening relacionado)
`validateEnv()` (`shared/config/validate-env.ts`) roda no `main.ts` e, em
produção, **aborta o boot** se um segredo crítico estiver ausente, fraco ou com
valor placeholder. Evita subir a plataforma (que agora cruza tenants) com
credencial insegura.

## Alternativas consideradas

- **A1 — Login separado por tenant para o admin** (rejeitada): péssima UX para
  suporte e multiplicaria credenciais; não dá trilha unificada de auditoria.
- **A2 — Admin com acesso irrestrito a todos os tenants sem gate** (rejeitada):
  viola least-privilege e abre porta a ação destrutiva acidental em produção.
- **A3 — Tenant efetivo decidido em cada serviço** (rejeitada): espalharia a
  regra e abriria brechas; centralizar no interceptor garante o invariante.

## Consequências

- **(+)** Isolamento por tenant preservado; cliente comum nunca escapa do token.
- **(+)** Suporte/diagnóstico do admin com trilha de auditoria e freio para ações
  irreversíveis (break-glass).
- **(+)** Boot seguro em produção (validateEnv).
- **(−)** Toda rota sensível precisa considerar `effectiveTenantId` (não o token
  do admin); exige disciplina e testes (há specs do guard e do interceptor).

## Referências

- `docs/features/platform-admin/` (STATUS.md, implementation.md)
- `docs/security/security-overview.md` · ADR 005 (Segurança/Permissões) · ADR 012
- Código: `shared/auth/platform-admin.guard.ts`,
  `shared/tenant/effective-tenant.interceptor.ts`, `shared/config/validate-env.ts`

## Histórico de revisões

| Versão | Data | Alteração | Autor |
|--------|------|-----------|-------|
| 1.0 | 2026-06 | Criação (consolida o módulo de platform admin) | — |
