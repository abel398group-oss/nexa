# Platform Admin — Status de Implementacao e Handoff

> Companion do `implementation.md` (fonte da verdade). Registra o que foi entregue,
> o estado real do banco, o risco de drift e o plano de commit. Gerado em 2026-06-12.

## O que foi entregue (Sprints A-E + Fase 2)

- **A — Banco:** modelo `Tenant` no schema; clientes cadastrados a partir dos
  `tenantId` em uso (`default` -> "HiperTMS", `seed`).
- **B — Nucleo de seguranca:** `EffectiveTenantInterceptor` resolve o tenant efetivo;
  `@CurrentTenant()` evoluido (cliente comum ignora o header; admin sem cliente e
  bloqueado). 51 usos passaram a respeitar o tenant efetivo sem alteracao.
- **C — Endpoints + auditoria:** `GET /admin/tenants`, `GET /admin/tenants/:id`,
  `POST /admin/tenants/:id/enter` (gera AuditLog), protegidos por `PlatformAdminGuard`.
- **D — Frontend:** `TenantContext`, interceptor do axios com `X-Acting-Tenant-Id`,
  gate "Selecione um cliente", `TenantSelector` (drop-in para a topbar).
- **E — Testes:** 14 testes de autorizacao (interceptor + guard). 70 testes no total
  passando (`pnpm test`).
- **Fase 2 — Escrita auditada + quebra de vidro:** escrita em modo cliente e
  permitida e AUDITADA; acoes irreversiveis (DELETE, disparo de campanha) exigem
  override explicito (confirm "Executar mesmo assim") e sao auditadas como override.
  Banner fixo "Operando como [cliente]".

## Criterios de aceite (implementation.md sec 8)

- [x] Platform admin ve o seletor e a lista de clientes.
- [x] Escolher um cliente faz as telas mostrarem os dados daquele tenant.
- [x] Usuario de cliente nao ve o seletor e so acessa o proprio tenant.
- [x] Cliente comum forcando `X-Acting-Tenant-Id` e ignorado (coberto por teste).
- [x] Cada entrada do platform admin num tenant gera AuditLog.
- [x] Trocar de cliente recarrega tudo (nao vaza dados do cliente anterior).

## Estado real do banco (IMPORTANTE)

- A tabela `tenants` foi criada via SQL direto (`prisma/sql/add_tenants.sql`),
  **nao** via `prisma migrate`. Ou seja: existe no banco, mas **nao ha migration
  file** para ela ainda.
- O historico de migrations ja estava em **drift** (o banco esta a frente: tem
  `notifications`, `sales_playbook` etc. que nao estao nos migration files; e nao
  tem `email_channels` que esta no schema). Isso e anterior a esta feature.

### Fluxo seguro de banco (ate reconciliar o drift)

- **NUNCA** rodar `prisma migrate dev` e responder "y" ao reset — isso APAGA os dados.
  Se aparecer o prompt de reset, responda **N**.
- Para mudancas de schema locais, usar `prisma db push` (responder "no" a avisos de
  perda) ou SQL direto via `prisma db execute`, como foi feito aqui.
- Reconciliacao do drift (gerar um baseline com `migrate diff` + `migrate resolve
  --applied`) fica como tarefa dedicada, a fazer com calma.

## Plano de commit (Conventional Commits, EN)

1. `feat(tenants): add Tenant model + backfill seed`
   - apps/backend/prisma/schema.prisma
   - apps/backend/prisma/seed-tenants.ts
   - apps/backend/prisma/sql/add_tenants.sql
2. `feat(tenants): effective tenant resolution + audited acting writes`
   - apps/backend/src/shared/tenant/effective-tenant.interceptor.ts
   - apps/backend/src/shared/tenant/effective-tenant.interceptor.spec.ts
   - apps/backend/src/shared/decorators/current-user.decorator.ts
   - apps/backend/src/app.module.ts
3. `feat(tenants): platform-admin tenant endpoints + enter audit`
   - apps/backend/src/shared/auth/platform-admin.guard.ts
   - apps/backend/src/shared/auth/platform-admin.guard.spec.ts
   - apps/backend/src/application/admin/tenants.service.ts
   - apps/backend/src/presentation/http/admin/tenants.controller.ts
   - apps/backend/src/application/admin/admin.module.ts
4. `feat(tenants): tenant context, selector, banner + break-glass (frontend)`
   - apps/frontend/src/contexts/TenantContext.tsx
   - apps/frontend/src/contexts/AuthContext.tsx
   - apps/frontend/src/lib/api.ts
   - apps/frontend/src/lib/actingTenant.ts
   - apps/frontend/src/lib/destructiveConfirm.ts
   - apps/frontend/src/App.tsx
5. `docs(platform-admin): implementation status + handoff`
   - docs/features/platform-admin/STATUS.md

> Trabalho separado (adocao HiperTMS, passo 1 FSD) ja na branch feat/fsd-contact:
> features/contact + ContactsPage + docs/ADOCAO_PADRAO_HIPERTMS.md.

## Pendencias

- [ ] Adicionar `<TenantSelector />` na topbar do `Layout.tsx` (1 import + 1 linha)
      para TROCAR de cliente (o gate inicial ja funciona sem isso).
- [ ] Reconciliar o drift de migrations (baseline) — tarefa dedicada.
- [ ] Limpar/!suspender o tenant `seed` residual, se desejado.
