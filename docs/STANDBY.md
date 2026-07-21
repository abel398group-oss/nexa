# STANDBY — funções desativadas por decisão de produto

> Registro central de funcionalidades **implementadas mas desativadas** a pedido
> do Abel. Nada aqui foi removido do código — cada item tem um flag de
> reativação e um doc de implementação. Antes de reativar qualquer item,
> conferir a seção "Pré-condições para reativar".

| Função | Desde | Flag de reativação | Doc |
|---|---|---|---|
| Alerta imediato do Monitor (fora do ciclo do digest) | 2026-07-20 | `MONITOR_IMMEDIATE_ALERTS=true` (backend) | [docs/monitor/standby-alerta-imediato-2026-07.md](./monitor/standby-alerta-imediato-2026-07.md) |
| Botão "Ver mais" por setor no digest WhatsApp | 2026-07-21 | (depende da migração pra API oficial) | este doc, seção abaixo |
| Receptor de `metadata` no ingest TMS→Nexa | 2026-07-21 | decisão do Abel — revisar após 1 semana estável (a partir de 2026-07-21) | este doc, seção abaixo · TMS: ADR 022 |

## Receptor de `metadata` no ingest (adiado, 2026-07-21)

**O que seria:** campo opcional `metadata` no evento do `POST /monitor/ingest`
(`ruleId`, `count`, `amount`, `accountType`, `hoursWaiting`, `daysLate`,
`daysLeft`) — spec proposta e aprovada pelos dois lados.

**Por que foi adiado (decisão do Abel):** o **link por setor** resolveu o
principal SEM mudança de contrato — o Nexa já sabe o setor de cada evento, então
o destino virou uma tabela fixa local (`SECTOR_PANEL_PATHS` em
`digest-tabular.ts`: fiscal→/fiscal, logistic→/logistic, frota→/fleet,
finance→/finance, procurement→/procurement). O que sobra pro `metadata` é
**acabamento**, não funcionalidade quebrada:

1. verbo `pagar` × `cobrar` no `installment.overdue` (hoje resolvido por
   heurística de título — funciona, só não é infalível);
2. desempate do ranking por métrica do setor (valor, horas, dias) — hoje
   degrada para banda de severidade + idade, que já ordena bem.

Não compensa abrir uma frente com migration em produção logo depois de a
agregação e as regras novas do TMS subirem.

**Gatilho de retomada:** revisar após **1 semana estável** contada de
2026-07-21.

**Ao retomar — ordem obrigatória (REGRA 1):** Nexa aceita o campo e deploya
PRIMEIRO; só então o TMS começa a emitir. O código do Nexa já lê
`metadata.accountType` e as métricas de desempate quando presentes (degrade
gracioso), então o receptor é aditivo.

**Registrado nos dois lados** — o TMS anotou o mesmo em
`docs/architecture/decisions/022-proactive-engine.md`. Motivo: o `metadata`
exige emissor + receptor; anotar só no receptor faria o emissor esquecer.

## Botão "Ver mais" no digest WhatsApp (requisito da API oficial)

**O que se quer:** um botão CTA por setor no rodapé da mensagem — rótulo
"Ver mais — {Setor}", clicável, abrindo a página do setor **sem URL exposta**
no corpo (decisão do Abel, 2026-07-21).

**Por que não está no ar:** o WhatsApp não tem âncora de texto — só URL escrita
por extenso vira link, e dentro de bloco monoespaçado (```) nem isso funciona.
Botões existem apenas na **Cloud API oficial** (interactive message /
template com botão de URL), que o WAHA não entrega de forma confiável.

**Estado atual (paliativo, já implementado):** no WhatsApp, a URL curta do setor
(`app.hipertms.com.br/finance`) vai logo abaixo de cada bloco — fora do ``` pra
continuar clicável. No **e-mail**, o botão "Ver mais — {Setor}" JÁ existe de
verdade (HTML tem âncora), com a palavra clicável e sem URL exposta.

**Ao migrar pra API oficial:** trocar a linha de URL do WhatsApp por botões
`interactive.action.buttons` (máx. 3 por mensagem — priorizar os setores com
mais pendências) usando o mesmo mapa setor→URL de
`digest-tabular.ts` (`SECTOR_PANEL_PATHS`).

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

**Correção (2026-07-20, revisão do throttle):** o digest unificado excluía
CRITICAL por assumir o canal imediato ativo — com o standby, crítico não saía
em canal nenhum. Corrigido: o flag `MONITOR_IMMEDIATE_ALERTS` agora decide o
dono do CRITICAL — standby → digest inclui; ativo → imediato envia e o digest
exclui (ver `monitor-flags.const.ts`).

**Pré-condições para reativar:**

1. Decidir o alcance do imediato (backlog A): todos os contatos do setor × só o
   1º × contato "plantão" — hoje só o 1º contato WhatsApp de cada setor recebe.
2. Gate de inbound para contatos de alerta (resposta não pode virar lead da Lia).
3. Revisar custo WhatsApp × limite de números do plano.

**Como reativar:** `MONITOR_IMMEDIATE_ALERTS=true` no `.env` do backend +
restart. O comportamento anterior volta integralmente (filtro por
`immediateSeverity`, janela de envio com hold, dedup de reabertura).
