# Sprint Plan Detalhado — Plataforma de IA Comercial (Leads)

> ⚠️ **Documento histórico de planejamento.** O projeto está em **Fase 4 (em produção)**
> desde 2026-07. Fases 0–4 concluídas. Ver `docs/overview/roadmap.md` para o estado atual.
> Este arquivo descreve o plano original de sprints para referência; as tasks abaixo
> **NÃO refletem o estado do código** — tudo que estava previsto nos Sprints 1–10 foi
> implementado. Backlog ativo está na Fase 5 do roadmap.

> Passo a passo de implementação por sprint. Deriva do IMPLEMENTATION_ROADMAP e dos ADRs/schema.
> ~~**Nada implementado ainda** — guia para o dia de construir.~~ (desatualizado — ver nota acima)

**Premissas (ajustar conforme realidade):**
- 1 dev fullstack dedicado · sprints de 2 semanas (sprints de integração podem estourar)
- Referência de construção: HiperTMS (mesma stack, design system, segurança e estrutura modular)
- MVP n8n continua rodando em paralelo (não desligar)

**Como usar:** cada sprint tem objetivo, tarefas e "pronto quando" (Definition of Done).

> Nota de realismo (GPT): integração de pagamento e import de base de conhecimento são os
> dois pontos que mais estouram cronograma — por isso ganharam sprints próprias.

---

## Pré-Sprint (1-3 dias) — Decisões e setup

### Decisões técnicas RESOLVIDAS (travadas — não reabrir)
0. **Ambientes:** dev/staging/production definidos (ADR 013) — bancos isolados, secrets por env
1. **pgvector:** instalar JÁ no Sprint 1 (custo ~zero, evita migração futura)
2. **Monorepo:** estrutura definida (filosofia do TMS):
   ```
   apps/
     backend/   (NestJS)
     frontend/  (React+Vite)
   packages/
     shared/    (utils comuns)
     types/     (tipos compartilhados)
     sdk/       (cliente da API)
   ```
3. **Secrets:** Docker Secrets (MVP) → DigitalOcean Secrets (produção). **NÃO** Vault agora.
4. **Flowise:** NÃO é dependência dos Sprints 1-10. Se atrasar, Backend/Frontend/Billing/
   Support continuam avançando. Flowise só entra na Fase 6 (Sprints 11-12).

### Tarefas
- [x] Decisão plataforma independente (ADR 009) — resolvido
- [ ] Validar em runtime os endpoints de billing do TMS (ADR 008 checklist)
- [ ] Criar repositório (monorepo conforme estrutura acima)
- [ ] Decidir hospedagem (Digital Ocean)

---

## SPRINT 1 — Fundação de dados
- [ ] PostgreSQL 16 (+ pgvector se RAG) · Prisma
- [ ] `schema.prisma` Fase 1 + **Product** e **ProductConnectorCredential já na 1ª migration**
      (mesmo sem uso imediato — evita migration dolorosa depois)
- [ ] Primeira migration · seed mínimo (produto HiperTMS + KB inicial)
- [ ] **Migration Strategy** documentada (`schema/migrations.md`): regras de disciplina do Prisma
- [ ] **Registrar versões** em `schema/runtime.md` (Node/PG/Prisma/Nest/Redis/Docker)

**Pronto quando:** tabelas no `prisma studio`; seed roda; migration e versões registradas.

---

## ENTRE SPRINT 1 e 2 — Documentos de contrato (não dependem de código)
- [ ] ADR 011 — Source of Truth (✅ criado — revisar/validar)
- [ ] ADR 012 — Security & Prompt Injection + Action Policy (✅ criado)
- [ ] `api-contract.md` → evoluir para `openapi.yaml` formal
- [ ] `MIGRATION_PLAN.md` (✅ criado — base do Sprint 3)

> São o "alinhamento de contrato" antes do backend codar (evita frontend/backend/Flowise
> esperarem payloads diferentes).

---

## SPRINT 2 — Backend base + Auth + Observabilidade base
- [ ] Scaffold NestJS (modular: application/presentation/infra/shared como o TMS)
- [ ] Auth: JWT cookie HttpOnly + **Refresh Token** + **Session Revocation**
- [ ] **Audit Log** (quem fez o quê — inferno colocar depois)
- [ ] Multi-tenant (`@CurrentTenant`) + CASL base · `/api/health`
- [ ] **Structured Logger** + **RequestId** + **CorrelationId Middleware**
      (precisa existir ANTES do Sprint 4, senão não dá pra debugar eventos/billing)
- [ ] **Backup + Disaster Recovery** (rotina + teste de RESTORE) — você já guarda leads/
      conversas/vendas; sem restore testado = exposto
- [ ] **Kill Switch** (`AI_AUTONOMY_ENABLED`) via feature_flags (ADR 012)

**Pronto quando:** login+refresh+logout funcionam; logs com correlationId; backup restaura ok.

---

## SPRINT 3 — Contatos e conversas (síncrono)
- [ ] Módulo Contacts (CRUD + import CSV)
- [ ] Módulo Conversations (criar/listar)
- [ ] Módulo Messages (gravar in/out, histórico)
- [ ] Paginação padrão (limit/offset/search)

**Pronto quando:** API cria conversa, grava mensagens, lista paginado.

---

## SPRINT 4 — Comunicação assíncrona (WebSocket + eventos)
Tudo que é assíncrono junto.
- [ ] WebSocket (mensagem nova em tempo real)
- [ ] Módulo Actions (`ai_actions`: IA solicita → backend valida/executa)
- [ ] Outbox: `domain_events` na transação + worker (Redis)
- [ ] DLQ + retry/backoff · envelope padrão (ADR 007) + correlationId

**Pronto quando:** ação gera evento, processa, falha cai na DLQ; WS emite em tempo real.

---

## SPRINT 5 — Conector (base)
Sem billing ainda — só a fundação do conector.
- [ ] Interface `Connector` + registry `products`
- [ ] `HiperTmsConnector.healthCheck()`
- [ ] `HiperTmsConnector.getPlans()` → `GET /plans` do TMS

**Pronto quando:** plataforma lista planos do TMS e sabe se o conector está no ar.

---

## SPRINT 6A — Billing: cobrança (saída)
Billing dividido — é onde projetos atrasam.
- [ ] `createPaymentRequest()` → cobrança no TMS (Asaas)
- [ ] `getPaymentStatus()` (consulta)
- [ ] Credenciais criptografadas (ProductConnectorCredential)

**Pronto quando:** plataforma gera cobrança e consulta status no produto.

## SPRINT 6B — Billing: confirmação (entrada)
- [ ] Receber `payment_confirmed` (webhook validado + assinatura + idempotência)
- [ ] `provisionAccess()` → libera → evento `tenant_created`
- [ ] `payment_status_sync` (reconciliação)
- [ ] Fallback se conector indisponível (não cobrar/não prometer)

**Pronto quando:** pagamento confirmado libera acesso, rastreável por correlationId.

---

## SPRINT 7 — Frontend base + Inbox
- [ ] React+Vite+Tailwind+FlyonUI (design system do TMS)
- [ ] Login + AuthContext (cookie HttpOnly)
- [ ] Layout base (StandardListPage etc. reaproveitados)
- [ ] Inbox de conversas (lista + thread + WebSocket)

**Pronto quando:** login funciona; inbox mostra conversas em tempo real.

---

## SPRINT 8 — Frontend CRM
- [ ] Lista de contatos (filtros/paginação) · perfil + histórico
- [ ] Importar contatos (CSV/Excel) · campanhas
- [ ] (Dashboard/gráficos depois — não agora)

**Pronto quando:** vendedor importa, vê e gerencia leads pela tela.

---

## SPRINT 9 — Knowledge Import Pipeline
Sprint própria — pode levar de 3 dias a semanas conforme a documentação.
- [ ] Extrair docs do hipertms_v12 (docs/ADR/README/FAQ)
- [ ] Normalizar → estruturar por tópico/categoria/tags
- [ ] Versionar e aprovar (`ai_knowledge_base` + `ai_knowledge_versions`)
- [ ] Popular a base

**Pronto quando:** KB do TMS aprovada e consultável.

---

## SPRINT 10 — Knowledge Service + Support Agent
- [ ] Knowledge Service (retrieval KB aprovada; se não sabe → "não encontrei")
- [ ] Support Agent (responde com KB; escala se necessário)

**Pronto quando:** cliente pergunta algo do TMS e recebe resposta correta.

---

## SPRINT 11 — Agentes: Router + Sales (Flowise)
- [ ] Setup Flowise
- [ ] Router/Supervisor (valida entrada/saída)
- [ ] Sales Agent (vende, solicita pagamento via backend)

**Pronto quando:** venda roda por Router+Sales com governança.

---

## SPRINT 12 — Agentes: Onboarding + Qualidade
- [ ] Onboarding Agent
- [ ] AiQualityAudit (Supervisora) + AiCustomerHealth
- [ ] Feature Flags (rollout faseado de autonomia)
- [ ] Migração incremental do Inbound n8n → agentes

**Pronto quando:** atendimento multiagente completo com auditoria.

---

## SPRINT 13 — Observabilidade avançada (antes de produção)
Logs estruturados + correlationId já vêm do Sprint 2. Aqui completa-se:
- [ ] Tracing (jornada ponta a ponta)
- [ ] Métricas (conversão, custo IA/venda, fila, erros)
- [ ] Dashboard operacional + alertas

**Pronto quando:** dá para rastrear qualquer lead/erro por correlationId em tempo real.

---

## SPRINT 14+ — Multi-tenant e Escala
- [ ] Multi-tenant: isolamento, roles, config, branding
- [ ] Pool de números + aquecimento · NPS · Whisper (áudio) · Google Calendar
- [ ] (Avaliar) API oficial da Meta

---

## Secrets Management (transversal — desde o Sprint 1)
`encrypted_secret` precisa de uma chave — **onde ela fica:**
- **MVP:** Docker Secrets / variáveis de ambiente do Digital Ocean
- **Produção:** DigitalOcean Secrets (ou Hashicorp Vault no futuro)
- Nunca chave em código/repo. Rotação de credenciais prevista.

---

## Mapa Sprint → Fase do Roadmap
```
Pré-Sprint → Pré-requisitos
1          → Fase 1.5 (dados)
2-4        → Fase 2 (backend; 4 = assíncrono)
5-6        → Fase 3 (Conector base + Billing)
7-8        → Fase 4 (frontend Inbox + CRM)
9-10       → Fase 5 (KB import + Support)
11-12      → Fase 6 (agentes)
13         → Observabilidade (antes de produção)
14+        → Fases 7-8 (multi-tenant, escala)
```

## Estimativa realista (1 dev, sprints de 2 semanas)
```
Pré:1 · S1:2 · S2:2 · S3:2 · S4:2 · S5:2 · S6:3 · S7:2 · S8:2 ·
S9:2 · S10:2 · S11:2 · S12:2 · S13:1   (semanas)
Total: ~25-28 semanas ≈ 6-7 meses
```
**Estimativa OFICIAL com buffer: 30-32 semanas (~7-8 meses)** — porque Billing (S6),
Knowledge Import (S9) e Flowise (S11-12) são os 3 pontos que mais costumam estourar.
Para chegar em: Plataforma + Conector HiperTMS + Billing + Frontend + Support Agent +
Sales Agent + Observabilidade. Multi-tenant/escala (Sprint 14+) vêm depois.

## Regras durante os sprints
- Cada sprint termina **testável** (Definition of Done clara)
- Não pular fundação (dados/backend) para "ver tela bonita"
- Reusar padrões e estrutura modular do TMS (não reinventar)
- IA recomenda, backend executa (ações críticas)
- Validar venda real antes de escalar (anti over-engineering)
- O próximo aprendizado relevante vem da implementação real dos Sprints 1-2, não de mais doc.

## ⚠️ REGRA DE CONGELAMENTO DE ESCOPO (a mais importante)
> **Nenhuma funcionalidade nova entra antes da conclusão do Sprint atual.**

Ideias novas (mais agentes, automações, dashboards, integrações) vão para um **backlog**
e só são consideradas no planejamento do próximo sprint — nunca no meio. O roadmap está
bem sequenciado; quebrar a ordem = retrabalho. Disciplina > entusiasmo.
