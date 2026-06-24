# Nexa — Módulo de Suporte: Status de Implementação

**Criado:** 2026-06-22 | **Atualizado:** 2026-06-24
**Repo:** `apps/backend/` + `apps/frontend/`

---

## Gaps — status atual

### ✅ GAP 1a — Notificar cliente ao escalar para humano — IMPLEMENTADO
`conversation-agent.service.ts` linha ~474:
```typescript
this.waha.sendText(conv.phone,
  'Vou chamar um atendente para continuar seu atendimento. Aguarde, em breve alguém do time entrará em contato.'
)
```
`support-agent.service.ts` linha ~117: também cria notificação tipo `escalation` para a equipe no painel.

---

### ✅ GAP 1b — Notificar cliente ao fechar por inatividade — IMPLEMENTADO
`conversation-janitor.service.ts` — `closeNoResponseSupport()`:
```typescript
this.notifyClose(candidates.map(c => c.phone),
  `Fechamos seu chamado pois não recebemos resposta em ${SUPPORT_INACTIVITY_HOURS}h. Se ainda precisar de ajuda, é só nos chamar. 🙏`
);
```

---

### ✅ GAP 1c — Notificar cliente ao fechar como resolvido — IMPLEMENTADO
`conversation-janitor.service.ts` — `closeResolvedSupport()`:
```typescript
this.notifyClose(resolved.map(c => c.phone),
  'Seu chamado foi resolvido. Se precisar de mais ajuda, é só nos chamar novamente. 😊'
);
```

---

### ✅ GAP 2 — Resolução humana (endpoint + botão) — IMPLEMENTADO
**Backend:** `PATCH /conversations/:id/resolve` com `{ resolved: boolean }` em `conversations.controller.ts`
**Frontend:** Botão "Resolver / Reabrir" em `InboxPage.tsx` visível apenas quando `scope === 'support'`.
Verde para resolver, cinza para reabrir. Usa ícone de check/undo.

---

### ✅ GAP 3 — Motivo de fechamento no portal do cliente — IMPLEMENTADO
`PortalPage.tsx` — `OUTCOME_BANNER` exibido quando `detail.status === 'closed'`:
- Banner colorido com ícone e texto explicando o motivo do fechamento
- Cobre outcomes: `resolved`, `no_response`, e demais

---

## O que ainda falta no módulo de suporte

### ❌ MON-006 — SLA de escalação sem alerta
**Impacto:** Ticket escalado pode ficar sem atendimento humano por dias sem ninguém saber.
**O que falta:** `alertUnattendedEscalations()` no `ConversationJanitorService`
**Esforço:** ~3h | **Prioridade:** Semana 1
Ver detalhes em `docs/monitoramento.md` → MON-006.

---

## TMS — Web Chat embutido

**Status:** ❌ Não iniciado — sem PRD, sem ADR, sem código.

O `SupportDrawer` (portal de tickets) está implementado e em produção. O Web Chat embutido
(Lia respondendo em tempo real como widget flutuante no TMS) é uma feature separada que
ainda não foi especificada. Próximo passo: criar o PRD antes de qualquer código.

---

## Resumo geral

| Item | Status | Arquivo |
|---|---|---|
| GAP 1a — Notificar cliente na escalação | ✅ | `conversation-agent.service.ts` |
| GAP 1b — Notificar cliente no fechamento por inatividade | ✅ | `conversation-janitor.service.ts` |
| GAP 1c — Notificar cliente no fechamento resolvido | ✅ | `conversation-janitor.service.ts` |
| GAP 2 — Endpoint resolve humano | ✅ | `conversations.controller.ts` |
| GAP 2 — Botão Resolver no painel | ✅ | `InboxPage.tsx` |
| GAP 3 — Motivo de fechamento no portal | ✅ | `PortalPage.tsx` |
| MON-006 — SLA escalação sem alerta | ❌ | `conversation-janitor.service.ts` |
| Web Chat embutido (TMS) | ❌ | — sem PRD |
