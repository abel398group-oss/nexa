# Plano de implementação — Melhorias do módulo de suporte (SQUAD NEXA)

> **Para o agente/dev que vai implementar:** leia `REGRAS-SQUAD.md` (raiz do repo)
> antes de qualquer mudança. Execute as tarefas NA ORDEM (N1 → N4). Uma tarefa por
> vez, um commit por tarefa. Cole o checklist final do REGRAS-SQUAD.md ao concluir
> cada uma. Base da análise: `avaliacao-mecanismo-suporte-2026-07.md` (mesmo diretório).
>
> **O lado TMS tem um plano espelho** (`hipertms_v12/docs/features/support/plano-implementacao-suporte-2026-07.md`)
> que DEPENDE deste. Regra de deploy: **Nexa (receptor) primeiro, TMS depois.**
> Nada aqui altera o contrato existente TMS↔Nexa — só adiciona campos opcionais.

## Escopo

Fechar os gaps G1–G6 da avaliação. Todas as migrations são ADITIVAS e ficam
escritas mas **não executadas** — avisar o Abel para rodar `prisma migrate deploy`.

---

## N1 — Reabertura de chamado fechado (CRÍTICO — fazer primeiro)

**Bug:** resposta de cliente em chamado `closed` não reabre — a mensagem morre no
ticket e ninguém vê. `portal-tickets.service.ts#reply()` não filtra status;
`conversation-agent.service.ts` não tem lógica de reopen.

**Implementar:**
1. No `reply()` do portal E no fluxo inbound (WhatsApp/e-mail), antes de processar:
   - conversa `closed` há **< 7 dias** → reabrir: `status='open'`,
     `outcome/outcomeAt/resolvedAt/autoCloseAt/endedAt = null`, histórico em
     `conversationStageHistory` com `reason='reaberto_cliente'`.
   - conversa `closed` há **≥ 7 dias** → criar NOVO chamado vinculado: campo novo
     `followUpOfId String?` em `aiConversation` (migration aditiva) apontando para
     o chamado original; processar a mensagem no novo.
2. Janela configurável: `REOPEN_WINDOW_DAYS` (default 7).
3. Todo caminho de descarte loga `this.logger.warn` com o motivo.

**Aceite:** testes unitários dos 2 cenários (reabre <7d; follow-up ≥7d) +
teste de que mensagem em conversa aberta segue fluxo normal. Migration escrita,
não executada.

## N2 — Confirmação de resolução + CSAT

**Contexto:** a IA se autodeclara resolvida (`support-agent.service.ts` seta
`resolvedAt` + `autoCloseAt=+48h`) sem perguntar ao cliente. Não existe nota de
satisfação em lugar nenhum.

**Implementar:**
1. Ao marcar resolvido, a Lia pergunta "Isso resolveu seu problema?" (playbook do
   support agent):
   - resposta positiva → fecha na hora (`outcome='resolved'`) e pede nota 1–5;
   - negativa → reescala (`status='escalated'`, histórico com reason);
   - silêncio → mantém o auto-close de 48h atual (não mexer no janitor).
2. Migration aditiva: `csatScore Int?` e `csatComment String?` em `aiConversation`.
3. Endpoint público tokenizado para registrar a nota via portal — seguir o padrão
   do `portal-session.guard.ts`. Nota só pode ser registrada 1x por chamado.
4. Expor `csatScore` no `detail()` e `listFields` do `portal-tickets.service.ts`
   (campo novo na resposta = aditivo, não quebra o widget atual do TMS).

**Aceite:** testes dos 3 fluxos (positivo/negativo/silêncio) + teste de dupla
submissão de CSAT rejeitada. Migration escrita, não executada.

## N3 — Número de chamado + assunto separado

**Contexto:** chamado só tem UUID; `rootCause` acumula assunto digitado pelo
cliente E causa raiz classificada pela IA.

**Implementar:**
1. Migration aditiva: `ticketNumber Int?` (sequência **por tenant** — usar
   transação/lock para não colidir) e `subject String?` em `aiConversation`.
   Gerar `ticketNumber` apenas quando a conversa vira ticket (tem `ticketCategory`).
2. `portal-tickets.service.open()`: `dto.subject` → coluna `subject` (parar de
   gravar em `rootCause`). `rootCause` fica exclusivo do case-classifier.
3. Incluir `ticketNumber` e `subject` em `listFields` e `detail()`.
4. `list()`/`listByTenant()`: busca cobre `subject` além de `rootCause`.

**Aceite:** teste de sequência por tenant sem colisão sob concorrência.
Migration escrita, não executada.

## N4 — SLA por prioridade + dedup persistente + notify portal

**Contexto:** `conversation-janitor.service.ts` — alerta de SLA único (4h fixas)
ignora `ticketPriority`; dedup `slaAlerted` é Map em memória (morre no restart,
quebra com 2+ réplicas); `notifyClose()` manda phone sintético `portal:...` ao
WAHA (falha inútil, ruído de log).

**Implementar:**
1. SLA por prioridade via env com defaults: urgente 1h, alta 4h, normal 8h,
   baixa 24h (`SLA_HOURS_URGENT/HIGH/NORMAL/LOW`). `alertSlaEscalated()` usa o
   prazo da prioridade do ticket; sem prioridade → normal.
2. Trocar o Map por `slaAlertedAt DateTime?` em `aiConversation` (migration
   aditiva) — dedup de 24h sobrevive a restart e a múltiplas réplicas.
3. `notifyClose()`: pular phones com prefixo `portal:` (além de `email:`).
4. Alerta loga prioridade + prazo aplicado.

**Aceite:** testes do janitor por prioridade + dedup persistente + notifyClose
não chama WAHA para `portal:`/`email:`. Migration escrita, não executada.

---

## Regras transversais (valem para as 4 tarefas)

- Contrato TMS↔Nexa: NENHUM campo existente removido/renomeado; DTOs de endpoints
  consumidos pelo TMS só ganham campos `@IsOptional()`.
- Gates antes de cada commit: type-check frontend no sandbox, backend build pelo
  Abel, testes do escopo. Zero `error TS`.
- Commits: Conventional Commits em inglês, um por tarefa
  (`feat(portal): reopen closed tickets on customer reply` etc). **Sem push.**
- Ao terminar N1–N4: avisar o Abel que o squad TMS pode iniciar T1/T2
  (após deploy do Nexa).
