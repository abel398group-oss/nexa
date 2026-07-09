# Auditoria Técnica — Projeto Nexa

> **Data:** 2026-07-08
> **Escopo:** Backend NestJS, Prisma/PostgreSQL, integração IA (Claude/Lia), frontend React, infraestrutura, segurança, performance e prontidão para produção.
> **Método:** Auditoria estática (leitura de código, schema, compose). Nenhum arquivo foi alterado nesta fase.
> **Autor:** orquestra-Analista (Staff Eng + Architect + Security + DevOps)

---

## 1. Executive Summary

O Nexa é um backend NestJS maduro e bem defendido para um projeto pré-deploy: possui `validateEnv()` fail-fast, guardrails de IA (supervisora + kill switch), claim atômico anti-duplicação no disparo, dedup de inbound, LGPD (opt-out/anonimização) e isolamento multi-tenant via interceptor. **Não há falhas de autenticação abertas** — os 4 controllers sem `@UseGuards` são todos server-to-server ou webhooks com token próprio.

Os bloqueadores reais para produção são de **confiabilidade e escala**, não de brechas óbvias:

1. Chamadas à API Anthropic **sem timeout**, que podem travar o fluxo inteiro de resposta.
2. O **webhook do WhatsApp está sujeito ao rate-limit global de 100 req/min**, descartando mensagens de clientes sob rajada.
3. Filtro JSON em `ai_messages.metadata` **sem índice** → full scan na maior tabela do sistema.

Some-se a isso: integridade referencial multi-tenant frágil (`tenantId` `String` sem FK), tabelas sem expurgo, um diretório `.chk/` (131 arquivos, 814 KB) de código duplicado versionado, e zero testes de frontend.

---

## 2. Matriz de Risco

| Área | 🔴 Crítico | 🟠 Alto | 🟡 Médio | 🟢 Baixo |
|------|-----------|---------|----------|----------|
| Segurança | 0 | 2 | 4 | 2 |
| Bugs | 1 | 2 | 3 | 1 |
| Arquitetura | 0 | 2 | 3 | 1 |
| Performance/Escala | 1 | 3 | 2 | 0 |
| Qualidade | 0 | 2 | 2 | 2 |

---

## 3. Notas por Dimensão (0–10)

| Dimensão | Nota | Comentário |
|----------|------|-----------|
| Arquitetura | 6.5 | Modular e coeso, mas God Service e árvore de controllers dupla puxam para baixo |
| Segurança | 7.5 | Sem brechas de auth abertas; fundações fortes. Perde em HTML injection, token não constant-time, logs com PII |
| Escalabilidade | 4.5 | Trava cedo: disparo serial global, JSON scan em `ai_messages`, tabelas sem expurgo, tenantId sem FK |
| Performance | 5.5 | N+1 principais resolvidos, mas sem timeout de IA e full scans dominam o risco |
| Organização | 6.5 | Boa nomenclatura e comentários; prejudicada por `.chk/` versionado e arquivos gigantes |
| Qualidade de código | 6.0 | 23 specs backend; **0 testes de frontend**, componentes de ~98 KB |
| **Prontidão para produção** | **5.0** | Fundação de deploy pronta, mas C1/C2/C3 são bloqueadores reais |

---

## 4. Findings

Formato: **Título · Local · Gravidade · Explicação · Impacto · Correção · Prioridade · Esforço**

### 🔴 CRÍTICOS

#### C1 — Chamadas à Anthropic sem timeout travam a resposta da Lia
- **Local:** `apps/backend/src/shared/ai/anthropic.service.ts:54` e `:90`
- **Gravidade:** Crítica
- **Explicação:** As duas chamadas principais à API (`complete()` / `completeWithUsage()`) não têm timeout nem retry, ao contrário de `resolveLidToPhone` e da transcrição (que usam `AbortSignal.timeout(5000)`). O pipeline `whatsapp.process → conversationAgent.handle → router/sales/support + supervisor` é síncrono e faz 3–4 chamadas encadeadas por mensagem.
- **Impacto:** Uma requisição pendurada da Anthropic segura o request do webhook indefinidamente. Sob incidente da API, os workers esgotam e a Lia para de responder a **todos** os tenants. Não há circuit breaker.
- **Correção:** `signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS ?? 20000))` nos dois `fetch`; 1 retry com backoff para 429/5xx; a médio prazo mover inbound para fila.
- **Prioridade:** P0 · **Esforço:** 2–4 h

#### C2 — Rate-limit global descarta mensagens inbound do WhatsApp
- **Local:** `apps/backend/src/app.module.ts:48` + `apps/backend/src/presentation/http/whatsapp/whatsapp.controller.ts`
- **Gravidade:** Crítica (confiabilidade)
- **Explicação:** `ThrottlerGuard` global de 100 req/min por IP. O WAHA entrega todos os eventos (mensagens, `message.ack`, `session.status`) de um único IP. Nenhum endpoint público tem `@SkipThrottle`.
- **Impacto:** Sob volume de campanha/ACKs, o webhook passa de 100/min e o Nexa devolve **429 — mensagens de clientes são perdidas silenciosamente** (o WAHA não reentrega de forma confiável).
- **Correção:** `@SkipThrottle()` no `WhatsappController` (já protegido por `WAHA_WEBHOOK_TOKEN`) e nos webhooks s2s (`integrations`, `email`); manter throttle nas rotas de usuário; throttler estrito só no `/auth/login`.
- **Prioridade:** P0 · **Esforço:** 1 h

#### C3 — Filtro JSON em `ai_messages.metadata` sem índice = full scan
- **Local:** `apps/backend/src/application/sender/sender.service.ts:307` e `:360`
- **Gravidade:** Crítica em escala (Alta hoje)
- **Explicação:** Detalhe/conversão de campanha filtra `ai_messages` por `metadata:{path:['campaignId'],equals:id}`. Sem índice GIN em `metadata`. É a tabela que mais cresce.
- **Impacto:** Cada abertura de detalhe de campanha faz sequential scan da tabela inteira; com milhões de mensagens, trava a tela e prende conexões do pool.
- **Correção:** Migrar `campaignId` para coluna dedicada indexada (preferível) ou criar `GIN (metadata jsonb_path_ops)`. ⚠️ Migration executada **apenas pelo Abel** (`db:migrate`).
- **Prioridade:** P0/P1 · **Esforço:** 4 h (índice) / 1 dia (coluna+backfill)

### 🟠 ALTOS

#### A1 — `tenantId` é `String` solto, sem FK nem cascade
- **Local:** `apps/backend/prisma/schema.prisma` (quase todos os models). O schema documenta a decisão adiada em `Tenant` (~linha 388).
- **Gravidade:** Alta
- **Impacto:** Sem integridade referencial; excluir tenant deixa órfãos em ~20 tabelas sem cascade.
- **Correção:** Migration `tenantId` → FK `Tenant.id` com `onDelete`; enquanto isso, script de verificação de órfãos.
- **Prioridade:** P1 · **Esforço:** 1–2 dias (testar em staging)

#### A2 — `ProcessedMessage` e `Session` crescem sem expurgo
- **Local:** `schema.prisma:549` (`ProcessedMessage`) e `:128` (`Session`). Nenhum cleanup no código.
- **Gravidade:** Alta (escala)
- **Impacto:** `processed_messages` ganha 1 linha por mensagem recebida, para sempre; `sessions` acumula revogadas/expiradas. Incham índice e disco.
- **Correção:** Job no `ConversationJanitor`: apagar `ProcessedMessage < now-48h` e `Session` expiradas/revogadas há >30 dias.
- **Prioridade:** P1 · **Esforço:** 2 h

#### A3 — `ConversationAgentService` é um God Service (SRP)
- **Local:** `apps/backend/src/application/agents/conversation-agent.service.ts` (540 linhas, 12 deps)
- **Gravidade:** Alta (manutenção)
- **Impacto:** `handle()` faz roteamento, handoff, escalonamento, auto-envio, oportunidade, notificação, reclamação e métrica; ajustes arriscam quebrar regras vizinhas.
- **Correção:** Extrair `HandoffOrchestrator`, `EscalationPolicy`, `AutoSendPolicy`.
- **Prioridade:** P1 · **Esforço:** 1–2 dias

#### A4 — Throughput de disparo limitado a ~1 envio / 15 s global
- **Local:** `apps/backend/src/application/sender/sender.service.ts:487` (`@Interval(15000)` + `findFirst` entre todos os tenants)
- **Gravidade:** Alta (escala)
- **Impacto:** Uma campanha por tick, no processo inteiro; sem fairness — um tenant grande faminta os demais. Não escala além de dezenas de clientes ativos.
- **Correção:** Filas por tenant/número (BullMQ) com round-robin.
- **Prioridade:** P1 · **Esforço:** 2–4 dias

#### A5 — `.chk/`: 131 arquivos de código-fonte duplicado versionados
- **Local:** `apps/backend/.chk/` (814 KB, 131 `.ts` no git)
- **Gravidade:** Alta (qualidade/segurança)
- **Impacto:** Cópia paralela desatualizada do `src/`; confunde grep/IDE, infla o clone, risco de editar/importar a versão errada.
- **Correção:** `git rm -r apps/backend/.chk` + `.gitignore`.
- **Prioridade:** P1 · **Esforço:** 15 min

#### A6 — Sem cap de custo/token por tenant ou conversa
- **Local:** custo medido em `ai_messages.estimatedCostUsd`, mas nada o limita
- **Gravidade:** Alta (custo)
- **Impacto:** Tenant abusivo / loop / flood inflaciona a fatura Anthropic sem teto.
- **Correção:** Contador de custo/mensagens por mês por tenant usando `PlanLimit.maxMessagesMonth` (hoje só declarado) com corte + alerta.
- **Prioridade:** P1 · **Esforço:** 1 dia

### 🟡 MÉDIOS

#### M1 — HTML injection na página de opt-out por e-mail
- **Local:** `apps/backend/src/presentation/http/email/email.controller.ts:87` e `:123` (`${ctx.email}` / `${result.email}` sem escape)
- **Gravidade:** Média
- **Explicação:** E-mail vem do header `From` (spoofável) → renderizado sem escape.
- **Correção:** Escapar HTML antes de interpolar. · **Esforço:** 1 h

#### M2 — Estrutura de controllers dividida em duas árvores
- **Local:** metade em `application/<x>/x.controller.ts`, metade em `presentation/http/<x>/`
- **Gravidade:** Média
- **Correção:** Padronizar em `presentation/http/`; mover os divergentes (`integrations`, `webhooks`, `monitor`, `whatsapp`). · **Esforço:** 3 h

#### M3 — Seed cria admin com senha fraca conhecida
- **Local:** `apps/backend/prisma/seed.ts:10` (`admin@nexa.local / admin123`)
- **Gravidade:** Média
- **Correção:** Ler senha de env; falhar se ausente em `NODE_ENV=production`. · **Esforço:** 30 min

#### M4 — `mem_limit: 900m` com modelos de IA locais no mesmo container
- **Local:** `docker-compose.production.yml:40` (backend roda `@xenova/transformers` + whisper)
- **Gravidade:** Média
- **Impacto:** Modelo + Node + Prisma facilmente ultrapassam 900 MB → OOM kill e reinícios em loop.
- **Correção:** Medir uso real; subir limite ou externalizar embeddings/transcrição. · **Esforço:** meio dia

#### M5 — WAHA fixado em `:latest` e é gateway não-oficial
- **Local:** `docker-compose.production.yml:82`
- **Gravidade:** Média
- **Impacto:** `:latest` quebra reprodutibilidade; gateway não-oficial = risco de ban e ToS.
- **Correção:** Fixar tag/digest; planejar migração para Cloud API oficial. · **Esforço:** 30 min (pin)

#### M6 — Backup agendado só no Windows Task Scheduler
- **Local:** `scripts/backup.ps1` + Windows Task Scheduler
- **Gravidade:** Média
- **Impacto:** O droplet de produção é Linux — o script PowerShell não roda lá.
- **Correção:** Confirmar backup automático do Postgres gerenciado DO; senão, cron no droplet. · **Esforço:** 2 h

#### M7 — `resolveLidToPhone` pode aceitar número inválido
- **Local:** `apps/backend/src/application/whatsapp/whatsapp.service.ts:196`
- **Gravidade:** Média
- **Explicação:** O fallback `fromNum` usa `data.number` (LID user portion, não é telefone BR válido).
- **Correção:** Retornar só quando derivado de `data.id` e válido BR. · **Esforço:** 1 h

### 🟢 BAIXOS

- **B1 — Token não constant-time / query-string em logs:** `whatsapp.controller.ts:29` usa `token !== expected`; fallback `?token=` vaza em logs de acesso. Usar `crypto.timingSafeEqual` e remover fallback legado.
- **B2 — Enum `ActionType` com valores mortos:** `create_payment`, `refund`, `cancel_subscription` após remoção do billing (`schema.prisma:417`).
- **B3 — Filtro de profanidade hardcoded:** `conversation-agent.service.ts:116` (`/puteiro|vaca|puta|traveco/i`) — extrair para lista configurável.
- **B4 — Logs DEBUG com PII:** `[webhook]`/`[ack]` logam corpo de mensagem em nível `log`. Rebaixar para `debug` e remover PII.

---

## 5. Pontos Positivos

- `validateEnv()` fail-fast bloqueia boot em produção com segredos fracos/placeholder.
- Isolamento multi-tenant: cliente comum **sempre** usa `tenantId` do token; platform-admin auditado com "quebra de vidro".
- Guardrails de IA maduros: supervisora, kill switch persistido, aceno seguro, anti-loop, humanização.
- Claim atômico `queued→sending` previne envio duplicado.
- Dedup de inbound, recuperação de travamento de worker, estado anti-ban via Redis com fallback local.
- LGPD: opt-out 2 passos, footer legal, anonimização por retenção, re-opt-in implícito.
- Vários N+1 já corrigidos conscientemente.

---

## 6. Plano de Ação Prioritário

### Antes do deploy (bloqueadores)
1. **C1** — Timeout + retry nas chamadas Anthropic (2–4 h)
2. **C2** — `@SkipThrottle()` no webhook WAHA e webhooks s2s (1 h)
3. **C3** — Índice GIN (ou coluna dedicada) para `campaignId` em `ai_messages` (4 h)
4. **A5** — Remover `.chk/` do git (15 min)
5. **M3** — Seed sem senha fixa em produção (30 min)
6. **M6** — Confirmar backup automático do Postgres em produção (2 h)

### Semana 1–2
7. **A2** — Job de expurgo de `ProcessedMessage`/`Session` (2 h)
8. **A6** — Cap de custo/mensagens por tenant usando `PlanLimit` (1 dia)
9. **M1** — Escapar HTML na página de opt-out (1 h)
10. **A4** — Filas de disparo por tenant/número (2–4 dias)
11. **A1** — Migration `tenantId` → FK com cascade (1–2 dias, em staging)

### Próximo sprint
12. **A3** — Quebrar o God Service em colaboradores (1–2 dias)
13. **M2 / M4 / M5 / M7** — Convenção de controllers, `mem_limit`, pin do WAHA, fix do LID
14. **B1–B4** + cobertura de testes de frontend

---

## 7. Checklist de Correção (rastreamento)

| ID | Item | Prioridade | Esforço | Status |
|----|------|-----------|---------|--------|
| C1 | Timeout + retry Anthropic | P0 | 2–4 h | ☐ |
| C2 | SkipThrottle webhooks públicos | P0 | 1 h | ☐ |
| C3 | Índice/coluna campaignId | P0/P1 | 4 h–1 d | ☐ |
| A1 | tenantId → FK + cascade | P1 | 1–2 d | ☐ |
| A2 | Expurgo ProcessedMessage/Session | P1 | 2 h | ☐ |
| A3 | Refatorar ConversationAgentService | P1 | 1–2 d | ☐ |
| A4 | Filas de disparo por tenant | P1 | 2–4 d | ☐ |
| A5 | Remover .chk/ do git | P1 | 15 min | ☐ |
| A6 | Cap de custo por tenant | P1 | 1 d | ☐ |
| M1 | Escape HTML opt-out | P2 | 1 h | ☐ |
| M2 | Padronizar controllers | P2 | 3 h | ☐ |
| M3 | Seed sem senha fixa | P2 | 30 min | ☐ |
| M4 | Revisar mem_limit / IA local | P2 | ½ d | ☐ |
| M5 | Pin WAHA + plano Cloud API | P2 | 30 min | ☐ |
| M6 | Backup automático em produção | P2 | 2 h | ☐ |
| M7 | Fix resolveLidToPhone | P2 | 1 h | ☐ |
| B1 | timingSafeEqual + remover ?token= | P3 | 1 h | ☐ |
| B2 | Limpar enum ActionType | P3 | 30 min | ☐ |
| B3 | Profanidade configurável | P3 | 1 h | ☐ |
| B4 | Logs PII → debug | P3 | 1 h | ☐ |

> ⚠️ **Regra do projeto:** migrations, seed e studio (`db:*`) são executados **apenas pelo Abel**. Os agentes devem escrever a migration mas não rodá-la.
