# System Overview — Nexa

> Visão geral da plataforma. Para o contexto externo (quem usa e com o que integra) ver
> `docs/architecture/c4-context.md`; para o detalhamento interno ver `c4-container.md`
> e `docs/architecture/codebase-structure.md`.

**Status:** Fase 4 — Produção (plataforma completa em operação local; deploy DigitalOcean em curso)
**Última atualização:** 2026-06

---

## 1. Propósito

**Nexa** é uma plataforma SaaS multi-tenant de automação comercial e suporte B2B com IA. O núcleo é
a **Lia** — assistente de IA que opera sobre WhatsApp (e e-mail) para:

1. **Vender** o HiperTMS: qualificar leads, recomendar plano, conduzir até o cadastro.
2. **Suportar** clientes TMS: responder dúvidas (CT-e, MDF-e, precificação) via WhatsApp e portal web.

Princípio inviolável: **a IA conversa e recomenda; o backend decide e executa.**

---

## 2. Arquitetura de alto nível

```
┌─────────────────────────────────────────────────────────────┐
│                      NEXA PLATFORM                           │
│                                                              │
│  ┌────────────────────┐    ┌──────────────────────────────┐ │
│  │   Frontend (React) │    │       Backend (NestJS)        │ │
│  │   :5174 / web      │◄──►│       :3001 / /api            │ │
│  │   Painel operador  │    │   application + presentation  │ │
│  └────────────────────┘    │   + infra + shared            │ │
│                            └──────────┬───────────────────┘ │
│                                       │                      │
│                  ┌────────────────────┼─────────────┐       │
│                  │                    │             │        │
│           ┌──────▼──────┐   ┌────────▼──────┐ ┌───▼──────┐ │
│           │ PostgreSQL  │   │    Redis       │ │  Prisma  │ │
│           │ 16 (pgvec.) │   │    :6380       │ │  ORM     │ │
│           │ :5433       │   └────────────────┘ └──────────┘ │
│           └─────────────┘                                    │
└─────────────────────────┬───────────────────────────────────┘
                          │ integrações externas
         ┌────────────────┼─────────────────────┐
         │                │                     │
  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────────▼──────────┐
  │    WAHA     │  │  Anthropic  │  │      HiperTMS        │
  │ WhatsApp GW │  │ (Claude AI) │  │  (Connector read +   │
  │  :3018      │  │  Haiku API  │  │   ações via backend) │
  └─────────────┘  └─────────────┘  └─────────────────────┘
```

---

## 3. Componentes

### 3.1 Backend — NestJS (`apps/backend`)

Arquitetura em camadas (DDD-influenciada):

- **`application/<feature>/`** — serviços e regras de negócio:
  - `agents/` — Router, Sales, Support, Diagnostic, Resolution, Escalation,
    CaseClassifier, Conversation, Supervisor
  - `actions/` — action-policy (IA solicita; backend executa)
  - `connectors/` — interface plugável + HiperTMSConnector
  - `contacts/`, `conversations/`, `events/`, `knowledge/`, `playbook/`
  - `handoff/`, `followup/`, `sellers/`, `sender/` (campanhas), `email/`, `whatsapp/`
  - `metrics/`, `notifications/`, `opportunities/` (pipeline de vendas)
  - `portal/` — sessão + chamados do Portal de Suporte
  - `auth/`, `users/`, `admin/`
- **`presentation/http/<feature>/`** — controllers + DTOs (prefixo `/api`)
- **`presentation/ws/`** — WebSocket (inbox em tempo real, socket.io)
- **`infra/prisma/`** — PrismaService; **`infra/tms/`** — leitura do HiperTMS
- **`shared/`** — transversais: ai (Anthropic client), governance (kill switch),
  auth (JWT + RBAC + PlatformAdminGuard), tenant (EffectiveTenantInterceptor),
  config (validateEnv), audit, middleware (correlationId), dto, waha, decorators

### 3.2 Frontend — React (`apps/frontend`)

React 18 + Vite 5 + TypeScript + **Tailwind 4**. Páginas: Login, Landing, Dashboard (KPIs),
Inbox (conversas em tempo real + socket.io), Suporte + Config + Dashboard de Suporte + Clientes,
Monitor de Alertas Proativos, Oportunidades (pipeline), Canal de E-mail,
Contatos (CRM + import CSV), Campanhas, Knowledge Base, Vendedores, Saúde dos Números,
Usuários & Acessos, Playbook, Tokens Dev, Portal do Cliente.

Design system próprio em `components/ui/` (~30 componentes) documentado no **Storybook**.
Dark mode via `html.dark`. Auth via cookie HttpOnly.

### 3.3 Banco de dados — PostgreSQL 16

Prisma ORM + pgvector. Schema e migrações em `apps/backend/prisma/` — **fonte de verdade**.
Entidades principais: `Tenant`, `User`, `Contact`, `AiConversation`, `AiMessage`,
`AiKnowledgeBase`, `Seller`, `Campaign`, `CampaignTarget`, `SenderNumber`, `FollowUp`,
`DomainEvent`, `Opportunity`, `AlertState`, `TenantNotificationConfig`, `PlanLimit`,
`ProactiveRuleConfig`, `WebhookDelivery`, `WebhookSubscription`, `PortalSession`,
`PortalTicket`, `AuditLog`, `AutonomySetting`.
⚠️ `docs/schema/README.md` e `docs/schema/schema.prisma` são artefatos legados de design
— o schema real está apenas em `apps/backend/prisma/schema.prisma`.

### 3.4 Cache — Redis `:6380`

Rate limiting, sessões, filas.

### 3.5 WhatsApp Gateway — WAHA `:3018`

Container self-hosted. Webhook de entrada → backend. API de envio (texto + arquivo).
Dois webhooks paralelos (WAHA → Nexa; legado n8n ainda ativo enquanto MVP não for desligado).

### 3.6 IA — Anthropic Claude

Modelo: `claude-haiku-4-5-20251001` (configurável via `AI_MODEL`). Temperatura baixa (0–0.4).
Rastreio de tokens e custo por chamada. RAG textual sobre `AiKnowledgeBase` aprovada.
Kill switch de autonomia persistido em `autonomy_setting`.

---

## 4. A Lia — Arquitetura de Agentes

Múltiplos agentes especializados coordenados pelo **Router**. Nenhum agente chama
outro diretamente; todas as ações externas passam pelo backend.

| Agente | Papel |
|---|---|
| **Router** | Classifica intenção, detecta risco jurídico, roteia |
| **Conversation** | Conduz o diálogo geral |
| **Sales** | Qualifica leads, trata objeções, solicita link de pagamento |
| **Support** | Responde dúvidas de produto via RAG da KB |
| **Diagnostic** | Diagnóstico guiado de chamados (playbooks) |
| **Resolution** | Propõe/aplica solução conhecida |
| **CaseClassifier** | Classifica o chamado de suporte |
| **Escalation** | Formaliza escalada para humano |
| **Supervisor** | Valida entrada (injection) e saída (alucinação/LGPD/tom) |

Guardrails: action policy (ações irreversíveis exigem humano), kill switch em runtime,
confiança mínima 0.60, anti-loop conversacional (máx 3 perguntas seguidas).

Ver detalhes em `docs/ai/ai-agents.md` e `docs/ai/ai-guardrails.md`.

---

## 5. Fluxos principais

### 5.1 Inbound (lead manda mensagem no WhatsApp)

```
WAHA webhook → normaliza (telefone, detecta mídia/opt-out)
  → rate limit + anti-spam
  → registra/atualiza contato
  → Router classifica intenção + risco jurídico
  → Supervisor valida entrada
  → agente especializado (Sales/Support/Escalation)
  → KB RAG + contexto do cliente (via TMS Connector se cliente ativo)
  → Supervisor valida saída
  → se autonomia ON + confiança alta → auto-envio
  → se lead score ≥ 70 → abre oportunidade + notifica vendedor (round robin)
```

### 5.2 Portal de suporte (cliente acessa via web)

```
Cliente → PortalPage (JWT de sessão próprio)
  → abre chamado ou consulta histórico
  → Lia responde automaticamente ou escala para humano
  → operador vê no Inbox (SupportPage)
```

### 5.3 Campanha (disparo em lote)

```
Operador configura campanha (template, link/mídia, segmento)
  → SenderService.tick() (cron) → horário comercial (7h–19h)
  → respeita limit diário/hora (SenderNumber anti-ban)
  → pula opt-out e quem já respondeu
  → delay randômico entre envios
  → registra CampaignTarget com status
```

### 5.4 Follow-up automático

```
Cron → busca contatos sem resposta (24h / 72h, máx 2 tentativas)
  → envia mensagem de recontato → registra FollowUp
```

### 5.5 Escalada para humano

```
Router detecta: risco jurídico | confiança < 0.60 | anti-loop | Escalation agent
  → cria `ai_conversations.status = 'escalated'`
  → emite evento → notifica operador (in-app + WhatsApp do vendedor)
  → operador assume a conversa no Inbox
```

---

## 6. Multi-tenancy e Platform Admin

Cada cliente (transportadora) é um **Tenant** isolado. `tenantId` deriva sempre do
contexto autenticado — nunca do body ou da fala do lead.

O **Platform Admin** (sem tenant) pode atuar como qualquer cliente via
`x-acting-tenant-id` (validado pelo `EffectiveTenantInterceptor`). Ações irreversíveis
exigem `x-acting-override` ("quebra de vidro") e são auditadas. Ver ADR 025 e
`docs/features/platform-admin/`.

---

## 7. Integração com HiperTMS

O Nexa não reimplementa o TMS: consome-o via **Connector** (ADR 008/010).

- **Leitura**: `tms-lookup.service` acessa o banco do HiperTMS via `TMS_DB_URL`
  (read-only) — planos, contratos, dados do cliente.
- **Ações**: solicitadas ao backend do TMS via API autenticada (`TMS_API_BASE_URL`
  + `TMS_SERVICE_TOKEN`) — ex.: criar cobrança.
- O HiperTMS é a fonte de verdade de billing/contrato; o Nexa não duplica esses dados
  (ADR 011).

---

## 8. Observabilidade

- **Logs**: pino estruturado + `correlationId` por request.
- **Health**: `/health`, `/health/live`, `/health/ready` (503 se DB cair).
- **Swagger**: `/api/docs` (dev/staging; desativado em produção).
- **Dashboard**: contatos, conversas, % IA autônoma, tokens + custo (US$), DLQ.
- **Auditoria**: `AuditLog` para toda ação de platform admin; `ai_actions` para
  cada chamada de agente.

---

## 9. Estado atual (Fase 4 — Produção)

| Módulo | Estado |
|---|---|
| Backend NestJS (todos os módulos) | ✅ Implementado |
| Frontend (todas as telas) | ✅ Implementado + Storybook |
| Multi-agent Lia (9 agentes) | ✅ Implementado |
| RAG textual (KB aprovada) | ✅ Implementado |
| Platform Admin (acting-as + break-glass) | ✅ Implementado |
| Portal de Suporte (web) | ✅ Implementado |
| Campanhas + anti-ban + follow-up | ✅ Implementado |
| Kill switch de autonomia | ✅ Implementado |
| Deploy DigitalOcean | ⏳ Em andamento |
| Testes automatizados | 🔴 Parcial (70 testes; e2e ausente) |
| Canal e-mail (além do SMTP) | ❌ Planejado (ADR 021 + ver ANALISE_HIPERTMS_GAPS) |
| Monitor Proativo TMS (alertas automáticos) | ✅ Implementado (ADR 028/032) |
| IntegrationsModule (plan-sync TMS→Nexa) | ✅ Implementado (ADR 033) |
| Motor proativo autônomo (Lia age sem trigger) | ❌ Planejado |
| Analytics / Relatórios | ❌ Planejado |

---

## 10. Documentos relacionados

- **Código**: `CLAUDE.md` (raiz) — guia operacional para agentes de IA
- **Decisões**: `docs/adr/` — 33 ADRs por domínio
- **IA**: `docs/ai/` — agentes, guardrails, RAG, contexto, memória, revisão
- **Arquitetura**: `docs/architecture/` — codebase, frontend, C4
- **API**: `docs/api/` — padrões, erros, nomenclatura
- **Segurança**: `docs/security/` — visão geral, segredos
- **Infra**: `docs/infra/` — deploy, CI/CD, migrations
- **Schema**: `docs/schema/` — Prisma, migrations, runtime
- **Features**: `docs/features/` e `docs/prd/` — PRDs por módulo
- **Gaps & roadmap**: `docs/ANALISE_HIPERTMS_GAPS.md` (2026-06-18)
