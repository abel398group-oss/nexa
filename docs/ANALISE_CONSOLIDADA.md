# Análise Consolidada Cirúrgica — Projeto Completo

> Visão técnica de TUDO: o que temos hoje (MVP n8n) + o que está pronto para construir
> (documentação) + caça a lacunas (o que pode ter escapado). Para validação final com o GPT.
> Gerado em 2026-06. Inventário: 25 documentos, ~4.300 linhas.

---

## PARTE A — O QUE TEMOS HOJE (MVP em produção/validação)

### Funcionando (n8n + WhatsApp + Claude + PostgreSQL)
| Capacidade | Estado |
|---|---|
| Atendimento IA inbound | ✅ Ativo 24h (34 nós) |
| Classificação de intenção (Claude Haiku) | ✅ |
| Base de conhecimento dinâmica | ✅ 10 registros |
| Histórico de conversa (contexto 24h) | ✅ |
| Campanhas (Sender) | ✅ Manual, 12 nós |
| Follow-up (24h/72h) | ✅ Manual, 5 nós |
| IA Supervisora | ✅ Manual, 7 nós |
| Round robin (2 vendedores) | ✅ |
| Number pool (30/dia, anti-ban) | ✅ |
| Opt-out / mídia / ofensas / saudação horário | ✅ |
| Rate limiting (12s) + humanização (3-6s) | ✅ |
| Modo fila (Redis) + pruning | ✅ |

### Limitações conhecidas (ver AUDITORIA_TECNICA_N8N.md)
- 🔴 Secrets hardcoded · webhook sem auth · sem HTTPS · n8n sem auth
- 🟠 3 nós HTTP sem onError · delay Sender 2-10s (prod=30-90s)
- 🟡 Agendamentos manuais · sem observabilidade · single-tenant

---

## PARTE B — O QUE ESTÁ PRONTO PARA CONSTRUIR (documentação)

### Mapa de cobertura (cada peça tem documento?)
| Área | Documento | Status |
|---|---|---|
| Visão geral | overview/system-overview | ✅ |
| Modelo de dados conceitual | overview/database-schema | ✅ |
| Regras de negócio | prd/business-rules | ✅ |
| Workflows atuais | prd/workflows | ✅ |
| IA autônoma + governança (16 seções) | prd/ia-autonoma | ✅ |
| Modelo de dados IA (detalhado) | prd/data-model-ia | ✅ |
| Arquitetura de automação | adr/001 | ✅ |
| Stack frontend | adr/002 | ✅ |
| Arquitetura de agentes | adr/003 | ✅ |
| Event bus | adr/004 | ✅ |
| Segurança/permissões | adr/005 | ✅ |
| Knowledge base | adr/006 | ✅ |
| Event catalog | adr/007 | ✅ |
| Integração billing TMS | adr/008 | ✅ |
| Plataforma independente | adr/009 | ✅ |
| Arquitetura de conectores | adr/010 | ✅ |
| Schema Prisma (30+ models) | schema/schema.prisma | ✅ |
| Estratégia de migration | schema/migrations.md | ✅ |
| Versões de runtime | schema/runtime.md | ✅ (template) |
| Roadmap por fases | IMPLEMENTATION_ROADMAP | ✅ |
| Sprint plan (14 sprints) | SPRINT_PLAN | ✅ |
| Auditoria do MVP | AUDITORIA_TECNICA_N8N | ✅ |

### Decisões estratégicas travadas
- ✅ Plataforma independente (não módulo do TMS)
- ✅ TMS = 1º conector (arquitetura plugável)
- ✅ Stack: NestJS + Prisma + PostgreSQL + React/Vite + Flowise
- ✅ pgvector no Sprint 1 · Redis (não Kafka) · Docker Secrets→DO Secrets
- ✅ Flowise não bloqueia Sprints 1-10
- ✅ Regra de congelamento de escopo

---

## PARTE C — 🔍 CAÇA A LACUNAS (o que pode ter escapado)

Itens que NÃO têm documento dedicado. Classificados por urgência.

### 🟠 Lacunas que vale resolver ANTES de codar (Sprint 0-2)
| # | Lacuna | Status |
|---|---|---|
| 1 | **Estratégia de testes** | ✅ RESOLVIDO → `testing-strategy.md` |
| 2 | **Contrato da API** | ✅ RESOLVIDO → `api-contract.md` (vira openapi.yaml) |
| 3 | **Separação de ambientes** | ✅ RESOLVIDO → ADR 013 |
| 4 | **Plano de migração de dados** | ✅ RESOLVIDO → `MIGRATION_PLAN.md` (n8n vira consumidor) |

> As 4 lacunas 🟠 estão RESOLVIDAS. Controles operacionais de IA adicionados (ADR 012):
> Kill Switch (`AI_AUTONOMY_ENABLED`), aprovação de KB (reviewer/approved_at), backup/DR (Sprint 2).

### 🔴 Decisões arquiteturais que faltavam (resolvidas após análise do GPT)
| ADR | Resolve |
|---|---|
| **ADR 011 — Source of Truth** | Dono de cada dado (lead=plataforma, plano=TMS, etc.) — anti-divergência |
| **ADR 012 — Security & Prompt Injection** | Defesa formalizada + Action Policy (ação × backend × humano) |

### 🟡 Lacunas que podem esperar (mas registrar)
| # | Lacuna | Quando |
|---|---|---|
| 5 | **Prompts reais dos agentes** | Definidos conceitualmente (ADR 003); texto real só na implementação (Sprint 11+) |
| 6 | **PRD por tela do frontend** | ADR 002 cobre stack; detalhe de cada tela (campos/ações) na Fase 4 |
| 7 | **CI/CD** | Citado em migrations.md; doc próprio quando montar deploy |
| 8 | **Observabilidade — escolha de ferramentas** | Sprint 13 lista o que; falta qual (logger, tracing, métricas) |
| 9 | **Modelo de custos / budget** | Temos tracking (estimated_cost_usd) mas sem projeção de custo IA/infra |
| 10 | **Runbook operacional / incidentes** | O que fazer quando algo cai (Claude/WAHA/Asaas down) |
| 11 | **LGPD — documento legal** | Governança cobre o técnico (9.24); falta política/termos formais |
| 12 | **Backup & Disaster Recovery detalhado** | Mencionado; falta estratégia (frequência, retenção, RTO/RPO) |
| 13 | **Conteúdo de onboarding** | Fluxo definido; o texto/passos reais do onboarding não escritos |
| 14 | **Enforcement de rate limit/quota** | Tabela `ai_usage_limits` existe; lógica de bloqueio não especificada |

### 🟢 Conscientemente fora de escopo (correto não ter)
- Kafka/RabbitMQ, Microservices, Kubernetes, Vault, Event Sourcing → over-engineering p/ a fase
- Analytics Agent, Voice Agent, API oficial Meta → só após validar lead→venda→pagamento

---

## PARTE D — CONSISTÊNCIA ENTRE DOCUMENTOS (cross-check)

| Verificação | Resultado |
|---|---|
| `correlation_id` presente em data-model, schema, ADR 004/007 | ✅ Consistente |
| `idempotency_key` unique no schema vs ADRs | ✅ |
| Billing: ADR 008 ↔ data-model ↔ schema (ai_billing_requests) | ✅ |
| Conectores: ADR 009/010 ↔ schema (Product/Credential) ↔ roadmap Fase 3 | ✅ |
| Autonomia por módulo (ia-autonoma 9.22) ↔ agentes (ADR 003) | ✅ |
| Event catalog (ADR 007) ↔ domain_events (schema) | ✅ |
| plans NÃO recriado (consome TMS) — coerente em todos | ✅ |
| Estados ai_billing_requests (ADR 008) ↔ enum schema | ✅ |
| Fases (roadmap) ↔ sprints (sprint plan) | ✅ Mapeado |

> Nenhuma contradição encontrada entre os 25 documentos.

---

## PARTE E — MATRIZ DE PRONTIDÃO

| Dimensão | Documentação | Implementação |
|---|---|---|
| Estratégia de produto | ✅ 100% | — |
| Arquitetura macro | ✅ 100% | — |
| Modelo de dados | ✅ 100% | ⏳ 0% (schema pronto) |
| Segurança (design) | ✅ 95% | ⏳ MVP inseguro |
| Roadmap/sprints | ✅ 100% | — |
| Testes | 🟠 0% | ⏳ 0% |
| API contract | 🟠 0% | ⏳ 0% |
| Frontend (telas) | 🟡 30% | ⏳ 0% |
| Observabilidade | 🟡 50% | ⏳ 0% |
| MVP funcional | ✅ (n8n) | ✅ rodando |

---

## PARTE F — PERGUNTAS PARA O GPT (validação final)

1. Das 14 lacunas (Parte C), alguma deveria subir de prioridade?
2. Falta alguma **decisão arquitetural** (ADR) que não percebemos?
3. O **contrato de API** e a **estratégia de testes** deveriam virar documento ANTES do Sprint 1?
4. Há risco de inconsistência futura entre o MVP n8n e a plataforma nova rodando em paralelo?
5. Para 1 dev, alguma fase do roadmap é grande demais e deveria ser quebrada?
6. Algo na governança/segurança da IA ainda está frágil para um produto que cobra de cliente?

---

## VEREDITO INTERNO (antes do GPT)

**Documentação estratégica/arquitetural:** completa e consistente (sem contradições).
**Principais lacunas reais:** testes, contrato de API, ambientes, migração de dados —
todas de **implementação**, não de arquitetura.
**MVP:** ótimo para validar; inseguro para produção (hardening mapeado).

> O projeto está no ponto onde mais documentação conceitual gera pouco valor. As 4 lacunas
> 🟠 são de execução e podem ser resolvidas no início dos sprints, não antes.
