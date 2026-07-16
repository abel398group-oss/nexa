# T8 (Nexa) — Resumo de fechamento quinzenal/mensal por contato

> **Para o squad (Sonnet):** ler `REGRAS-SQUAD.md` antes de qualquer linha. Uma
> tarefa por commit, gates com saída real colada, **sem push sem OK do Abel**.
> Este doc é o contrato — NÃO invente campos, telas ou comportamentos fora dele.
>
> **DEPENDÊNCIA DURA:** o endpoint do TMS
> (`hipertms_v12/docs/features/automation/t8-fechamento-endpoint-2026-07.md`)
> precisa estar DEPLOYADO antes deste ir pro ar. Se o TMS responder 404, o
> scheduler loga warn e NÃO envia nada — nunca quebra.
>
> **PRÉ-REQUISITO DE FILA:** só começar o T8 depois do T7 (digest unificado)
> estar concluído e aprovado — os dois mexem em `consolidation`/contatos.

## Decisão de negócio (aprovada pelo Abel 2026-07-16 — não alterar)

- Cada contato ganha a opção **Resumo de fechamento: Desligado / Quinzenal /
  Mensal** (padrão dos contatos NOVOS: Mensal; contatos EXISTENTES: Desligado —
  ninguém começa a receber sem ter escolhido).
- Quinzenal → envia dias **16 e 1º** às **07:00** (America/Sao_Paulo). No dia
  1º a mensagem é ÚNICA: fechamento da 2ª quinzena + linha do resultado do mês
  (campo `monthSummary` do TMS). Mensal → só dia 1º às 07:00, mês completo.
- Independente dos 3 horários de pendências. Vai pros mesmos canais do contato
  (WhatsApp + e-mails). Disponível em todos os planos por enquanto (gate por
  plano é decisão futura — deixar 1 comentário TODO, nada de código).

## T8.1 — Modelo: campo novo no contato

`ContactRecipient` ganha `closingReport?: 'off' | 'biweekly' | 'monthly'`
(ausente = `'off'`). Contatos vivem no JSON `contacts` do
`TenantNotificationConfig` → **sem migration**. Atualizar o DTO do PUT
`/monitor/config` para aceitar o campo (**Regra 1 do REGRAS-SQUAD**: campo novo
SEMPRE entra no DTO junto — foi exatamente isso que causou os 400 do T6) e o
sanitize correspondente (valores fora do enum → 'off').

## T8.2 — Conector: buscar o fechamento no TMS

Em `hipertms.connector.ts`, novo método `getClosingReport(externalTenantId,
kind, refDate)` chamando
`GET {baseUrl}/nexa/proactivity/closing-report?tenantId=...&kind=...&refDate=...`
com o MESMO header/token dos métodos vizinhos (`this.authHeader`). Timeout 15s.
Erro/404/timeout → retorna `null` + `logger.warn` (nunca lança). Contrato de
resposta: ver doc do TMS — usar os campos exatamente como vêm.

## T8.3 — Scheduler

Novo `closing-report.service.ts` em `application/monitor/`:

- `@Cron` diário às 07:00 America/Sao_Paulo (usar `@nestjs/schedule`, já no
  projeto). Só roda se `MONITOR_ENABLED=true`.
- Se o dia NÃO é 1º nem 16 → return imediato (log debug).
- Para cada tenant com config `enabled=true`: coleta os contatos com
  `closingReport !== 'off'` compatíveis com o dia (dia 16 → só biweekly; dia 1º
  → biweekly e monthly). Sem contatos → pula tenant sem chamar o TMS.
- UMA chamada ao TMS por (tenant, kind) — não uma por contato.
- Dedup: `contact.lastClosingDate` (string `YYYY-MM-DD` do último envio) no
  mesmo JSON do contato. Reivindicar e persistir ANTES de enviar (mesmo padrão
  claim-before-send do digest — copiar, não recriar).
- Envio: reaproveitar os MESMOS canais do digest (`channel.sendTo` para
  WhatsApp, `sendAlertEmail` para e-mails). Nada de canal novo.
- Try/catch por tenant e por contato — falha de um não derruba os demais, e
  todo caminho de descarte loga o motivo (regra do repo: nunca dropar em
  silêncio).

## T8.4 — Formato da mensagem (mockups aprovados — seguir à risca)

Derivar no Nexa: `margem = revenue - costs`, `margem% = margem/revenue`,
variações vs `previous` com `▲/▼ X%` (pontos percentuais para taxas). Sem
`previous` (zero/ausente) → omitir a seta, nunca "Infinity%". Formatação BRL
`R$ 1.234,56`.

Quinzenal (dia 16; dia 1º idem com label da 2ª quinzena + bloco do mês):

```
📊 HiperTMS — Fechamento {period.label}
{start} a {end}

📈 RECEITA × CUSTO
• Receita: R$ {revenue} {▲/▼ x% vs quinz. anterior}
• Custos: R$ {costs} {▲/▼ x%}
• Margem: R$ {margem} · {margem%} {▲/▼ x pts}

🤝 VENDAS
• {quotesCreated} cotações · {quotesConverted} fechadas ({conversionRate})
• Ticket médio: R$ {avgTicket} {▲/▼ x%}
• {shipmentsCompleted} embarques concluídos

💳 CAIXA
• Recebido no período: R$ {receivedInPeriod}
• Vencido em aberto: R$ {overdueOpenAmount} ({overdueOpenCount} contas)
• Inadimplência: {delinquencyRate} {▲/▼ x pts}

Relatório completo: app.hipertms.com.br
```

No dia 1º para quinzenal, acrescentar antes do rodapé:
`📅 MÊS DE {mês}: Receita R$ {monthSummary.revenue} · Custos R$ {monthSummary.costs} · Margem R$ {...}`.
Mensal usa o mesmo template com labels do mês e, se vier `highlights`,
bloco `🏆 DESTAQUES` com o top cliente.

## T8.5 — UI (MonitorConfigPage)

No modal de contato (T6), abaixo de "Dias de envio": seletor **"Resumo de
fechamento"** com 3 opções (Desligado / Quinzenal / Mensal) + legenda de uma
linha ("Quinzenal: dias 16 e 1º às 07h · Mensal: dia 1º às 07h"). Na linha da
lista, badge discreto `Fechamento: quinzenal|mensal` quando ≠ off. Seguir o
design system (`components/ui/`) — nada de estilo manual novo.

## T8.6 — Visão do caixa na última mensagem do dia (aprovada 2026-07-16)

Bloco "💰 SEU CAIXA" anexado ao digest de pendências (T7) **apenas no ÚLTIMO
horário do dia do contato** (maior `sendTime` dele), acima dos blocos de setor.

1. **Campo novo no contato:** `cashView?: 'off' | 'lastSlot'` (ausente/default
   = `'off'` — ninguém recebe sem ligar). Entra no DTO do PUT junto (Regra 1)
   e no sanitize.
2. **Conector:** novo método `getCashView(externalTenantId)` chamando
   `GET {baseUrl}/nexa/proactivity/cash-view?tenantId=...` (padrão dos métodos
   vizinhos). **404/erro/timeout → `null` + warn — e o bloco NÃO aparece; a
   mensagem de pendências sai normal.** Isso permite deployar o Nexa ANTES do
   endpoint do TMS existir (ordem aprovada pelo Abel: Nexa primeiro).
3. **Uma chamada por tenant por dia** (o primeiro contato elegível do dia busca;
   cachear em memória por tenant+data).
4. **Formato do bloco (opção 1 aprovada — seguir à risca):**

```
💰 SEU CAIXA — próximos 15 dias
⬇️ Entra: R$ {inflow15d.amount} ({count} contas a receber)
⬆️ Sai: R$ {outflow15d.amount} ({count} contas a pagar)
━━━━━━━━━━━━━━━
✅ Sobra: R$ {inflow − outflow}   ← se negativo: "🔴 Falta: R$ X"
⚠️ Vencido sem receber: R$ {overdueReceivable.amount} ({count} clientes)
🍯 CT-e emitidos sem faturar: R$ {unbilledCte.amount} ({count} CT-e)
🧾 Faturado no mês: R$ {invoicedMonth.amount}
```

5. **UI:** no modal do contato, seletor "💰 Visão do caixa" com opções
   Desligado / No último horário + legenda "Anexa o resumo financeiro à última
   mensagem do dia deste contato". Badge discreto na linha da lista quando
   ligado. Design system, sem estilo manual.
6. **Testes:** bloco só no último slot; off → nunca aparece; TMS null → digest
   sai sem o bloco; saldo negativo → linha "Falta"; cache 1 chamada/tenant/dia;
   DTO aceita e sanitiza `cashView`.

## O que NÃO fazer

- NÃO mexer no fluxo de pendências (T7), imediatos CRITICAL, nem no modo
  por setor legado.
- NÃO criar migration, fila nova, env novo (além de nada) nem canal novo.
- NÃO calcular agregado no Nexa — número vem pronto do TMS; o Nexa só deriva
  margem e variações.
- NÃO enviar nada quando o TMS retornar null — warn e segue.

## Testes (mínimo)

(a) Dia comum → não faz nada; (b) dia 16 → só biweekly recebem; (c) dia 1º →
biweekly (com bloco do mês) e monthly; (d) dedup por `lastClosingDate` (rodar
2x no mesmo dia → 1 envio); (e) TMS null → zero envios + warn; (f) variações
▲/▼ e divisão por zero; (g) DTO aceita `closingReport` e sanitiza inválido;
(h) UI: seletor salva e re-hidrata.

## Gates

`pnpm typecheck` · `pnpm test:frontend` · `pnpm test:backend` — colar saída
real. Commits: `feat(monitor): closing report scheduler and contact opt-in (T8)`
+ testes. Ao concluir, colar o checklist do REGRAS-SQUAD.md.
