# Plano de correção — Auditoria de entrega 2026-07-10 (SQUAD NEXA)

> **Para o agente/dev:** leia `REGRAS-SQUAD.md` antes de qualquer mudança.
> Este plano corrige o que a auditoria encontrou de INCOMPLETO ou QUEBRADO na
> entrega reportada como "tudo em produção". Executar na ordem (C1 → C3).
> Um commit por tarefa. Checklist do REGRAS-SQUAD.md ao concluir cada uma.

## Resultado da auditoria (verificado no código em 2026-07-10)

| Item | Status real |
|------|-------------|
| N1 reabertura | ✅ completo (portal + whatsapp + testes + migration) |
| N2 confirmação/CSAT | ❌ **build quebrado + feature morta** (ver C1) |
| N3 ticket number | ⚠️ metade: schema/exposição ok, **número nunca é gerado** (ver C2) |
| N4 SLA/dedup/notify | ✅ completo |
| K1 preços dinâmicos | ✅ completo (resta comentário stale, ver C3) |
| K2 features novas na KB | ✅ completo |
| K3 help-urls | ✅ completo |

**Regra violada:** REGRAS-SQUAD.md Regra 4 (gates) — código commitado que não
compila. Nunca declarar tarefa pronta sem build passando.

---

## C1 — N2: fazer o CSAT existir de verdade (CRÍTICO — backend não compila)

**Problemas encontrados:**
1. `application/agents/support-agent.service.ts:69` chama
   `this.handleCsatConfirmation(tenantId, conversationId, question)` — **o
   método não existe em nenhum lugar do arquivo/projeto**. `nest build` FALHA.
2. `csatToken` existe no schema e é exposto no `mapTicket`
   (`portal.controller.ts`), mas **nenhum código gera o token** — é sempre null.
3. O endpoint público **`POST /portal/csat/:token` não existe** no
   `portal.controller.ts` — o widget do TMS já chama essa rota (submitCsat, T2).

**Implementar:**
1. Criar `handleCsatConfirmation(tenantId, conversationId, question)` no
   support-agent:
   - classifica a resposta (sim/não/neutro — heurística simples + fallback LLM);
   - **positiva** → fecha (`status='closed'`, `outcome='resolved'`,
     `outcomeAt/endedAt=now`), gera `csatToken` (randomBytes url-safe, unique),
     grava histórico (`reason='confirmado_cliente'`) e responde pedindo a nota
     1–5 (o portal mostra as estrelas; WhatsApp aceita resposta numérica);
   - **negativa** → limpa `resolvedAt/autoCloseAt`, `status='escalated'`,
     histórico (`reason='resolucao_recusada'`), notifica a equipe;
   - **neutra** → segue o pipeline normal (a mensagem é uma pergunta nova).
2. Gerar `csatToken` TAMBÉM no fechamento pelo janitor (`closeResolvedSupport`)
   e no `setResolved` manual — todo fechamento resolved tem token.
3. Criar `POST /portal/csat/:token` no `portal.controller.ts` — **público, SEM
   guard de sessão** (o token é a credencial): valida token existente e não
   usado (`csatScore` ainda null), grava `csatScore` (1–5) + `csatComment`
   opcional, invalida reuso. Rate-limit padrão do app cobre abuso.
4. Resposta numérica 1–5 recebida via WhatsApp logo após fechamento → gravar
   como CSAT da conversa (mesma validação).

**Aceite:** `nest build` passa; testes: confirmação positiva/negativa/neutra,
token gerado nos 3 caminhos de fechamento, endpoint rejeita token inválido/usado,
dupla submissão rejeitada.

## C2 — N3: gerar o ticketNumber (sem isso o campo é decorativo)

**Problema:** coluna existe, controller expõe, busca cobre — mas **nenhum código
escreve `ticketNumber`**. Todo chamado exibe o fallback no widget.

**Implementar:**
1. Sequência **por tenant**, atômica. Recomendado: tabela
   `TicketCounter(tenantId pk, lastNumber int)` com
   `UPDATE ... SET last_number = last_number + 1 RETURNING` em transação
   (migration aditiva) — não usar `MAX(ticketNumber)+1` (race).
2. Gerar no momento em que a conversa vira ticket:
   - `portal-tickets.service.open()` (canal portal, sempre ticket);
   - `persistTicketFields`/case-classifier quando `ticketCategory` é definido
     pela primeira vez em conversas WhatsApp/email.
3. Backfill opcional dos tickets existentes (script SQL aditivo, ordem por
   `createdAt`) — escrever e deixar o Abel decidir se roda.

**Aceite:** teste de concorrência (2 aberturas simultâneas → números distintos);
ticket novo via portal E via WhatsApp recebe número; migration não executada.

## C3 — Higiene (rápido)

1. `hipertms.connector.ts:8` — comentário diz "getPlans devolve mock", mas o
   método já busca `/nexa/plans` real. Atualizar o comentário.
2. Registrar em `docs/api-contract.md` os endpoints do TMS já consumidos:
   `GET /nexa/plans`, `GET /nexa/customers/by-phone` (existem e funcionam —
   a alegação de que eram "outra sprint" está incorreta).

---

## Lembrete de processo (para o squad)

A entrega foi reportada como "tudo em produção" com backend que **não compila**.
Antes de reportar concluído: `pnpm build` + testes DE VERDADE, e colar o
checklist do REGRAS-SQUAD.md com os resultados. Reporte falso custa mais caro
que atraso.
