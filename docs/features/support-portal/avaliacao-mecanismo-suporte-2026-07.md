# Avaliação do mecanismo de suporte — Nexa + HiperTMS (jul/2026)

Análise do ciclo de vida do chamado (abrir, resolver, fechar automático, atendimento
humano) comparado ao padrão de mercado. Referências escolhidas: **Zendesk** (ciclo de
vida de ticket, SLA, CSAT — o padrão consolidado) e **Intercom Fin** (suporte
AI-first com resolução pela IA e escalação a humano — o padrão moderno que mais se
parece com a Lia).

## 1. Como funciona hoje (verificado no código)

### Modelo
O chamado é a própria `aiConversation` (mesmo modelo dos leads comerciais), com:
`status` (open / waiting_customer / waiting_internal / escalated / opt_out / closed),
`ticketCategory`, `ticketPriority`, `rootCause` (usado como assunto), `sourceChannel`
(portal / whatsapp / email), `resolvedAt`, `autoCloseAt`, `outcome`
(resolved / no_response / archived), e trilha de auditoria completa em
`conversationStageHistory`.

### Abertura
- **Portal/widget TMS**: `PortalTicketsService.open()` cria a conversa (canal
  `portal`), associa o contato (find-or-create com telefone sintético
  `portal:<id>` se não houver real) e injeta a 1ª mensagem no mesmo pipeline da
  Lia (router → support → supervisor). Assunto e categoria vêm do form.
- **WhatsApp/e-mail**: mesmo pipeline; o case-classifier preenche
  categoria/prioridade/causa raiz.
- Widget no TMS (`SupportDrawer.tsx`): abas Abrir chamado / Meus chamados /
  Chamados da empresa (gestor), com polling do ticket ativo enquanto aberto.

### Resolução e fechamento automático (janitor, roda a cada hora)
- IA resolve → `resolvedAt` + `autoCloseAt = +48h`; sem retorno do cliente em 48h
  → `closed (resolved)` + mensagem de encerramento via WhatsApp.
- Ticket aberto sem resposta do cliente por 48h → `closed (no_response)` + aviso.
- Escalado a humano → janitor **não** fecha (correto); alerta de SLA após 4h sem
  atendimento (`MON-006`), com dedup de 24h.
- Extras maduros: expurgo de tabelas efêmeras, anonimização LGPD (730d),
  `ticket-intelligence` aprende com tickets fechados por humano.

### Atendimento humano
- `needsHuman` → `status='escalated'` → Inbox do Nexa. Humano responde, marca
  resolvido (`setResolved`), reabre manualmente ou arquiva. Atribuição existe
  (`assign`), mas é orientada a **vendedor**, não a agente de suporte.

## 2. Veredito de encaixe

**A arquitetura está certa e é moderna.** O desenho conversation-centric com IA
resolvendo primeiro e humano como escalação é exatamente o modelo Intercom Fin —
mais adequado ao Nexa do que o modelo ticket-centric puro (Zendesk/Jira SM).
**Não recomendo adotar um helpdesk externo**: o pipeline omnichannel único
(portal + WhatsApp + e-mail no mesmo fluxo), a trilha de auditoria e o loop de
aprendizado já superam o que uma integração Zendesk entregaria, e um helpdesk
externo quebraria o multi-tenant e a integração nativa com o TMS.

O que falta são **6 mecanismos pontuais** que os consolidados têm e o Nexa não.

## 3. Gaps vs. padrão de mercado (ordem de prioridade)

### G1 — Resposta em chamado fechado não reabre (CRÍTICO)
`PortalTicketsService.reply()` não filtra status: aceita resposta em ticket
`closed`, grava a mensagem e o status permanece fechado — a mensagem morre num
chamado encerrado. O `conversation-agent` não tem lógica de reopen.
**Padrão Zendesk**: resposta em *Solved* reabre; em *Closed* cria follow-up
ticket vinculado. **Fix**: no `reply()`/pipeline, se `status='closed'` há menos
de N dias → reabrir (`open`, limpa outcome, histórico `reaberto_cliente`); se
mais antigo → abrir novo chamado vinculado ao anterior.

### G2 — Sem CSAT (ALTO)
Nenhuma pesquisa de satisfação após resolução. Todo consolidado mede CSAT no
fechamento (Zendesk: survey; Intercom: rating no fim da conversa). Sem isso não
há como saber se o auto-close de 48h está fechando chamado resolvido ou
abandonando cliente insatisfeito. **Fix**: na mensagem de encerramento e no
portal, pedir nota 1–5 (campo novo `csatScore`/`csatComment` + endpoint público
tokenizado). O `ticket-intelligence` já é o consumidor natural desse dado.

### G3 — Confirmação de resolução pelo cliente (ALTO)
A IA se autodeclara resolvida (`resolvedAt`) e o silêncio de 48h confirma. O
padrão Fin pergunta explicitamente "isso resolveu seu problema?" — resposta
positiva fecha na hora (com CSAT), negativa reescala. Silêncio continua caindo
no auto-close de 48h. Melhora a precisão do `outcome=resolved` e alimenta G2.

### G4 — SLA por prioridade e horário comercial (MÉDIO)
`ticketPriority` existe mas nada o consome: o alerta de SLA é único (4h fixas,
qualquer prioridade) e conta horas corridas. Padrão: política de SLA por
prioridade (ex.: urgente 1h / alta 4h / normal 8h de 1ª resposta humana) em
horário comercial, com estados "próximo de estourar" e "estourado" visíveis no
Inbox. O dedup do alerta é um `Map` em memória — some no restart e quebra com
mais de uma réplica; mover para o banco (campo `slaAlertedAt`).

### G5 — Identidade do chamado (MÉDIO)
Sem número de chamado humano (ex.: `#4821`) — cliente e suporte referenciam por
UUID/assunto. `rootCause` acumula dupla função (assunto digitado pelo cliente E
causa raiz classificada). **Fix**: sequência por tenant para número do ticket +
campo `subject` separado de `rootCause`.

### G6 — Notificação de fechamento não cobre o portal (BAIXO)
`notifyClose()` só envia WhatsApp e pula `email:`, mas telefones sintéticos
`portal:...` são enviados ao WAHA (falha com warn — ruído de log). Cliente que
abriu pelo widget e não deixou telefone real não fica sabendo do fechamento a
menos que reabra o drawer. **Fix**: pular `portal:` no WAHA e notificar via
e-mail do usuário TMS (o handoff já carrega a identidade) ou badge no widget.

## 4. Pontos fortes a preservar

Pipeline único omnichannel; trilha `conversationStageHistory` (nenhum concorrente
pequeno tem auditoria assim); auto-close com avisos ao cliente (48h = default do
mercado); janitor idempotente com fixes de bugs documentados (BUG-003/004);
fallback WhatsApp quando o portal falha; escopo por usuário + aba gestor;
LGPD/retenção automatizada; loop de aprendizado `ticket-intelligence`.

## 5. Roadmap sugerido

| Fase | Item | Esforço |
|---|---|---|
| 1 | G1 reopen/follow-up + G6 notify portal | pequeno (2 services) |
| 2 | G3 confirmação de resolução + G2 CSAT | médio (playbook + 1 migration + portal UI) |
| 3 | G5 número de ticket + subject | pequeno (migration aditiva + UI) |
| 4 | G4 política de SLA por prioridade | médio (config por tenant + Inbox UI) |

Tudo aditivo — nenhum item exige quebrar o contrato TMS↔Nexa (regras do
`REGRAS-SQUAD.md` se aplicam: campos novos opcionais, receptor primeiro).
