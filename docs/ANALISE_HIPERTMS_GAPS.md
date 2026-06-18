# Análise Comparativa: HiperTMS → Nexa
> Gaps de documentação e oportunidades de implementação
> Data: 2026-06-18 | Autor: análise via Claude

---

## O que foi analisado

Foram lidos e comparados os `docs/` dos dois repositórios:

- **HiperTMS** (`hipertms_v12/docs/`) — TMS com fiscal, precificação, financeiro e camada de proatividade
- **Nexa** (`nexa/docs/`) — Plataforma de IA (Lia) integrada ao HiperTMS para suporte e vendas por WhatsApp

A pergunta central: **O que o HiperTMS tem documentado que o Nexa não tem — e que vale trazer?**

---

## Resumo executivo

| Área | HiperTMS tem | Nexa tem | Prioridade |
|---|---|---|---|
| Canal email | ✅ Serviço completo (outbox, retry, template, opt-out) | ❌ Inexistente | 🔴 Alta |
| Motor proativo (IA reage ao tempo) | ✅ ADRs 022/023/024 + PRD | ❌ Nexa é 100% reativo | 🔴 Alta |
| Relatórios / Analytics | ✅ 35+ relatórios catalogados | ❌ Zero | 🔴 Alta |
| Manuais do usuário | ✅ 10 manuais cobrindo todos os módulos | ❌ Zero | 🟡 Média |
| Estratégia de escalabilidade | ✅ Análise detalhada com custo por fase | ❌ Não existe | 🟡 Média |
| Estratégia de produto/negócio | ✅ Sumário executivo + monetização | ⚠️ Raso (só vision.md) | 🟡 Média |
| Lifecycle workflows (stepper) | ✅ ADR 026 — workflow por entidade | ❌ Conversas sem stepper | 🟡 Média |
| Context map | ✅ Existente (simples) | ❌ Só C4 | 🟢 Baixa |

---

## 1. Canal Email — gap crítico de implementação

### O que o HiperTMS tem

O `docs/api/email-alerts-service.md` documenta um serviço de email multi-tenant completo:

- **Outbox pattern**: `TenantMailMessage` com status `PENDING | SENT | FAILED`
- **Template por tenant**: logo, cor, nome, remetente configuráveis por `SystemCoreTenant.metadata.branding`
- **Retry com backoff exponencial** + jitter via `MailRetryScheduler`
- **Opt-out**: `GET /api/public/mail/unsubscribe?token=...` — unsubscribe por link no email
- **Uso atual**: recuperação de senha e alertas operacionais
- **Env vars**: `MAIL_FROM`, `MAIL_MAX_ATTEMPTS`, `MAIL_RETRY_BASE_DELAY_MS`, etc.

### O que o Nexa não tem

O Nexa não tem **nenhum canal de email**. Todos os contatos são por WhatsApp (WAHA) ou portal web. Isso é um gap em três cenários:

1. **Notificações transacionais** — quando a Lia escala um atendimento, o operador recebe só o sino in-app (polling 30s). Um email seria muito mais confiável.
2. **Campanhas** — o Nexa tem campanhas por WhatsApp e Status. Email seria o canal 3 com custo zero e sem risco de ban.
3. **Portal de suporte** — o cliente abre um ticket via portal mas nunca recebe confirmação por email com o número do ticket.

### O que criar no Nexa

**ADR-027 já existe** (web-chat). O próximo seria um **ADR para canal email**, modelado exatamente na arquitetura do HiperTMS:

```
docs/adr/ADR-028-canal-email.md
docs/features/canal-email/prd.md
```

**Implementação sugerida (baseada no HiperTMS):**

```
MailMessage (Prisma)
  id, tenantId, to, subject, templateId, metadata jsonb
  status: PENDING | SENT | FAILED
  attempts, lastFailedAt, nextAttemptAt

MailService.send(tenantId, { to, subject, template, vars })
  → cria MailMessage(PENDING) na mesma transação
  → scheduler pega e envia com backoff
```

**Casos de uso imediatos:**
- Ticket aberto no portal → email de confirmação para o cliente com número e link
- Escalonamento de IA → email para operador humano (além do sino in-app)
- Campanhas: 3º canal (além de WhatsApp texto e Status)

---

## 2. Motor Proativo — o maior gap conceitual

### O que o HiperTMS tem

Três ADRs formam a espinha dorsal da proatividade:

**ADR 022 — Proactive Engine:**
- Modelo `PendingEvent` com `ruleId`, `subjectType`, `severity`, `level` (L1/L2/L3), `status` (OPEN/RESOLVED/AUTO_EXECUTED)
- Avaliador recorrente por tenant + timezone → produz eventos acionáveis
- **L1** = notifica, **L2** = sugere em 1 toque, **L3** = age automaticamente dentro de guardrails
- Princípio: detecção ≠ execução (o motor chama serviços de domínio idempotentes)

**ADR 023 — Automation Parameters:**
- `AutomationRuleConfig` por (tenant, ruleId): on/off, nível, limiares, agenda, canal, guardrails
- Default global → cópia no onboarding → ajuste pelo tenant
- Money/fiscal: sempre L2 por default; L3 exige opt-in explícito

**ADR 024 — Automation Layer (n8n):**
- Eventos de saída: outbox transacional + webhooks assinados (HMAC)
- Ações de entrada: `/automation/actions/{actionId}` idempotentes
- Mesmo guardrail via UI e via n8n — não é porta dos fundos

**ADR 026 — Lifecycle Workflows:**
- Cada entidade (embarque, cotação, viagem, fatura) tem workflow declarativo
- Stepper no detalhe + "próxima ação" no cockpit
- Status derivado do estado real (não persistido)

### O que o Nexa não tem

O Nexa é **100% reativo**. A Lia só responde quando o cliente manda mensagem. Não existe:

- Detecção de conversa aberta há X horas sem resposta → trigger automático
- Follow-up proativo de leads que pararam de responder
- Digest diário para o operador: "5 tickets sem resolução há mais de 24h"
- Alerta de SLA: "Este ticket está há 4h sem resposta do time"
- Follow-up de campanha: "Enviamos para 200 contatos, 40 responderam mas 160 não — seguimento automático após 48h"

### O que adaptar para o Nexa

O conceito do motor proativo do HiperTMS **cabe perfeitamente** no Nexa, adaptado ao domínio de conversas:

**Catálogo de regras para o Nexa:**

| `ruleId` | Condição | Ação default | Nível sugerido |
|---|---|---|---|
| `conversation.stale_open` | Conversa OPEN há >4h sem mensagem | Notificar operador | L1 |
| `conversation.lead_no_reply` | Lead respondeu mas parou há >24h | Follow-up automático Lia | L2 |
| `conversation.sla_breach` | Ticket sem resposta humana após escalação há >1h | Alerta urgente | L1 |
| `campaign.followup_due` | Contato de campanha não respondeu após 48h | Mensagem de follow-up | L2 |
| `ticket.auto_close` | Ticket marcado "resolved" há >48h sem nova mensagem | Auto-fechar | L3 |
| `conversation.digest` | Fim do dia com tickets abertos | Digest para o time | L1 |

**Docs a criar:**
```
docs/adr/ADR-028-motor-proativo-nexa.md
docs/features/proactive-engine/prd.md
```

**Implementação (adaptada do HiperTMS):**

```ts
// Modelo
model PendingConversationEvent {
  id          String   @id @default(cuid())
  tenantId    String
  ruleId      String   // 'conversation.stale_open' | 'campaign.followup_due' | ...
  subjectId   String   // conversationId ou campaignTargetId
  dedupeKey   String   @unique  // tenant+rule+subject+bucket
  level       String   // L1 | L2 | L3
  severity    String   // INFO | DUE_SOON | OVERDUE | CRITICAL
  status      String   // OPEN | RESOLVED | AUTO_EXECUTED | DISMISSED
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?
}
```

O motor roda como NestJS `@Cron()` por tenant, chama avaliadores puros, e delega execução para os serviços existentes (`ConversationsService`, `NotificationsService`, `SenderService`).

---

## 3. Relatórios / Analytics — zero no Nexa

### O que o HiperTMS tem

35+ relatórios catalogados em `relatorios-catalog.md`, organizados em:

- Proativos (`📩`) — enviados automaticamente em horário definido
- On-demand (`🖥️`) — acessados na plataforma

Por domínio: Cotações, Embarques, Viagens, Financeiro, Frota, Precificação, Fiscal, Compras, Motor Proativo.

A premissa central: relatórios proativos devem ser curtos (sujeito + contagem + ação), chegar no horário certo, e ter link de ação direto.

### O que o Nexa não tem

O Nexa não tem **nenhum relatório documentado**. A plataforma processa conversas, envia campanhas, classifica tickets — mas não há analytics nem para o operador nem para o admin da plataforma.

### Catálogo sugerido para o Nexa

**Proativos (diários/semanais):**

| # | Relatório | Canal | Frequência |
|---|---|---|---|
| N1 | **Digest de Tickets Pendentes** | Email + In-app | Diário (manhã) |
| N2 | **Conversas Escalonadas Não Atendidas** | Email urgente | Tempo real |
| N3 | **SLA em Risco** | In-app | Diário (manhã) |
| N4 | **Resumo Semanal de Campanhas** | Email | Semanal (segunda) |
| N5 | **Leads Quentes Sem Seguimento** | In-app | Diário (manhã) |

**On-demand:**

| # | Relatório | Métricas |
|---|---|---|
| A1 | **Taxa de Resolução por IA vs Humano** | % resolvida automaticamente, % escalonada |
| A2 | **Efetividade de Campanhas** | Entregues, respondidos, convertidos por campanha |
| A3 | **Funil de Suporte** | Abertura → classificação → diagnóstico → resolução → fechamento |
| A4 | **Tempo Médio de Atendimento** | Por categoria, por prioridade, p50/p95 |
| A5 | **Volume de Conversas por Canal** | WhatsApp vs web-chat vs portal |
| A6 | **Confiança da IA por Categoria** | % high/low confidence por category |
| A7 | **Tickets Recorrentes** | Mesmo problema aberto múltiplas vezes pelo mesmo contato |

**Docs a criar:**
```
docs/features/analytics/prd.md
```

---

## 4. Manuais do Usuário — ironia do suporte sem suporte

### O que o HiperTMS tem

10 manuais técnicos completos em `docs/manuais tecnicos/`:

1. Primeiros Passos
2. Vendas
3. Operação
4. Cadastros
5. Frota
6. Financeiro
7. Precificação
8. Equipes
9. Compras
10. Administração

### O que o Nexa não tem

**Zero documentação voltada ao usuário final.** O Nexa é uma plataforma de suporte que usa uma base de conhecimento (KB) para responder clientes — mas não tem KB sobre como usar o próprio Nexa. O operador que abre o Nexa pela primeira vez não tem onde buscar ajuda.

### O que criar no Nexa

Manuais básicos para os perfis de usuário:

```
docs/manuais/
  01-primeiros-passos.md      — onboarding, conectar WhatsApp, configurar Lia
  02-inbox-atendimento.md     — usar o inbox, assumir conversa, responder cliente
  03-campanhas.md             — criar campanha, segmentar, acompanhar resultados
  04-base-conhecimento.md     — adicionar KB, aprovar, gerenciar conteúdo
  05-portal-de-suporte.md     — como o cliente usa o portal, como o operador acompanha
  06-configuracoes.md         — configurar agentes, parâmetros, usuários, planos
  07-administracao.md         — platform admin, gerenciar tenants
```

**Prioridade imediata:** `01-primeiros-passos.md` e `02-inbox-atendimento.md` — são os mais críticos para onboarding de novos clientes.

---

## 5. Estratégia de Escalabilidade

### O que o HiperTMS tem

`escalabilidade-hipertms.md` — análise detalhada de gargalos do código + roadmap por fases:

- Diagnóstico: Prisma sem pool explícito (crítico), Socket.io sem Redis adapter, banco subdimensionado, deploy sem zero-downtime, sem cache de aplicação
- Roadmap: 0 tenants → 50 → 200 → 500 → 2k → 5k → 10k com ações e custo incremental
- Custo estimado a 10k tenants: ~$550-700/mês em DigitalOcean

### O que o Nexa não tem

O Nexa tem `docs/infra/` com docs de deploy mas nenhuma análise de escalabilidade específica para suas preocupações:

- Quantas sessões WAHA suporta 1 servidor?
- Quantas conversas simultâneas o Socket.io suporta sem Redis adapter?
- O Prisma pool está correto para conversas concorrentes?
- Qual o custo de escalar para 100 tenants com 500 conversas/dia cada?

### O que criar no Nexa

```
docs/infra/escalabilidade-nexa.md
```

Modelado no documento do HiperTMS, mas focado nos gargalos específicos do Nexa:
- WAHA: sessões por número de WhatsApp, limites do WEBJS vs NOWEB
- Socket.io: sem Redis adapter hoje → bloqueia escala horizontal
- Anthropic API: rate limits por tenant, custo por conversa
- Prisma pool: mesmo problema do HiperTMS (provavelmente)
- NestJS: jobs de campanha bloqueantes (SenderService.tick()) no event loop

---

## 6. Estratégia de Produto / Negócio

### O que o HiperTMS tem

`product/strategy/sumario-executivo.md` — estratégia clara em 3 fases:

1. TMS (agora) — mensalidade cobre OpEx
2. Hub de Fretes — subcontratação digital + financeiro → começa o lucro
3. Marketplace de Insumos — fornecedores vendem para a base

`product/strategy/estrategia-monetizacao.md` — modelo detalhado com ancoras de LTV, CAC, GMV.

### O que o Nexa não tem

O Nexa tem apenas `docs/product/vision.md` que descreve a visão mas não tem estratégia de monetização, fases de crescimento, ou métricas North Star claramente definidas.

### O que criar no Nexa

```
docs/product/strategy/sumario-executivo.md   — tese do Nexa, fases, economia
docs/product/strategy/monetizacao.md         — modelo de planos, LTV, CAC, North Star
```

---

## Conclusão: ordem de prioridade

### 🔴 Implementar (gap técnico que impacta produto hoje)

1. **Canal Email** — ADR + PRD + implementação baseada no padrão HiperTMS
   - Unblocks: notificações de escalonamento confiáveis, confirmação de ticket no portal
   - Esforço: médio (2–3 sprints)

2. **Analytics básicos** — catálogo de relatórios + tela de métricas
   - Unblocks: visibilidade do time sobre efetividade da Lia
   - Esforço: médio (iterativo)

### 🟡 Planejar (ADR + PRD, implementar no próximo quarter)

3. **Motor proativo** — ADR-028 adaptando ADR 022/023/024 do HiperTMS
   - Catálogo inicial: 5–6 regras de maior valor (stale conversations, follow-up leads, digest diário)
   - Unblocks: Nexa deixa de ser só reativo; melhora SLA de suporte

4. **Manuais do usuário** — começar com primeiros-passos e inbox
   - Unblocks: onboarding de novos clientes sem dependência de suporte do time

5. **Escalabilidade** — análise + roadmap de infra
   - Unblocks: decisões de infra antes de crescer tenants

### 🟢 Registrar (baixo esforço, boa prática)

6. **Context map** — 1 página descrevendo os bounded contexts do Nexa (Lia, campanhas, suporte, vendas, conectores)
7. **Sumário executivo** — estratégia e monetização do Nexa em documento próprio

---

## Referências

| Arquivo HiperTMS | Relevância para Nexa |
|---|---|
| `docs/api/email-alerts-service.md` | Modelo para implementar canal email no Nexa |
| `docs/architecture/decisions/022-proactive-engine.md` | Base para ADR do motor proativo do Nexa |
| `docs/architecture/decisions/023-automation-parameters.md` | Modelo de configuração de proatividade por tenant |
| `docs/architecture/decisions/024-automation-layer-n8n.md` | Webhooks de saída + ações idempotentes |
| `docs/architecture/decisions/026-lifecycle-workflows.md` | Inspiração para stepper de conversa/campanha |
| `docs/design-system/Design Master/relatorios-catalog.md` | Estrutura para catálogo de relatórios do Nexa |
| `docs/design-system/Design Master/escalabilidade-hipertms.md` | Template para análise de escalabilidade do Nexa |
| `docs/product/proactive-assistant-vision.md` | Visão de produto proativo adaptável ao Nexa |
| `docs/product/strategy/sumario-executivo.md` | Template para estratégia de produto do Nexa |
| `docs/manuais tecnicos/` | Template e estrutura para manuais do usuário Nexa |
