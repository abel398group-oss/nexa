# Implementação — Separação Vendas × Suporte (UI + persona de suporte)

> A Lia atende dois serviços com objetivos opostos: **Vendas** (prospect → cadastro)
> e **Suporte** (cliente ativo → resolução). O backend já roteava os dois (Router +
> `TmsLookup`, ADR 026); o que faltava era a **UI** deixar isso explícito e o suporte
> ter **tom configurável** próprio.
>
> Status: implementado · Base: ADR 015 (suporte), ADR 026 (suporte é pós-venda),
> playbook de vendas existente.

---

## 1. Contexto

A navegação misturava os dois serviços: um único Inbox listava conversas de venda e
tickets de suporte juntos, e só havia "Playbook de Vendas" — o suporte tinha tom fixo
no código (`resolution-agent`). Esta entrega separa na interface e dá ao suporte uma
persona editável, sem mexer no pipeline da Lia.

## 2. Mudanças por camada

### 2.1. Banco (Prisma) — requer migration (rodar: USER)

- `support_persona` em `sales_playbook` (`SalesPlaybook.supportPersona`, default `""`).
  SQL idempotente: `apps/backend/prisma/add_support_persona.sql`.
  Aplicar com `prisma migrate deploy` (prod) ou `npx prisma db execute --file ...` e
  depois `pnpm db:generate`.

### 2.2. Backend (NestJS)

- `PlaybookConfig`/`PlaybookService` (`application/playbook/`): novo campo
  `supportPersona` em get/update/defaults. O PUT continua parcial (não afeta os
  campos de venda).
- `PlaybookController` (`presentation/http/playbook/`): `supportPersona` no
  `UpdatePlaybookDto` (necessário pelo `whitelist` do ValidationPipe).
- `ResolutionAgentService` (`application/agents/`): injeta `PlaybookService` e
  insere `supportPersona` no system prompt **logo após a identidade da Lia**, antes
  das regras fixas. O tom é editável; **os guardrails permanecem fixos e prevalecem**
  (anti-alucinação, usar só KB+diagnóstico, fiscal/financeiro incerto → escala humano).

### 2.3. Frontend (React)

- Menu (`components/Layout.tsx`): reagrupado em **Vendas** (Inbox de Vendas, Contatos,
  Disparo, Saúde dos números, Vendedores, Playbook de Vendas) e **Suporte** (Inbox de
  Suporte, Config de Suporte), mais Conhecimento e Administração.
- Split do Inbox: heurística única em `lib/conversation.ts` (`isSupportTicket` = tem
  categoria, ou `cliente_ativo`, ou `escalated`). O Inbox de Vendas exclui tickets; o
  Inbox de Suporte (`SupportPage`) só mostra tickets — ambos usam o mesmo helper.
- `SupportConfigPage` (`/support/config`): edita só `supportPersona` via os endpoints
  do playbook; permissão `ai_control`; lazy + `PermissionRoute`.

## 3. Deploy

- Migration `support_persona` aplicada + `db:generate` (ver `docs/infra/deploy.md`).
- Nenhum env novo nesta entrega (o `PORTAL_JWT_SECRET` é da feature do portal).

## 4. Critérios de aceite

- [ ] Menu mostra grupos Vendas e Suporte distintos.
- [ ] Conversa de cliente ativo / com categoria aparece **só** no Inbox de Suporte.
- [ ] Editar "Config de Suporte" muda o tom da Lia de suporte na próxima resposta.
- [ ] Persona de suporte **não** afrouxa os guardrails (fiscal/financeiro incerto
      continua escalando).
- [ ] Persona de vendas e de suporte são independentes (uma não vaza na outra).

## 5. Referência

- ADR 015 — Módulo de Suporte · ADR 026 — Suporte é pós-venda
- Código: `application/playbook/*` · `application/agents/resolution-agent.service.ts` ·
  `apps/frontend/src/lib/conversation.ts` · `pages/SupportConfigPage.tsx` ·
  `components/Layout.tsx`
