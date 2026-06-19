# PRD — Motor Proativo (Nexa)

- **Status**: Planejado
- **Data**: 2026-06-19
- **Referência TMS**: ADRs 022 (Proactive Engine), 023 (Automation Parameters), 024 (Automation Layer)

## Contexto

O Nexa é hoje **100% reativo**: a Lia só responde quando o cliente manda mensagem.
Não existe detecção de SLA vencido, follow-up de lead parado, digest diário de
tickets abertos ou alerta de conversa sem resposta há X horas.

O HiperTMS tem um motor proativo completo (ADRs 022-024) que detecta condições
temporais e age automaticamente dentro de guardrails. Adaptamos o conceito ao
domínio do Nexa: conversas, leads, tickets e campanhas.

Princípio herdado do TMS: **detecção ≠ execução**. O motor detecta e aciona
serviços de domínio idempotentes — nunca executa diretamente.

## Objetivo

Fazer a Lia agir proativamente com base em condições de tempo e estado:
- Notificar operador quando conversa fica parada além do SLA
- Recontatar lead que parou de responder (via Lia, não só follow-up fixo)
- Fechar tickets resolvidos automaticamente após janela de silêncio
- Enviar digest diário com tickets abertos para o time

## Usuários

| Perfil | Benefício |
|---|---|
| Operador / Suporte | Alertas de SLA em risco; não depende de monitorar manualmente |
| Vendedor | Follow-up de lead automático quando a Lia para de avançar |
| Gestor | Digest diário e digest semanal para visibilidade |
| Admin | Configuração de regras e limiares por tenant |

## Catálogo de regras (Fase 1)

| `ruleId` | Condição | Ação default | Nível |
|---|---|---|---|
| `conversation.stale_open` | Conversa OPEN há >4h sem nova mensagem | Notificar operador no in-app | L1 |
| `conversation.lead_no_reply` | Lead respondeu mas parou há >24h | Follow-up automático da Lia | L2 |
| `conversation.sla_breach` | Ticket escalado há >1h sem resposta humana | Alerta urgente + escalação | L1 |
| `campaign.followup_due` | Contato de campanha não respondeu após 48h | Mensagem de follow-up da Lia | L2 |
| `ticket.auto_close` | Ticket "resolved" há >48h sem nova mensagem | Auto-fechar ticket | L3 |
| `conversation.digest` | Fim do dia com tickets OPEN | Digest para o time (e-mail + in-app) | L1 |

**Níveis:**
- **L1** — notifica (sem ação automática)
- **L2** — sugere e executa com 1 toque do operador
- **L3** — age automaticamente dentro dos guardrails

## Modelo de dados proposto

```prisma
model PendingConversationEvent {
  id          String    @id @default(cuid())
  tenantId    String
  ruleId      String    // ex: 'conversation.stale_open'
  subjectId   String    // conversationId | campaignTargetId
  dedupeKey   String    @unique  // tenantId+ruleId+subjectId+bucket(hora/dia)
  level       String    // L1 | L2 | L3
  severity    String    // INFO | DUE_SOON | OVERDUE | CRITICAL
  status      String    // OPEN | RESOLVED | AUTO_EXECUTED | DISMISSED
  createdAt   DateTime  @default(now())
  resolvedAt  DateTime?
  metadata    Json?

  @@index([tenantId, status])
}
```

## Implementação (NestJS)

- **Avaliador**: `@Cron('*/15 * * * *')` por tenant — roda avaliadores puros que
  produzem `PendingConversationEvent` com upsert por `dedupeKey` (idempotente).
- **Executor**: consulta eventos OPEN com `level IN [L2, L3]` e delega aos
  serviços existentes: `ConversationsService`, `NotificationsService`, `SenderService`.
- **Configuração por tenant**: tabela `ProactiveRuleConfig` — on/off, nível, limiar,
  agenda, canal. Default global copiado no onboarding do tenant.

## Guardrails herdados

- Toda ação L2/L3 respeita o **kill switch** de autonomia (`AutonomyService`).
- Ações financeiras/contratuais: sempre L2 (opt-in para L3).
- Cada execução gera `AuditLog` com ruleId, subjectId e resultado.

## Relacionados

- ADRs 022/023/024 do HiperTMS (referência de implementação)
- `docs/ai/ai-guardrails.md` · `docs/adr/004-event-bus.md`
- `application/notifications/` · `application/sender/` · `application/followup/`
