# T9-FIX (Nexa) — Envios parados + simplificação da janela de envio

> **Para o squad (Sonnet):** ler `REGRAS-SQUAD.md`. PRIORIDADE MÁXIMA: o item 1
> é um possível quebra de produção em teste local — investigar ANTES de
> qualquer outra coisa. Um commit por tarefa, gates com saída real, **sem push
> sem OK do Abel**.

## 1 — BUG: envios de digest aparentemente parados após o T9

O Abel testou e as mensagens programadas não chegaram. Suspeitos, em ordem:

1. **Janela de envio nova bloqueando em silêncio.** Se o default 06:00–20:00
   entrou valendo e o teste foi fora da janela, o skip é ESPERADO — mas hoje
   provavelmente não loga. REGRA DO REPO: todo caminho de descarte loga o
   motivo. Adicionar log explícito
   `Monitor: slot HH:MM pulado — fora da janela de envio (06-20) tenant=...`
   em TODOS os pontos onde a janela pula digest/closing/cash/imediato.
2. **`effectiveDelivery()` devolvendo false pra contato legado.** Se a
   derivação de compat estiver errada (ex.: exigir `delivery` presente, ou
   inverter a condição), TODO contato antigo para de receber. Teste unitário
   OBRIGATÓRIO com um contato exatamente como os de produção do Abel
   (sem `delivery`, com `whatsapp` e `emails`, `closingReport`/`cashView`
   presentes): `effectiveDelivery(...)` TEM que dar digest true nos canais.
3. **Compat do `cashView`/dedup:** verificar que a mudança `'lastSlot'→'on'` e
   as chaves de `lastDigestDate` não quebraram o dedup (chave errada = ou nunca
   envia, ou envia dobrado).
4. Rodar localmente com `MONITOR_ENABLED=true` + um contato de teste com
   horário no minuto seguinte e colar o log real do tick no relatório: cada
   contato/slot deve aparecer como ENVIADO ou PULADO+motivo. Proibido concluir
   "funciona" sem esse log.

**Entregável do item 1:** causa raiz identificada por escrito + fix + teste de
regressão cobrindo a causa + log de skip em todos os caminhos da janela.

## 2 — Simplificação: remover a escolha "Crítico fora da janela"

Decisão do Abel (2026-07-18): a opção `criticalOutsideWindow` ('hold'|'send')
SAI da interface. Comportamento fica FIXO: crítico fora da janela **sempre
segura** e sai na abertura com o sufixo "(ocorrido às HH:MM)".

- Backend: comportamento hard-coded 'hold'. O campo no config/DTO passa a ser
  aceito-e-ignorado (compat com PUTs antigos do TMS — Regra 1: não quebrar o
  emissor), com comentário explicando.
- Frontend (MonitorConfigPage): remover o seletor do card da janela; o card
  fica só com início/fim + uma linha explicando o comportamento dos críticos.
- Testes: hold é o comportamento com e sem o campo no config; PUT com o campo
  antigo não dá 400.

## Gates

`pnpm typecheck` · `pnpm test:frontend` · `pnpm test:backend` ·
`cd apps/backend ; pnpm build`. Commits:
`fix(monitor): restore digest delivery and log all send-window skips` ·
`refactor(monitor): hard-code critical hold outside send window`.
Checklist do REGRAS-SQUAD.md ao final, com o LOG REAL do teste do item 1.4.
