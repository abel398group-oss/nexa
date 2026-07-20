# STANDBY — funções desativadas por decisão de produto

> Registro central de funcionalidades **implementadas mas desativadas** a pedido
> do Abel. Nada aqui foi removido do código — cada item tem um flag de
> reativação e um doc de implementação. Antes de reativar qualquer item,
> conferir a seção "Pré-condições para reativar".

| Função | Desde | Flag de reativação | Doc |
|---|---|---|---|
| Alerta imediato do Monitor (fora do ciclo do digest) | 2026-07-20 | `MONITOR_IMMEDIATE_ALERTS=true` (backend) | [docs/monitor/standby-alerta-imediato-2026-07.md](./monitor/standby-alerta-imediato-2026-07.md) |

## Alerta imediato do Monitor

**O que fazia:** evento novo com severidade CRITICAL (ou conforme
`immediateSeverity` do tenant) disparava WhatsApp na hora, fora do horário do
digest, com título "⚡ Alerta imediato · {Setor}".

**Por que foi desativado:** decisão de produto (Abel, 2026-07-20) — o alerta é
informativo, não cobrança. O digest agendado diário por setor é suficiente; o
cliente é lembrado todo dia enquanto a pendência existir no TMS e o alerta se
resolve sozinho quando o cliente corrige o dado na origem.

**O que continua funcionando com o standby ativo:**

- Ingest TMS→Nexa e sincronização do `AlertState` (nada se perde)
- Digest agendado por setor/contato (ConsolidationService) — canal único ativo
- Relatório de fechamento (closing report) e e-mail

**Pré-condições para reativar:**

1. Decidir o alcance do imediato (backlog A): todos os contatos do setor × só o
   1º × contato "plantão" — hoje só o 1º contato WhatsApp de cada setor recebe.
2. Gate de inbound para contatos de alerta (resposta não pode virar lead da Lia).
3. Revisar custo WhatsApp × limite de números do plano.

**Como reativar:** `MONITOR_IMMEDIATE_ALERTS=true` no `.env` do backend +
restart. O comportamento anterior volta integralmente (filtro por
`immediateSeverity`, janela de envio com hold, dedup de reabertura).
