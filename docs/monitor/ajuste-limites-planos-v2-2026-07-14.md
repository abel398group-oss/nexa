# Ajuste v2 — Limites de números WhatsApp por plano (Monitor Proativo)

> **Para o squad:** ler `REGRAS-SQUAD.md` antes de qualquer mudança. Uma tarefa
> por vez, um commit por tarefa, gates com saída real colada. **Não fazer push
> sem autorização do Abel.** Este doc REVISA e corrige a implementação já
> entregue em `61004c4` (plano anterior:
> `plano-limites-numeros-por-plano-2026-07.md`).

## Decisão de negócio (aprovada pelo Abel em 2026-07-14 — não alterar)

| Plano TMS | Números WhatsApp inclusos | Observação |
|-----------|--------------------------|------------|
| Básico | **1** | Monitor passa a estar DISPONÍVEL no Básico |
| Essencial | **3** | |
| Profissional | **5** | |
| Corporativo | **sob consulta** | Internamente: 5 inclusos + ajuste por contrato via `monitorExtraNumbers` |
| Sem assinatura (`free`/`starter`) | 0 — Monitor bloqueado | |

- Adicional: **R$ 29,90/número/mês** em qualquer plano pago, contratado no
  TMS/Asaas, refletido aqui via `PlanLimit.monitorExtraNumbers` (já existe).
- Mesma contagem de **números únicos** por tenant (número repetido em vários
  setores conta 1). E-mail continua sem limite de plano (só cap técnico
  10/setor). `monitorOverride` continua = limite 10.

## Mudança de contrato com o TMS (coordenar!)

Hoje o TMS mapeia `BASIC→'free'` e `ESSENTIAL→'starter'`
(`hipertms_v12/apps/api/src/application/subscriptions/nexa-plan-sync.service.ts:26`).
Com a nova matriz o Básico tem direito a 1 número, então o TMS vai passar a
enviar os códigos **`basico`** e **`essencial`**. O Nexa é o RECEPTOR:
precisa aceitar `basico` ANTES do TMS mudar o emissor.
**Ordem de deploy: Nexa primeiro, TMS depois** (regra do incidente de 09/07).

---

## N1 — Constantes de plano e código `basico`

**Arquivos:**
- `apps/backend/src/application/monitor/monitor-plan-limits.const.ts`
- `apps/backend/src/application/monitor/monitor.controller.ts` (`MONITOR_PLANS`)
- `apps/backend/src/application/integrations/integrations.controller.ts` (`VALID_PLANS`)

**Mudanças:**

1. `MONITOR_WA_INCLUDED` passa a:
   ```ts
   free: 0, starter: 0,
   basico: 1,
   essencial: 3,
   pro: 5, profissional: 5, professional: 5,
   enterprise: 5, corporativo: 5, corporate: 5,
   ```
2. `MONITOR_PLANS` (monitor.controller.ts) adiciona `'basico'` — Monitor
   liberado para todo plano pago. `free`/`starter` continuam bloqueados.
3. `VALID_PLANS` (integrations.controller.ts) adiciona `'basico'` — sem isso o
   plan-sync do TMS com o código novo leva 400 e o tenant fica no plano velho.
4. Atualizar o comentário de regras de negócio no topo do
   `monitor-plan-limits.const.ts` (datas e matriz).

**Critérios de aceite:** testes de `monitor-plan-limits.const.spec.ts` e
`integrations.controller.spec.ts` atualizados para a nova matriz;
`monitorWaLimit('basico', 0, false) === 1`, `('essencial') === 3`,
`('profissional') === 5`, `('corporativo', 2, false) === 7`.

## N2 — Corrigir grandfathering no Gate 2 (BUG da entrega anterior)

**Arquivo:** `apps/backend/src/application/monitor/monitor.controller.ts`
(`updateConfig`, "Gate 2").

**Problema:** hoje QUALQUER save com números acima do limite leva 400 — um
tenant que fez downgrade (ou que configurou antes da trava) não consegue nem
alterar horário ou desativar um setor. Viola a regra aprovada: config
existente acima do limite não pode travar o salvar.

**Regra correta:** bloquear apenas quando o save AUMENTA a contagem além do
limite:

```ts
const previousCount = extractUniqueWaNumbers(existingSectorConfig, existingPhone).size;
const newCount = uniqueNumbers.size;
// Permite: newCount <= limit (dentro do limite)
// Permite: newCount <= previousCount (não aumentou — pode editar/remover)
// Bloqueia: newCount > limit && newCount > previousCount
if (newCount > limit && newCount > previousCount) throw new BadRequestException(...);
```

**Critérios de aceite:** testes cobrindo — (a) tenant com 6 números e limite 3
consegue salvar mudança de horário; (b) consegue salvar removendo 1 número;
(c) NÃO consegue salvar adicionando o 7º; (d) tenant dentro do limite não
consegue exceder.

## N3 — Frontend: paywall, contador e textos

**Arquivo:** `apps/frontend/src/pages/MonitorConfigPage.tsx`

1. Texto do paywall (planAllowed=false) passa a mencionar que o Monitor está
   disponível **em todos os planos** — o bloqueio agora só atinge tenant sem
   assinatura ativa. Ajustar: "Monitor Proativo disponível nos planos Essencial,
   Profissional e Corporativo" → "…disponível em todos os planos do HiperTMS.
   Ative uma assinatura para usar."
2. Manter o contador "X / Y números" e o bloco de upsell entregues em
   `61004c4`.
3. **Já corrigido pelo Abel/Claude (working tree):** os campos `waNumbersUsed`
   e `waNumbersLimit` entraram na lista de exclusão do `saveConfig`
   (incidente Regra 1 repetido — GET devolvia campos que o PUT não aceita →
   400 ao salvar). Incluir essa mudança no commit desta tarefa e cobrir com
   teste: `saveConfig` não envia campos read-only no PUT.
4. UX do limite: `disabled={!enabled || atWaLimit}` no RecipientTagsInput
   impede até REMOVER números quando está no limite. Trocar por: input
   habilitado, bloquear só a ADIÇÃO quando `waNumbersUsed >= waNumbersLimit`
   (remover sempre pode).

**Critérios de aceite:** `MonitorConfigPage.spec.tsx` verde + novos testes dos
itens 3 e 4.

## N4 — Higiene da árvore antes do commit

A working tree está com ~116 arquivos modificados aparentemente por fim de
linha (CRLF/LF), incluindo migrations antigas (`00000000000000_baseline`).
**Proibido** commitar migration já aplicada com qualquer alteração. Antes de
commitar as tarefas acima: `git diff` nos arquivos fora do escopo → se for só
line-ending, descartar (`git checkout -- <path>`); commits desta entrega devem
conter APENAS os arquivos citados em N1–N3.

---

## Gates (colar saída real no relatório)

| Gate | Comando |
|------|---------|
| Type-check frontend | `pnpm typecheck` |
| Build frontend | `cd apps/frontend ; pnpm build` |
| Testes frontend | `pnpm test:frontend` |
| Build backend | `cd apps/backend ; pnpm build` |
| Testes backend | `pnpm test:backend` |

## Sequência de deploy

1. **Nexa** (este doc) — deploy e validação em produção.
2. Só então o TMS muda o `TIER_TO_NEXA_PLAN` e telas (doc no repo do TMS:
   `docs/features/automation/plano-limites-alertas-assinatura-2026-07.md`).
3. Sem migration nova nesta entrega (o campo `monitorExtraNumbers` já existe e
   foi aplicado). Se algo exigir migration → parar e avisar o Abel.

Ao concluir, colar o checklist final do REGRAS-SQUAD.md.
