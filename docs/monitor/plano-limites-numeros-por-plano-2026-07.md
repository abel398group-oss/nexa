# Plano de implementação — Limites de números WhatsApp por plano (Monitor Proativo)

> **Para o agente/dev:** leia `REGRAS-SQUAD.md` antes de qualquer mudança.
> Execute na ordem (M1 → M5), um commit por tarefa, checklist do REGRAS-SQUAD.md ao
> concluir cada uma. Nenhum código de produção sem aprovação explícita do Abel nesta
> conversa. **Receptor primeiro (Nexa), emissor depois (TMS).**

**Data de criação:** 2026-07-13  
**Squad:** Nexa  
**Status:** 🟡 Aguardando aprovação do Abel

---

## Contexto e decisão de negócio (aprovada, não alterar)

| Plano | Monitor ativo | Números WhatsApp inclusos |
|-------|--------------|--------------------------|
| Básico / free / starter | ❌ bloqueado | 0 |
| Essencial / essencial | ✅ liberado | 1 |
| Profissional / profissional / pro | ✅ liberado | 3 |
| Corporativo / corporativo / enterprise | ✅ liberado | 5 |
| `monitorOverride` (platform-admin) | ✅ liberado | 10 (cap técnico) |

- **Número adicional**: R$ 29,90/número/mês. Disponível do Essencial ao Corporativo.
  A **cobrança** é feita pelo TMS/Asaas (fase futura, outro squad). O Nexa só precisa
  saber a quantidade de adicionais contratados e somar ao incluso do plano.
- **E-mail**: sem limite por plano. Mantém o cap técnico de 10 destinatários/setor
  que já existe em `monitor.service.ts:85` (`sanitizeSectorConfig`, `.slice(0, 10)`).
- **Contagem**: números ÚNICOS no tenant inteiro. O mesmo número WhatsApp configurado
  em dois setores conta **1 vez** (dedup por `contact` normalizado via `normalizePhone`).

---

## Estado atual do código (confirmado em file:line)

| Item | Localização | Detalhe |
|------|------------|---------|
| Gate de plano | `monitor.controller.ts:35` | `MONITOR_PLANS = Set(['pro', 'enterprise', 'profissional', 'corporativo', 'professional', 'corporate'])` |
| `isPlanAllowed()` | `monitor.controller.ts:37-39` | Lowercase lookup no Set |
| ForbiddenException atual | `monitor.controller.ts:136` | "…Faça upgrade para Profissional ou Corporativo." |
| GET config | `monitor.controller.ts:80-101` | Lê só `planLimit.plan`, sem `monitorExtraNumbers` |
| PUT config gate | `monitor.controller.ts:128-145` | Verifica plano + `monitorOverride`; sem gate de números |
| `PlanLimit` model | `schema.prisma:786-797` | Campos: `maxContacts`, `maxCampaigns`, `maxMessagesMonth`, `plan`. **Sem** `monitorExtraNumbers`. |
| `sectorConfig` | `schema.prisma:815` | JSON livre; shape: `{ fiscal\|logistic\|frota\|finance: { recipients[], phone, email, sendHour, sendMinute, sendDays } }` |
| Cap técnico recipients | `monitor.service.ts:85` | `.slice(0, 10)` em `sanitizeSectorConfig` |
| Resolução de recipients | `consolidation.service.ts:199-203` | `resolveSectorRecipients()` — lê `recipients[]` até `MAX_RECIPIENTS_PER_SECTOR` |
| `POST /integrations/plan-sync` | `integrations.controller.ts:63-92` | `PlanSyncDto` tem `tenantId`, `tmsTenantId`, `plan`. Só persiste `plan` (sem `monitorExtraNumbers`). |
| `VALID_PLANS` | `integrations.controller.ts:24` | `['free', 'starter', 'pro', 'enterprise', 'profissional', 'corporativo']` — sem 'essencial' |

---

## M1 — Modelo de dados: `PlanLimit.monitorExtraNumbers` + constante de inclusos

### 1.1 Schema Prisma (migration aditiva)

Adicionar campo em `PlanLimit` (`schema.prisma:786`):

```prisma
model PlanLimit {
  id               String   @id @default(uuid())
  tenantId         String   @unique @map("tenant_id")
  maxContacts      Int?     @map("max_contacts")
  maxCampaigns     Int?     @map("max_campaigns")
  maxMessagesMonth Int?     @map("max_messages_month")
  plan             String   @default("free")
  monitorExtraNumbers Int   @default(0) @map("monitor_extra_numbers") // ← NOVO
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@map("plan_limits")
}
```

Migration gerada com `prisma migrate dev --name add-monitor-extra-numbers`.
Deploy com `prisma migrate deploy` (nunca `migrate dev` em produção).
Campo tem `@default(0)` — todos os tenants existentes ficam com 0 adicionais (aditivo, seguro).

### 1.2 Constante de inclusos (sem banco)

Novo arquivo `apps/backend/src/application/monitor/monitor-plan-limits.const.ts`:

```typescript
/** WhatsApp numbers included per plan (not counting extras). */
export const MONITOR_WA_INCLUDED: Record<string, number> = {
  free:          0,
  starter:       0,
  essencial:     1,
  pro:           3,
  profissional:  3,
  professional:  3,
  enterprise:    5,
  corporativo:   5,
  corporate:     5,
};

/** Maximum WhatsApp numbers when monitorOverride is active (platform-admin). */
export const MONITOR_WA_OVERRIDE_LIMIT = 10;

/** Returns total allowed WA numbers for a given plan + extras. */
export function monitorWaLimit(plan: string | null | undefined, extras: number, override: boolean): number {
  if (override) return MONITOR_WA_OVERRIDE_LIMIT;
  const included = MONITOR_WA_INCLUDED[(plan ?? 'free').toLowerCase()] ?? 0;
  return included + Math.max(0, extras);
}
```

### 1.3 Atualização do `POST /integrations/plan-sync` (REGRA 2 — forbidNonWhitelisted)

O TMS passará a enviar `monitorExtraNumbers` no payload de sync. O DTO do receptor
(Nexa) **deve ser atualizado primeiro** — campo novo com `@IsOptional()` para
retrocompatibilidade (TMS antigo sem o campo continua funcionando).

Alterar `PlanSyncDto` em `integrations.controller.ts`:

```typescript
class PlanSyncDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() tmsTenantId?: string;
  @IsIn(VALID_PLANS)        plan!: Plan;

  /** Número de licenças WhatsApp adicionais contratadas pelo tenant (além dos inclusos no plano). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100) // guard razoável
  monitorExtraNumbers?: number;
}
```

Também adicionar `'essencial'` em `VALID_PLANS` (M3 abre o plano):

```typescript
const VALID_PLANS = ['free', 'starter', 'essencial', 'pro', 'enterprise', 'profissional', 'corporativo'] as const;
```

Alterar o upsert para persistir o campo:

```typescript
const updated = await this.prisma.planLimit.upsert({
  where:  { tenantId },
  create: { tenantId, plan: dto.plan, monitorExtraNumbers: dto.monitorExtraNumbers ?? 0 },
  update: { plan: dto.plan, ...(dto.monitorExtraNumbers !== undefined ? { monitorExtraNumbers: dto.monitorExtraNumbers } : {}) },
  select: { tenantId: true, plan: true, monitorExtraNumbers: true, updatedAt: true },
});
```

**Nota de contrato para o squad TMS:** o campo `monitorExtraNumbers` é opcional no
payload do `plan-sync`. O TMS deve enviá-lo quando o tenant contrata/cancela adicionais.
Se omitido, o Nexa mantém o valor anterior (sem reset). Documentar em `docs/api-contract.md`.

**Critérios de aceite M1:**
- [ ] `prisma migrate deploy` sem erro em produção
- [ ] `PlanSyncDto` aceita e persiste `monitorExtraNumbers` sem 400
- [ ] Payload sem `monitorExtraNumbers` continua funcionando (retrocompat)
- [ ] `monitorWaLimit()` retorna valores corretos para cada plano + extras

---

## M2 — Enforcement no PUT `/monitor/config`

### 2.1 Extração de números únicos

Função auxiliar (colocar junto ao `sanitizeSectorConfig`):

```typescript
/** Extrai todos os números WhatsApp únicos configurados no tenant (todos os setores). */
function extractUniqueWaNumbers(sectorConfig: Record<string, any> | null | undefined): Set<string> {
  const unique = new Set<string>();
  if (!sectorConfig || typeof sectorConfig !== 'object') return unique;
  for (const sc of Object.values(sectorConfig)) {
    if (!sc) continue;
    // recipients[] modernos
    if (Array.isArray(sc.recipients)) {
      for (const r of sc.recipients) {
        if (r?.channel === 'whatsapp' && typeof r.contact === 'string') {
          const norm = normalizePhone(r.contact);
          if (norm) unique.add(norm);
        }
      }
    }
    // campo legado `phone`
    if (typeof sc.phone === 'string') {
      const norm = normalizePhone(sc.phone);
      if (norm) unique.add(norm);
    }
  }
  // Incluir notificationPhone de nível raiz (campo legado fora do sectorConfig)
  return unique;
}
```

O `notificationPhone` de nível raiz (campo legado no `UpdateConfigDto`) também conta
se for WhatsApp. Incluir na contagem ao ler a config existente para construir o total
final (verificar se o DTO já inclui o `notificationPhone` no PUT ou se está implícito
no `sectorConfig`).

### 2.2 Gate no PUT

Dentro de `updateConfig()` em `monitor.controller.ts`, logo após o gate de plano atual:

```typescript
// Gate de número WhatsApp — contar únicos e comparar com o limite do plano
if (dto.sectorConfig !== undefined || dto.notificationPhone !== undefined) {
  const [planLimit, existingConfig] = await Promise.all([
    this.prisma.planLimit.findUnique({
      where: { tenantId },
      select: { plan: true, monitorExtraNumbers: true },
    }),
    this.prisma.tenantNotificationConfig.findUnique({
      where: { tenantId },
      select: { sectorConfig: true, monitorOverride: true, notificationPhone: true },
    }),
  ]);

  const override = existingConfig?.monitorOverride ?? false;
  const limit = monitorWaLimit(planLimit?.plan, planLimit?.monitorExtraNumbers ?? 0, override);

  // Construir sectorConfig resultante (merge do existente com o que está sendo salvo)
  const mergedSectorConfig = dto.sectorConfig !== undefined
    ? dto.sectorConfig
    : (existingConfig?.sectorConfig as Record<string, any> | null);

  const uniqueNumbers = extractUniqueWaNumbers(mergedSectorConfig);

  // notificationPhone legado (raiz) também conta
  const rootPhone = dto.notificationPhone ?? existingConfig?.notificationPhone;
  if (rootPhone) {
    const norm = normalizePhone(rootPhone);
    if (norm) uniqueNumbers.add(norm);
  }

  if (uniqueNumbers.size > limit) {
    throw new BadRequestException(
      `Limite de números WhatsApp atingido. Seu plano ${(planLimit?.plan ?? 'atual')} inclui ${
        MONITOR_WA_INCLUDED[(planLimit?.plan ?? 'free').toLowerCase()] ?? 0
      } número(s) + ${planLimit?.monitorExtraNumbers ?? 0} adicional(is) = ${limit} no total. ` +
      `Configuração atual tenta usar ${uniqueNumbers.size}. ` +
      `Para adicionar mais números, contrate licenças adicionais em Configurações → Assinatura no HiperTMS.`,
    );
  }
}
```

### 2.3 Regra de grandfathering

Tenants que já possuem mais números configurados que o novo limite (ex.: migração de
plano para baixo) **não perdem a config existente** ao fazer leitura (`GET /monitor/config`)
nem ao enviar alertas (`ConsolidationService`). O enforcement só bloqueia **novos saves
via PUT que excedam o limite** — ou seja, a config fica "congelada" acima do limite e
só pode ser reduzida, nunca ampliada sem upgrade.

Na resposta do `GET /monitor/config`, incluir campos informativos:

```typescript
return {
  ...(config ?? defaults),
  planAllowed,
  monitorOverride,
  waNumbersUsed: uniqueWaNumbers.size,    // ← NOVO (int)
  waNumbersLimit: limit,                  // ← NOVO (int)
};
```

O frontend usa esses campos para exibir o contador e bloquear o formulário.

**Critérios de aceite M2:**
- [ ] PUT com N+1 números retorna 400 com mensagem clara (plano, limite, total tentado)
- [ ] GET com config acima do limite não retorna erro (grandfathering)
- [ ] Consolidation envia para todos os números existentes sem verificar o limite (só o PUT verifica)
- [ ] Mesmo número em dois setores conta 1 vez (dedup por `normalizePhone`)
- [ ] `monitorOverride` → limite = 10 (cap técnico)
- [ ] Tenant sem `PlanLimit` → `monitorWaLimit(null, 0, false)` = 0 (padrão free = bloqueado)

---

## M3 — Abertura do Essencial

### 3.1 `MONITOR_PLANS` em `monitor.controller.ts:35`

```typescript
// Antes:
const MONITOR_PLANS = new Set(['pro', 'enterprise', 'profissional', 'corporativo', 'professional', 'corporate']);

// Depois:
const MONITOR_PLANS = new Set([
  'essencial',
  'pro', 'professional',
  'enterprise', 'corporativo', 'corporate',
  'profissional',
]);
```

### 3.2 Mensagem da ForbiddenException (`monitor.controller.ts:136`)

```typescript
// Antes:
'Monitor Proativo não está disponível no plano atual. Faça upgrade para Profissional ou Corporativo.'

// Depois:
'Monitor Proativo não está disponível no plano Básico. Faça upgrade para Essencial ou superior para ativar os alertas.'
```

### 3.3 `VALID_PLANS` em `integrations.controller.ts:24`

Adicionar `'essencial'` (já descrito em M1.3).

**Critérios de aceite M3:**
- [ ] Tenant com plano `essencial` consegue ativar o Monitor (enabled=true) sem 403
- [ ] Tenant com plano `free`/`starter`/`básico` continua recebendo 403
- [ ] Mensagem da 403 atualizada nos dois casos (plano não permitido vs limite de números)
- [ ] `plan-sync` com `plan: 'essencial'` não retorna 400 de validação

---

## M4 — UI: contador de números e upsell

### 4.1 Resposta do GET (backend)

O backend retorna `waNumbersUsed: number` e `waNumbersLimit: number` (detalhado em M2.3).

### 4.2 `MonitorConfigPage` — contador

No bloco de configuração de destinatários WhatsApp, adicionar barra de uso:

```tsx
// Exemplo de layout (adaptar ao design system atual)
<div className="flex items-center justify-between text-sm text-muted-foreground">
  <span>Números WhatsApp configurados</span>
  <span className={waNumbersUsed >= waNumbersLimit ? 'text-destructive font-medium' : ''}>
    {waNumbersUsed} de {waNumbersLimit}
  </span>
</div>
{waNumbersUsed >= waNumbersLimit && (
  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
    <p className="font-medium">Limite atingido</p>
    <p>
      Para adicionar mais números WhatsApp, contrate licenças adicionais (R$ 29,90/número/mês)
      em{' '}
      <a
        href="https://app.hipertms.com.br/configuracoes/assinatura"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Configurações → Assinatura
      </a>{' '}
      no HiperTMS.
    </p>
  </div>
)}
```

Comportamento: quando `waNumbersUsed >= waNumbersLimit`, bloquear o botão de adicionar
destinatário WhatsApp nos `RecipientTagsInput` dos setores (prop `disabled` ou similar).
O formulário ainda pode ser salvo se nenhum número novo for adicionado.

### 4.3 Estado Básico — paywall existente

Tenants com `planAllowed: false` já recebem tela de paywall/upsell (`MonitorConfigPage`
exibe o bloco de upgrade quando `!planAllowed`). Nenhuma mudança necessária para o Básico.

**Critérios de aceite M4:**
- [ ] Contador "X de Y" visível em tenant com plano Essencial (1 número)
- [ ] Bloco de upsell aparece ao atingir o limite
- [ ] Botão de adicionar número WhatsApp fica desabilitado quando no limite
- [ ] Link para assinatura abre corretamente (externo)
- [ ] Plano Básico continua mostrando paywall (sem regressão)

---

## M5 — Plano de testes

### 5.1 Testes unitários (backend — vitest)

| # | Cenário | Arquivo |
|---|---------|---------|
| U1 | `monitorWaLimit('essencial', 0, false)` → 1 | `monitor-plan-limits.const.spec.ts` |
| U2 | `monitorWaLimit('profissional', 2, false)` → 5 | idem |
| U3 | `monitorWaLimit('corporativo', 0, true)` → 10 (override ignora plano) | idem |
| U4 | `monitorWaLimit(null, 0, false)` → 0 (sem PlanLimit = free) | idem |
| U5 | `extractUniqueWaNumbers` — mesmo número em 2 setores → size 1 | `monitor.controller.spec.ts` |
| U6 | PUT com N+1 números → 400 com mensagem correta | `monitor.controller.spec.ts` |
| U7 | PUT com N números (exatamente no limite) → 200 | idem |
| U8 | GET em tenant com config acima do limite → 200 (grandfathering) | idem |
| U9 | `plan-sync` com `monitorExtraNumbers: 2` persiste e é lido no GET | `integrations.controller.spec.ts` |
| U10 | `plan-sync` sem `monitorExtraNumbers` → mantém valor anterior (não reseta p/ 0) | idem |
| U11 | Plano `essencial` passa `isPlanAllowed()` | `monitor.controller.spec.ts` |
| U12 | Plano `free` / `starter` falha `isPlanAllowed()` | idem |

### 5.2 Testes manuais pelo Abel em produção

1. **Essencial + 1 número**: ativar Monitor em tenant Essencial, configurar 1 número WA → salva; tentar 2 → 400.
2. **Adicional**: simular `plan-sync` com `monitorExtraNumbers: 1` para tenant Essencial → salva 2 números.
3. **Grandfathering**: tenant Profissional com 3 números faz downgrade para Essencial via plan-sync → GET funciona, envios continuam; tentar salvar 2 números → 400.
4. **Mesmo número em setores**: configurar mesmo número em Fiscal e Logística → `waNumbersUsed: 1`, não 2.
5. **Override**: ativar `monitorOverride` pelo admin da plataforma → limite sobe para 10.

---

## M6 — Casos de borda

| Caso | Comportamento esperado |
|------|----------------------|
| Mesmo número WhatsApp em múltiplos setores | Conta 1 vez. Dedup por `normalizePhone(contact)`. |
| Número removido e readicionado dentro do PUT | Contagem usa o sectorConfig **após** a edição, não o anterior. |
| Tenant sem linha em `plan_limits` | `monitorWaLimit(null, 0, false) = 0` → Monitor bloqueado (comportamento free). |
| `monitorOverride = true` | Limite = 10 (cap técnico); ignora `plan` e `monitorExtraNumbers`. |
| Downgrade de plano via `plan-sync` | Config existente acima do novo limite fica "congelada" (grandfathering). Próximo PUT que exceda o novo limite é bloqueado. |
| Upgrade de plano via `plan-sync` | Limite aumenta imediatamente; próximo GET já retorna `waNumbersLimit` atualizado. |
| `plan-sync` sem `monitorExtraNumbers` | Não resetar para 0 — usar `update: { ...(dto.monitorExtraNumbers !== undefined ? { monitorExtraNumbers: dto.monitorExtraNumbers } : {}) }`. |
| Dois PUT simultâneos no mesmo tenant | Sem race condition relevante: o gate lê o mergedSectorConfig do DTO atual, não do banco. |
| `notificationPhone` legado (raiz) + recipients no sectorConfig | Ambos contam para a soma de únicos. Se o mesmo número está nos dois, conta 1 vez. |

---

## M7 — Sequência de deploy

**Regra:** receptor primeiro (Nexa), emissor depois (TMS). O DTO do Nexa com o novo
campo `monitorExtraNumbers` deve estar em produção **antes** do TMS começar a enviá-lo.

```
┌─────────────────────────────────────────────────────┐
│  FASE 1 — Nexa (este squad)                         │
│  1. Migration: adicionar monitorExtraNumbers         │
│     → prisma migrate deploy                         │
│  2. Deploy código M1+M2+M3+M4                        │
│     → docker compose restart backend               │
│  3. Verificar: GET /monitor/config retorna           │
│     waNumbersUsed e waNumbersLimit                  │
│  4. Verificar: plan-sync com monitorExtraNumbers=1   │
│     persiste sem 400                                │
└─────────────────────────────────────────────────────┘
           ↓ (Nexa em prod com campo aceito)
┌─────────────────────────────────────────────────────┐
│  FASE 2 — TMS (squad separado)                      │
│  1. Atualizar plan-sync para enviar                 │
│     monitorExtraNumbers ao contratar adicional      │
│  2. Tela de assinatura: mostrar adicionais e link   │
│     para checkout (Asaas)                          │
│  3. Webhook Asaas: ao aprovar compra de adicional,  │
│     disparar plan-sync com novo total               │
└─────────────────────────────────────────────────────┘
```

### Itens pendentes para o squad TMS

1. Atualizar `lia-support.service.ts` (ou onde fica o `plan-sync` no TMS) para incluir
   `monitorExtraNumbers: number` no payload ao chamar `POST <NEXA_API_URL>/api/integrations/plan-sync`.
2. Webhook Asaas: capturar aprovação de assinatura de adicional e disparar o plan-sync.
3. Tela de Assinatura: exibir contador de adicionais contratados e botão de compra.
4. **Não há mudança de contrato nos endpoints consumidos pelo TMS** (portal, handoff) — REGRA 1 do REGRAS-SQUAD.md não é acionada aqui.

---

## Tarefas resumidas

| ID | Tarefa | Arquivo(s) | Status |
|----|--------|-----------|--------|
| M1 | Schema + constante de inclusos + DTO plan-sync | `schema.prisma`, `monitor-plan-limits.const.ts`, `integrations.controller.ts` | 🔲 Pendente |
| M2 | Gate de números no PUT + grandfathering + campos no GET | `monitor.controller.ts` | 🔲 Pendente |
| M3 | Abertura do Essencial (MONITOR_PLANS + VALID_PLANS + mensagem) | `monitor.controller.ts`, `integrations.controller.ts` | 🔲 Pendente |
| M4 | UI: contador + upsell block | `MonitorConfigPage.tsx` | 🔲 Pendente |
| M5 | Testes unitários | `monitor-plan-limits.const.spec.ts`, `monitor.controller.spec.ts`, `integrations.controller.spec.ts` | 🔲 Pendente |
| M6 | (edge cases cobertos nos testes de M5) | — | 🔲 Pendente |
| M7 | Sequência de deploy e comunicação ao squad TMS | `docs/api-contract.md` | 🔲 Pendente |

---

## Checklist REGRAS-SQUAD.md

```
[N/A] Type-check frontend zero erros / build backend instruído         ← SÓ DOCUMENTAÇÃO nesta fase
[N/A] Testes do escopo alterado passando                               ← SÓ DOCUMENTAÇÃO nesta fase
[ ]   Tocou em endpoint consumido pelo TMS? → checklist de contrato executado
      ↳ /integrations/plan-sync: campo novo @IsOptional() → retrocompatível ✅
      ↳ Nenhum dos endpoints portal/handoff é alterado ✅
[ ]   Todo caminho de erro loga status/motivo original                 ← a implementar em M2
[ ]   Campos novos declarados no DTO e repassados ao service           ← a implementar em M1
[ ]   Migration (se houver) é aditiva e usa migrate deploy             ← a implementar em M1 ✅ (aditiva)
[ ]   Commit em Conventional Commits; push NÃO executado
```

---

*Documento criado em 2026-07-13. Aguardando revisão e aprovação do Abel antes da implementação.*
