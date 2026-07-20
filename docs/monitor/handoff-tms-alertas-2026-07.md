# Handoff TMS — ajustes de UI após decisões de alertas (2026-07-20)

> Divisão de responsabilidade do brainstorm de alertas/conflitos de 20/07/2026.
> **Nexa**: standby do alerta imediato (flag `MONITOR_IMMEDIATE_ALERTS`, ver
> `docs/STANDBY.md`), aviso "não responda" nas mensagens, gate de números
> internos, ADRs 034/035. **TMS**: apenas ajustes de interface descritos aqui —
> NENHUMA mudança de contrato/payload é necessária.

## O que mudou no Nexa que afeta a UX do TMS

1. **Alerta imediato em standby** — evento CRITICAL novo NÃO dispara WhatsApp
   na hora; tudo sai no digest agendado. O campo `immediateSeverity` continua
   aceito no `PUT /api/monitor/external-config` (Regra 1 — retrocompat), mas
   fica **inerte** enquanto o standby estiver ativo.
2. **Canal de alertas é só-saída** — toda mensagem WhatsApp do Monitor abre com
   "🔕 Mensagem automática — não é necessário responder". Respostas são
   descartadas pelo Nexa (gate de números internos).

## Tarefas para o squad TMS (só UI/copy — sem tocar em payload)

- [ ] Na tela de Automação (config do Monitor): localizar qualquer controle ou
      texto que prometa alerta **imediato** (ex.: seletor de severidade
      imediata, copy "avisamos na hora"). Ocultar o controle ou ajustar o texto
      para refletir digest-only ("alertas enviados no resumo do horário
      configurado").
- [ ] **NÃO remover** `immediateSeverity` (nem qualquer campo) do payload do
      `PUT external-config` — o Nexa continua aceitando; remover quebraria
      retrocompat de PUTs antigos.
- [ ] Revisar textos que sugiram responder o alerta ("responda", "fale
      conosco por aqui") em telas/e-mails relacionados ao Monitor.
- [ ] Conferir se algum manual/tooltip do TMS descreve o alerta imediato e
      atualizar.

## O que NÃO fazer

- Nenhuma mudança de rota, DTO, auth ou payload TMS↔Nexa.
- Nenhuma mudança no fluxo de ingest (`POST /api/monitor/ingest`) — continua
  idêntico.

## Referências no repo Nexa

- `docs/STANDBY.md` — registro do standby e critérios de reativação
- `docs/monitor/standby-alerta-imediato-2026-07.md` — implementação
- `docs/adr/034-atendimento-vendedor-canal-unico.md` · `docs/adr/035-takeover-humano-por-conversa.md`
