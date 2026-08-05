# ADR 033 — IntegrationsModule: Sincronização de Planos TMS → Nexa

- **Status**: Aceito (implementado)
- **Data**: 2026-07
- **Relacionados**: ADR 022 (Botão TMS-Lia), ADR 032 (Monitor dual-channel + gate por plano)

---

## Contexto

O Nexa precisa saber quais planos cada tenant tem no HiperTMS para:

1. **Gate de features**: funcionalidades do Monitor Proativo (ADR 028/032) são
   liberadas por plano (ex: plano `basic` → apenas WhatsApp; plano `pro` → email + WhatsApp).
2. **Personalização da Lia**: a Lia pode adaptar o discurso de vendas e suporte
   com base no plano atual do cliente.

O HiperTMS é a fonte de verdade de planos e assinaturas (ADR 011). O Nexa não
replica a tabela de planos integralmente — recebe notificações push quando há mudança.

---

## Decisão

Criar um módulo `integrations/` no backend do Nexa com um único endpoint inicial:

```
POST /api/integrations/plan-sync
Authorization: Bearer <TMS_SYNC_SECRET>
Body: { tmsTenantId, planId, planName, features[] }
```

**Autenticação**: `TmsSyncGuard` valida o header Bearer contra `TMS_SYNC_SECRET`
(variável de ambiente, obrigatória em produção via `validateEnv`).

**Lógica**: upsert no `TenantNotificationConfig` do tenant resolvido via
`TMS_TENANT_ID_<SLUG>` (mesmo mecanismo do ADR 022/032) — atualiza `plan` e `features`.

O TMS chama este endpoint sempre que um tenant muda de plano (evento de billing).
O Nexa responde de forma idempotente: chamadas repetidas com os mesmos dados não
geram efeito colateral.

---

## Alternativas consideradas

| Alternativa | Rejeição |
|---|---|
| Polling periódico (Nexa consulta TMS) | Aumenta acoplamento e latência; push é mais simples |
| Replicar tabela de planos no Nexa | Violaria ADR 011 (TMS é a fonte de verdade de billing) |
| Leitura direta do banco TMS (`TMS_DB_URL`) | Acoplamento estrutural perigoso; já usado apenas para lookup de contatos, não para planos |

---

## Consequências

- `TMS_SYNC_SECRET` deve ser definido em produção (já adicionado ao `validateEnv`).
- O TMS precisa chamar `POST /api/integrations/plan-sync` ao criar/alterar assinatura.
- Módulo é extensível: próximos endpoints do handoff TMS↔Nexa entram aqui
  (ex.: sync de contratos, cancelamentos).
- O gate de features do Monitor (ADR 032) lê o campo `plan` do `TenantNotificationConfig`
  populado por este endpoint.

---

## Adendo 2026-08-03 — `monitorNumbersIncluded` (o TMS volta a mandar nos limites)

### Problema

O ADR 011 diz que o TMS é a fonte de verdade do catálogo de planos, mas a
quantidade de números de WhatsApp inclusa em cada plano estava **escrita no código
do Nexa** (`MONITOR_WA_INCLUDED`, em `application/monitor/monitor-plan-limits.const.ts`).
Duas fontes para o mesmo fato → divergência silenciosa: em 03/08/2026 o catálogo do
TMS tinha `monitor_numbers_included = 1` nos quatro planos enquanto o Nexa aplicava
1/3/5/5. Ninguém percebeu porque quem gateia é o Nexa — o valor do TMS não era lido
por nada.

Havia ainda uma **terceira** cópia da mesma regra no frontend do TMS
(`WA_NUMBERS_INCLUDED`, duplicada em `SubscriptionPlanCard.tsx` e
`admin/subscription/PlanCard.tsx`), usada para mostrar o número no card de planos.

### Decisão

O payload do `plan-sync` ganha `monitorNumbersIncluded`, vindo direto de
`system_admin_plan.monitor_numbers_included`:

```
POST /api/integrations/plan-sync
x-tms-secret: <TMS_SYNC_SECRET>
{ tmsTenantId, plan, monitorExtraNumbers?, monitorNumbersIncluded? }
```

- Persistido em `PlanLimit.monitorNumbersIncluded` (coluna nova, **nullable**).
- `monitorWaIncluded(plan, included)` usa o valor do TMS quando presente;
  `MONITOR_WA_INCLUDED` vira **fallback** para tenants nunca sincronizados.
- `-1` no TMS significa ilimitado → o Nexa aplica seu teto técnico
  (`MONITOR_WA_OVERRIDE_LIMIT`, 10).
- Cancelamento envia `monitorNumbersIncluded: 0` junto com `plan: 'free'`, senão o
  tenant cancelado ficaria com o teto do plano que não paga mais.
- Os cards do frontend do TMS passam a ler `plan.monitorNumbersIncluded`.

### Retrocompatibilidade e ordem de deploy

O campo é `@IsOptional()` e omiti-lo preserva o valor atual — um TMS antigo
continua funcionando contra um Nexa novo. Pela REGRA 1 do `REGRAS-SQUAD.md`, a
ordem é **receptor primeiro**: Nexa (migration + DTO) → depois TMS.

### O que continua no Nexa

O teto técnico de 10 números e o `monitorOverride` (destravamento por
platform-admin) são decisões operacionais do Nexa, não do catálogo — seguem aqui.
