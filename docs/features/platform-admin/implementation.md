# Implementação — Platform Admin & Seletor de Cliente (Multi-tenant)

> **Objetivo:** permitir que o **dono da plataforma** (admin do Nexa) selecione um
> **cliente (tenant)** — ex.: HiperTMS — e visualize/opere os dados daquele cliente,
> enquanto um **usuário comum** continua vendo apenas o próprio tenant, sem seletor.
>
> Documento para o squad de planejamento/produção adequar e executar.
> Status: proposta. Não inclui código final — descreve o que mudar, onde e em que ordem.

---

## 1. Contexto

O Nexa é multi-tenant por design (ver `CLAUDE.md` e ADR 005): `tenantId` é sempre
derivado do contexto autenticado, **nunca** do corpo da requisição nem da mensagem
do lead. O backend é a autoridade de identidade, tenant e papel.

A funcionalidade aqui é o equivalente ao **"platform-admin"** que o HiperTMS já
possui (no TMS existem `isPlatformAdmin`, rotas de platform-admin e um módulo
dedicado). Vamos replicar o conceito no Nexa.

---

## 2. Estado atual (o que JÁ existe) ✅

Boa parte da fundação já está pronta:

| Item | Situação |
|---|---|
| `tenantId` em quase todos os modelos (Contact, AiConversation, AiAction, Campaign, Seller, EmailChannel, Notification, etc.) | ✅ Já existe, com `@@index([tenantId])` |
| `User.tenantId String?` — **`null` = admin da plataforma** | ✅ Já existe (comentado no schema) |
| JWT carrega `tenantId`, `role`, `permissions`, `sellerId` | ✅ `jwt.strategy.ts` |
| `@CurrentTenant()` → `req.user?.tenantId ?? null` (do token, nunca do body — ADR 005) | ✅ `shared/decorators/current-user.decorator.ts` |
| Filtragem por `tenantId` nas queries dos serviços | ✅ Padrão já adotado |

**Conclusão:** o terreno está pronto. Falta (a) dar **nome** aos tenants, (b) um
mecanismo **protegido** de "agir como cliente" para o platform-admin, e (c) o
**seletor** no front.

---

## 3. O que FALTA (visão geral)

1. **Modelo `Tenant` (Cliente)** — hoje `tenantId` é uma string solta, sem nome.
   Para listar "HiperTMS" e clicar, precisamos de uma tabela de clientes.
2. **Resolução do "tenant efetivo" no backend** — para o platform-admin, o tenant
   passa a vir de um header controlado; para o cliente comum, continua vindo do token.
3. **Seletor de cliente no front** — visível **apenas** para o platform-admin.

---

## 4. Definições

- **Platform admin (dono):** `User.tenantId === null`. Enxerga todos os clientes e
  pode "entrar" em qualquer um.
- **Usuário de cliente:** `User.tenantId === '<id>'`. Preso ao próprio tenant.
- **Tenant efetivo (`effectiveTenantId`):** o tenant cujos dados a requisição
  enxerga. Para cliente = o do token. Para platform-admin = o selecionado.

---

## 5. Mudanças por camada

### 5.1. Banco de dados (Prisma) — **requer migration (rodar: USER)**

Criar o modelo `Tenant`:

```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String                         // "HiperTMS"
  slug      String   @unique               // "hipertms"
  status    String   @default("active")    // active | suspended
  productId String?  @map("product_id")    // opcional: vincula ao conector/produto
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("tenants")
}
```

Notas:
- **Não é obrigatório** transformar todos os `tenantId String` em FK para `Tenant`
  de uma vez (seria uma migration grande e arriscada). Recomendado: criar a tabela
  `Tenant`, popular com os tenants existentes (seed/backfill) e, num passo seguinte,
  adicionar a FK em `User` (e tabelas-chave) se o squad julgar necessário.
- Backfill: para cada `tenantId` distinto já em uso, criar um registro em `Tenant`.
- O `productId` é opcional e liga o cliente ao conector (HiperTMS) — útil pro futuro.

### 5.2. Backend (NestJS)

**a) Resolver do tenant efetivo (núcleo de segurança).**
Criar um util/guard central, ex. `resolveEffectiveTenant(user, headerTenantId)`:

```
se user.tenantId !== null  (cliente comum)
   → effectiveTenantId = user.tenantId
   → IGNORAR completamente o header (segurança)

se user.tenantId === null  (platform admin)
   → se headerTenantId presente e Tenant existe → effectiveTenantId = headerTenantId
   → senão → null (estado "nenhum cliente selecionado")
```

- Header sugerido: `X-Acting-Tenant-Id`.
- Expor via um novo decorator `@EffectiveTenant()` (ou evoluir o `@CurrentTenant()`)
  que lê o valor já resolvido por um **interceptor/guard** — nunca o controller
  lendo o header cru.
- **Toda** query/serviço que hoje usa `@CurrentTenant()` passa a usar o tenant
  efetivo. Como as queries já filtram por `tenantId`, o escopo de dados fica
  automático.

**b) Auditoria.** Registrar em `AuditLog` quando um platform-admin **entra** num
tenant (quem, qual tenant, quando, correlationId) — accountability é obrigatória.

**c) Endpoints novos (somente platform-admin):**
- `GET /admin/tenants` → lista clientes (id, name, slug, status) para o seletor.
- `GET /admin/tenants/:id` → detalhe (opcional).
- Guard: bloquear se `user.tenantId !== null` (403).

**d) Política de escrita (decisão de produto):**
- **Fase 1 (recomendado):** platform-admin em modo cliente = **somente leitura**
  (ver dados, sem disparar ações/campanhas/exclusões). Menos risco.
- **Fase 2:** liberar ações com auditoria reforçada e, se possível, confirmação.

### 5.3. Frontend (React)

- **`TenantContext`** novo: guarda `actingTenantId` (persistido em `localStorage`) e
  a lista de clientes. Só ativo quando o usuário logado é platform-admin
  (`user.tenantId == null`).
- **Axios** (`lib/api.ts`): interceptor que injeta `X-Acting-Tenant-Id` em toda
  requisição quando há cliente selecionado.
- **Seletor no topo (Layout):** dropdown "Cliente: HiperTMS ▾", **renderizado só
  para platform-admin**. Cliente comum não vê nada disso.
- Ao **trocar de cliente**, limpar caches/estado das telas e recarregar os dados
  (evita "vazar" dados do cliente anterior na tela).
- Estado "nenhum cliente selecionado" (platform-admin recém-logado): mostrar um
  passo "Selecione um cliente para começar".

---

## 6. Regras de segurança (CRÍTICAS — não negociáveis)

1. O header `X-Acting-Tenant-Id` **só** é honrado para `user.tenantId === null`.
   Para qualquer outro usuário, é **ignorado** — nunca confie no front (ADR 005).
2. A troca de tenant é decidida e validada **no backend**. O front apenas sugere.
3. `GET /admin/tenants` e afins retornam 403 para não-platform-admin.
4. Toda entrada de platform-admin num tenant vai pro `AuditLog`.
5. Validar que o `tenantId` do header existe e está `active` antes de usar.

---

## 7. Ordem de implementação sugerida

| # | Tarefa | Camada | Quem roda |
|---|---|---|---|
| 1 | Criar modelo `Tenant` + migration + seed/backfill dos tenants atuais | DB | Migration: USER |
| 2 | Resolver `effectiveTenantId` + interceptor/guard + `@EffectiveTenant()` | Backend | — |
| 3 | Trocar `@CurrentTenant()` → tenant efetivo nos serviços de leitura | Backend | — |
| 4 | `GET /admin/tenants` (guard platform-admin) + auditoria de "entrar no tenant" | Backend | — |
| 5 | `TenantContext` + interceptor axios do header | Frontend | — |
| 6 | Seletor de cliente no Layout (só platform-admin) + reset ao trocar | Frontend | — |
| 7 | Fase 2 (opcional): liberar escrita em modo cliente, com auditoria | Backend/Front | — |

---

## 8. Critérios de aceite

- [ ] Platform-admin vê o seletor e a lista de clientes (ex.: HiperTMS).
- [ ] Ao escolher um cliente, todas as telas (Suporte, Inbox, Contatos, etc.)
      passam a mostrar os dados **daquele** tenant.
- [ ] Usuário de cliente **não** vê o seletor e só acessa o próprio tenant.
- [ ] Tentativa de cliente comum forçar `X-Acting-Tenant-Id` é ignorada (continua
      vendo só o dele) — coberto por teste.
- [ ] Cada "entrada" do platform-admin num tenant gera registro em `AuditLog`.
- [ ] Trocar de cliente não vaza dados do cliente anterior na tela.

---

## 9. Casos de borda / riscos

- **Vazamento entre tenants:** mitigado porque o escopo é resolvido no backend e as
  queries já filtram por `tenantId`. Cobrir com testes de autorização.
- **Cache no front:** ao trocar de cliente, invalidar estado/React Query/etc.
- **Platform-admin sem cliente selecionado:** definir comportamento (tela de seleção
  ou visão agregada — recomendado começar pela tela de seleção).
- **Ações destrutivas em modo cliente:** começar somente-leitura (Fase 1).
- **Escala da migration:** não converter todos os `tenantId` em FK de uma vez.

---

## 10. Telas afetadas

- **Layout (topbar):** novo seletor de cliente (condicional a platform-admin).
- **Todas as telas de dados** (Suporte, Inbox, Contatos, Conhecimento, Vendedores,
  Disparo, etc.): nenhuma mudança de lógica — passam a respeitar o tenant efetivo
  automaticamente.
- **Nova (opcional):** tela "Clientes" para o platform-admin gerenciar tenants.

---

## 11. Referência

- HiperTMS: padrão `isPlatformAdmin` + rotas de platform-admin (`apps/web` do TMS).
- Nexa: `CLAUDE.md` (multi-tenant), ADR 005 (segurança/permissões), `schema.prisma`
  (`User.tenantId String?` = null para platform admin),
  `shared/decorators/current-user.decorator.ts` (`@CurrentTenant`).
