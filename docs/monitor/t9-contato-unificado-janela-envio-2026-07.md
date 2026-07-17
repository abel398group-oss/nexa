# T9 (Nexa) — Contato unificado com nome, matriz por canal e janela de envio

> **Para o squad (Sonnet):** ler `REGRAS-SQUAD.md` antes de qualquer linha. Uma
> tarefa por commit, gates com saída real colada, **sem push sem OK do Abel**.
> Contrato fixo — não inventar campo/tela fora deste doc. Se o domínio não
> bater com o código real, PARAR e reportar.
>
> Evolução direta do T6/T7/T8 — mexe nos mesmos arquivos. O TMS espelha depois
> (doc próprio no repo dele). **Ordem de deploy: Nexa primeiro.**

## Decisões de negócio (aprovadas pelo Abel 2026-07-17 — não alterar)

1. **Contato = pessoa**: um registro com `name` + WhatsApp (opcional) + e-mails
   (opcional) — pelo menos UM canal. Acaba a separação em dois módulos de
   cadastro; a lista vira UMA linha por pessoa (nome em destaque, canais
   embaixo).
2. **Matriz "o que enviar em cada canal"**: Pendências do dia / Resumo de
   fechamento / Visão do caixa × colunas 📱 WhatsApp e ✉️ E-mail (checkbox).
   A periodicidade do fechamento (Quinzenal/Mensal) e o "último horário" do
   caixa continuam nos seletores existentes.
3. **Limites por plano continuam valendo**: número de WhatsApp único conta pro
   limite do plano como hoje; e-mail segue sem limite. UI mostra
   **"X de Y números · N disponíveis"** e, no limite, o upsell de R$ 29,90.
4. **Janela de envio** (config geral do Monitor): nada dispara fora da janela
   (padrão 06:00–20:00). Crítico fora da janela: `hold` (segurar até abrir —
   padrão) ou `send` (furar). Segurado chega com sufixo "(ocorrido às HH:MM)".
5. **Remover o bloco "Setores monitorados"** da tela — redundante, cada contato
   já escolhe setores. Flags internas (`fiscalEnabled` etc.) continuam no
   backend com default true (cards por setor do Corporativo seguem mexendo
   nelas pelo TMS).

## T9.1 — Modelo (sem migration — tudo em JSON existente)

`ContactRecipient` (`contact-recipient.types.ts`):

```ts
name?: string;              // exibição; sanitize: trim, máx 60 chars
delivery?: {
  digest:  { whatsapp: boolean; email: boolean };
  closing: { whatsapp: boolean; email: boolean };
};
// Visão do caixa NÃO tem canais próprios (decisão 2026-07-17): viaja DENTRO do
// digest de pendências, nos mesmos canais de `delivery.digest`. Liga/desliga
// via `cashView: 'on' | 'off'` (ver ADENDO A).
```

- Compat (contatos existentes SEM `delivery`): derivar no runtime —
  `digest` = true nos canais que o contato tem; `closing` = canais do contato
  se `closingReport !== 'off'`; `cash` idem se `cashView !== 'off'`. Helper
  único `effectiveDelivery(contact)` usado por consolidation/closing — NUNCA
  duplicar essa derivação.
- Sanitize: canal marcado na matriz sem o contato ter o canal → força false.
  Contato sem nenhum canal → rejeitar no PUT (400 claro).
- DTOs do painel e do proxy TMS ganham os campos juntos (**Regra 1**).
- `TenantNotificationConfig` (JSON/colunas existentes? conferir): janela em
  campos novos do config — `sendWindowStart: number` (default 6),
  `sendWindowEnd: number` (default 20), `criticalOutsideWindow: 'hold'|'send'`
  (default 'hold'). Se exigir migration → é ADITIVA, `migrate deploy`, avisar
  o Abel antes de rodar.

## T9.2 — Envio respeitando matriz e janela

- `consolidation.service.ts` (digest/caixa) e `closing-report.service.ts`:
  antes de enviar em cada canal, consultar `effectiveDelivery(contact)`.
  Ex.: closing com whatsapp=false e email=true → só e-mails.
- **Janela**: digest/closing/cash só disparam com `now` dentro da janela
  (inclusive catch-up). Imediatos CRITICAL (`monitor.service.sendAlertsToAdmins`):
  fora da janela com `hold` → agendar via `MonitorDispatchService` com
  `notBefore` = próxima abertura da janela e sufixo "(ocorrido às HH:MM)" na
  mensagem; com `send` → comportamento atual. Todo caminho segurado loga o
  motivo.
- UI valida horário de contato fora da janela: aviso não-bloqueante
  ("18:30 está fora da janela 06:00–20:00 — esse envio não sairá").

## T9.3 — UI (MonitorConfigPage) — WIZARD DE 3 PASSOS (protótipo aprovado 2026-07-17)

O modal de contato vira um **assistente de 3 passos** (o Abel tem o protótipo
clicável — pedir print/gravação se precisar). Indicador de progresso no topo
(1—2—3, passo feito vira ✓), botões Voltar/Avançar, "Salvar contato" no passo 3.

**Passo 1 — "Quem recebe":** Nome + 📱 WhatsApp (opcional) + ✉️ E-mail
(opcional), empilhados. Validação: pelo menos um canal. Rodapé discreto:
"X de Y números do plano · **N disponíveis**" (N = Y−X, mín. 0); no limite,
bloquear só a adição de número NOVO (contato só-e-mail livre) + upsell
R$ 29,90/mês com link pra assinatura.

**Passo 2 — "O que recebe":** DOIS cartões, cada um com pills de canal
📱 Zap / ✉️ E-mail no canto (aceso = recebe; toque alterna → `delivery`):
- ⚠️ Pendências do dia (subtítulo: "Até 3 relatórios/dia nos horários do passo 3")
- 📊 Receita × despesa, com chips de periodicidade inline (Semanal / Quinzenal /
  Mensal — seleção única → `closingReport`; nenhum canal ligado = 'off')
Nota no rodapé do passo: "A 💰 Visão do caixa você escolhe no próximo passo,
junto dos setores."

**Passo 3 — "Quando recebe e o que entra":**
- Chips do que entra no relatório de pendências: os 4 setores + chip
  **🍯 Visão do caixa** (estilo verde/success pra diferenciar → `cashView`).
  Legenda: "A Visão do caixa entra como bloco extra no topo do relatório".
- Horários (até 3): chips com ✕ (não remove o último) + "+ adicionar horário"
  (some no 3º).
- Dias: 7 bolinhas + atalhos "Dias úteis" / "Todos".

**Lista:** módulo único "Contatos", uma linha por pessoa — Contato (nome em
destaque + canais embaixo) / Setores / Horários / Recebe (resumo tipo
"Pendências, Receita × despesa, Caixa"). Editar reabre o wizard no passo 1 com
tudo hidratado.

**Remover** o bloco "Setores monitorados"/checkboxes global (decisão 5).
Tudo no design system (`components/ui/`).

## O que NÃO fazer

- NÃO migrar/reescrever contatos existentes no banco — compat é em runtime.
- NÃO mexer no modo por setor legado, nem nos endpoints consumidos pelo TMS
  além de ACEITAR os campos novos (o TMS espelha depois).
- NÃO aplicar janela retroativa a mensagens já agendadas no dispatch.

## Testes (mínimo)

(a) contato antigo sem `delivery` → comportamento idêntico ao atual (derivação);
(b) matriz: closing só e-mail → WhatsApp não recebe; (c) contato sem canal →
400; (d) janela: digest às 21h não sai; crítico 02h com hold → sai 06:00 com
sufixo; com send → sai na hora; (e) contador "N disponíveis" e bloqueio só de
número novo no limite; (f) DTOs aceitam `name`/`delivery`/janela e sanitizam;
(g) UI: linha única por pessoa, matriz salva e re-hidrata.

## ADENDO 2026-07-17 (aprovado pelo Abel — substitui o que conflitar acima/no T8)

**A. Bloco financeiro em TODOS os 3 envios (fim do "último horário").**
`cashView` muda de `'off' | 'lastSlot'` para `'off' | 'on'` (compat: `'lastSlot'`
existente é tratado como `'on'` — sem migração). Quando `on`, o bloco
"💰 SEU CAIXA" entra em TODAS as mensagens de pendências do contato (os até 3
horários), não só na última. Cache de 1 chamada TMS/tenant/dia continua valendo
(o dado é o mesmo o dia todo; se o TMS expuser variação intradia, ainda assim 1
chamada por slot no máximo).

**B. Duas linhas novas no bloco do caixa — resumo do DIA:**

```
🧾 Faturado hoje: R$ {invoicedToday.amount} ({count} faturas)
💸 Gasto hoje: R$ {paidToday.amount} ({count} pagamentos)
```

Entram logo após o cabeçalho do bloco, antes de "Entra/Sai". Os campos vêm do
endpoint `cash-view` do TMS (adendo no doc do TMS) — se ausentes na resposta
(TMS antigo), omitir as linhas, nunca quebrar.

**C. Fechamento ganha SEMANAL.** `closingReport: 'off'|'weekly'|'biweekly'|'monthly'`.
Semanal = toda segunda-feira 07:00, período = semana anterior (seg–dom),
comparativo vs semana retrasada. Scheduler: dia de semana 1 (segunda) dispara
os `weekly`; dias 16 e 1º seguem como estão. Dedup por `lastClosingDate` cobre
o caso segunda dia 16 (dois relatórios distintos: weekly e biweekly — contato
com weekly recebe só o weekly; kinds diferentes não se misturam num contato).
UI: seletor passa a 4 opções (Desligado / Semanal / Quinzenal / Mensal), legenda
atualizada. DTOs e sanitize acompanham (Regra 1).

**Testes do adendo:** compat `'lastSlot'`→`'on'`; bloco em todos os slots;
linhas do dia omitidas quando TMS não manda os campos; weekly dispara segunda e
não dispara em outros dias; segunda dia 16 não duplica pro mesmo contato.

## Gates

`pnpm typecheck` · `pnpm test:frontend` · `pnpm test:backend` ·
`cd apps/backend ; pnpm build` — saída real colada. Commits separados:
`feat(monitor): unified named contacts with per-channel delivery matrix (T9)` ·
`feat(monitor): send window with critical hold (T9)` · testes. Checklist do
REGRAS-SQUAD.md ao final.
