# Squad TMS — Monitor de Frota (WhatsApp Alerts)

> **Repositório:** `hipertms_v12`  
> **Regra:** Somente leitura/análise no TMS. Implementação real pelo squad TMS.  
> **Dependência:** Completar antes do squad Nexa.
> **Princípio:** `docs/principles/proatividade.md` — o sistema avisa *antes* do problema,
> não depois. Toda regra aqui tem janela de antecedência suficiente para o usuário agir.

## Contexto

O TMS já tem toda a infraestrutura necessária:

| O que existe | Onde |
|---|---|
| Dados de km, datas de manutenção por veículo | `tenantFleetVehicle.currentOdometer`, `nextMaintenanceDate`, `metadata.vehicle` |
| Documentos do veículo (CRLV, seguro, inspeção) | `metadata.vehicle.documents.registration/insurance/inspection` |
| Validade da CNH por motorista | `tenantFleetDriver.licenseExpiryDate` |
| Motor de proatividade (logistic + finance) | `apps/api/src/application/proactivity/pending-event-rules.ts` |
| Agendador que roda para todos os tenants | `proactivity.scheduler.ts` |
| API para o Nexa ler eventos | `nexa-external.service.ts` |

**O que falta:** o domínio `fleet` não existe em `pending-event-rules.ts`.  
O `MaintenanceAlertService` já cria manutenções por km, mas não gera eventos de proatividade.

---

## Parte 1 — Adicionar domínio `fleet` em `pending-event-rules.ts`

**Arquivo:** `apps/api/src/application/proactivity/pending-event-rules.ts`

### 1.1 Atualizar o tipo `PendingDomain`

```ts
// ANTES
export type PendingDomain = 'logistic' | 'finance';

// DEPOIS
export type PendingDomain = 'logistic' | 'finance' | 'fleet';
```

### 1.2 Adicionar interfaces de snapshot de frota

Inserir após `BudgetSnap`:

```ts
export interface FleetVehicleSnap {
  id: string;
  vehicleNumber: string;
  licensePlate: string;
  currentOdometer: number;
  nextMaintenanceDate: Date | null;
  /** metadata.vehicle.revisionSchedule — intervalos por tipo de serviço */
  revisionSchedule: Record<string, { intervalKm?: number; nextRevisionOdometer?: number }>;
  /** metadata.vehicle.documents — validades de CRLV, seguro, inspeção */
  documents: {
    registration?: { expiryDate?: string };   // CRLV
    insurance?:   { expiryDate?: string };   // seguro
    inspection?:  { expiryDate?: string };   // inspeção/tacógrafo
  };
}

export interface FleetDriverSnap {
  id: string;
  fullName: string;
  driverCode: string;
  licenseNumber: string;
  licenseExpiryDate: Date;
}
```

### 1.3 Atualizar `EvaluatorInput`

Adicionar os campos de frota na interface `EvaluatorInput`:

```ts
export interface EvaluatorInput {
  now: Date;
  dueSoonDays: number;
  startOfToday: Date;
  endOfToday: Date;
  quotes: QuoteSnap[];
  shipments: ShipmentSnap[];
  accounts: AccountSnap[];
  budget?: BudgetSnap | null;
  // ↓ NOVO
  fleetVehicles?: FleetVehicleSnap[];
  fleetDrivers?: FleetDriverSnap[];
}
```

### 1.4 Atualizar `evaluatePendingEvents()`

```ts
export function evaluatePendingEvents(input: EvaluatorInput): PendingCandidate[] {
  const out: PendingCandidate[] = [];
  out.push(...evaluateQuotes(input));
  out.push(...evaluateShipments(input));
  out.push(...evaluateAccounts(input));
  out.push(...evaluateBudget(input));
  // ↓ NOVO
  out.push(...evaluateFleetVehicles(input));
  out.push(...evaluateFleetDrivers(input));
  return out;
}
```

### 1.5 Adicionar função `evaluateFleetDrivers()`

```ts
const CNH_CRITICAL_DAYS = 7;
const CNH_DUE_SOON_DAYS = 30;

function evaluateFleetDrivers(input: EvaluatorInput): PendingCandidate[] {
  const { fleetDrivers = [], startOfToday } = input;
  const out: PendingCandidate[] = [];

  for (const d of fleetDrivers) {
    const expiry = d.licenseExpiryDate;
    const action = `/fleet/drivers/${d.id}`;
    const label = `${d.fullName} (${d.driverCode})`;

    if (expiry < startOfToday) {
      out.push({
        ruleId: 'fleet.cnh_expired',
        domain: 'fleet',
        subjectType: 'DRIVER',
        subjectId: d.id,
        subjectLabel: label,
        dedupeKey: `fleet.cnh_expired:${d.id}`,
        reason: `CNH de ${d.fullName} venceu em ${fmtDate(expiry)} (${d.licenseNumber}).`,
        actionPath: action,
        level: 'L1',
        severity: 'CRITICAL',
        dueAt: expiry,
      });
    } else {
      const daysLeft = Math.ceil((expiry.getTime() - startOfToday.getTime()) / 86_400_000);
      if (daysLeft <= CNH_CRITICAL_DAYS) {
        out.push({
          ruleId: 'fleet.cnh_expiring',
          domain: 'fleet',
          subjectType: 'DRIVER',
          subjectId: d.id,
          subjectLabel: label,
          dedupeKey: `fleet.cnh_expiring:${d.id}`,
          reason: `CNH de ${d.fullName} vence em ${daysLeft} dia(s) — ${fmtDate(expiry)}.`,
          actionPath: action,
          level: 'L1',
          severity: 'OVERDUE',
          dueAt: expiry,
        });
      } else if (daysLeft <= CNH_DUE_SOON_DAYS) {
        out.push({
          ruleId: 'fleet.cnh_expiring',
          domain: 'fleet',
          subjectType: 'DRIVER',
          subjectId: d.id,
          subjectLabel: label,
          dedupeKey: `fleet.cnh_expiring:${d.id}`,
          reason: `CNH de ${d.fullName} vence em ${daysLeft} dias — ${fmtDate(expiry)}.`,
          actionPath: action,
          level: 'L1',
          severity: 'DUE_SOON',
          dueAt: expiry,
        });
      }
    }
  }
  return out;
}
```

### 1.6 Adicionar função `evaluateFleetVehicles()`

```ts
const MAINT_KM_TOLERANCE = 500;
const MAINT_DATE_DUE_SOON_DAYS = 7;
const DOC_DUE_SOON_DAYS = 30;

const DOC_LABELS: Record<string, string> = {
  registration: 'CRLV',
  insurance: 'Seguro',
  inspection: 'Inspeção',
};

function evaluateFleetVehicles(input: EvaluatorInput): PendingCandidate[] {
  const { fleetVehicles = [], startOfToday } = input;
  const out: PendingCandidate[] = [];

  for (const v of fleetVehicles) {
    const action = `/fleet/vehicles/${v.id}`;
    const label = `${v.vehicleNumber} — ${v.licensePlate}`;

    // ── Manutenção por DATA ───────────────────────────────────────────────
    if (v.nextMaintenanceDate) {
      const diff = Math.ceil((v.nextMaintenanceDate.getTime() - startOfToday.getTime()) / 86_400_000);
      if (diff < 0) {
        out.push({
          ruleId: 'fleet.maintenance_date_overdue',
          domain: 'fleet',
          subjectType: 'VEHICLE',
          subjectId: v.id,
          subjectLabel: label,
          dedupeKey: `fleet.maintenance_date_overdue:${v.id}`,
          reason: `Manutenção de ${label} estava prevista para ${fmtDate(v.nextMaintenanceDate)} e não foi realizada.`,
          actionPath: action,
          level: 'L1',
          severity: 'OVERDUE',
          dueAt: v.nextMaintenanceDate,
        });
      } else if (diff <= MAINT_DATE_DUE_SOON_DAYS) {
        out.push({
          ruleId: 'fleet.maintenance_date_due',
          domain: 'fleet',
          subjectType: 'VEHICLE',
          subjectId: v.id,
          subjectLabel: label,
          dedupeKey: `fleet.maintenance_date_due:${v.id}`,
          reason: `Manutenção de ${label} prevista para ${fmtDate(v.nextMaintenanceDate)} (em ${diff} dia(s)).`,
          actionPath: action,
          level: 'L1',
          severity: 'DUE_SOON',
          dueAt: v.nextMaintenanceDate,
        });
      }
    }

    // ── Manutenção por KM ─────────────────────────────────────────────────
    for (const [revKey, schedule] of Object.entries(v.revisionSchedule)) {
      const next = schedule.nextRevisionOdometer;
      if (!next || next <= 0) continue;
      const kmLeft = next - v.currentOdometer;
      if (kmLeft <= 0) {
        out.push({
          ruleId: 'fleet.maintenance_km_overdue',
          domain: 'fleet',
          subjectType: 'VEHICLE',
          subjectId: v.id,
          subjectLabel: label,
          dedupeKey: `fleet.maintenance_km_overdue:${v.id}:${revKey}`,
          reason: `${label} ultrapassou o intervalo de manutenção (${revKey}) — odômetro atual: ${Math.round(v.currentOdometer).toLocaleString('pt-BR')} km.`,
          actionPath: action,
          level: 'L1',
          severity: 'OVERDUE',
          dueAt: null,
          metadata: { revKey, currentOdometer: v.currentOdometer, nextRevisionOdometer: next },
        });
      } else if (kmLeft <= MAINT_KM_TOLERANCE) {
        out.push({
          ruleId: 'fleet.maintenance_km_due',
          domain: 'fleet',
          subjectType: 'VEHICLE',
          subjectId: v.id,
          subjectLabel: label,
          dedupeKey: `fleet.maintenance_km_due:${v.id}:${revKey}`,
          reason: `${label} — ${revKey}: faltam ${Math.round(kmLeft).toLocaleString('pt-BR')} km para manutenção (prevista em ${Math.round(next).toLocaleString('pt-BR')} km).`,
          actionPath: action,
          level: 'L1',
          severity: 'DUE_SOON',
          dueAt: null,
          metadata: { revKey, currentOdometer: v.currentOdometer, nextRevisionOdometer: next },
        });
      }
    }

    // ── Documentos (CRLV, seguro, inspeção) ──────────────────────────────
    for (const [docKey, docLabel] of Object.entries(DOC_LABELS)) {
      const doc = (v.documents as Record<string, { expiryDate?: string } | undefined>)[docKey];
      if (!doc?.expiryDate) continue;
      const expiry = new Date(doc.expiryDate);
      if (isNaN(expiry.getTime())) continue;

      const daysLeft = Math.ceil((expiry.getTime() - startOfToday.getTime()) / 86_400_000);
      if (daysLeft < 0) {
        out.push({
          ruleId: 'fleet.document_expired',
          domain: 'fleet',
          subjectType: 'VEHICLE',
          subjectId: v.id,
          subjectLabel: label,
          dedupeKey: `fleet.document_expired:${v.id}:${docKey}`,
          reason: `${docLabel} de ${label} venceu em ${fmtDate(expiry)}.`,
          actionPath: action,
          level: 'L1',
          severity: docKey === 'registration' ? 'CRITICAL' : 'OVERDUE',
          dueAt: expiry,
          metadata: { docKey, docLabel },
        });
      } else if (daysLeft <= DOC_DUE_SOON_DAYS) {
        out.push({
          ruleId: 'fleet.document_expiring',
          domain: 'fleet',
          subjectType: 'VEHICLE',
          subjectId: v.id,
          subjectLabel: label,
          dedupeKey: `fleet.document_expiring:${v.id}:${docKey}`,
          reason: `${docLabel} de ${label} vence em ${daysLeft} dia(s) — ${fmtDate(expiry)}.`,
          actionPath: action,
          level: 'L1',
          severity: 'DUE_SOON',
          dueAt: expiry,
          metadata: { docKey, docLabel },
        });
      }
    }
  }
  return out;
}
```

### 1.7 Atualizar catálogo declarativo `PENDING_EVENT_RULES`

Adicionar ao array existente:

```ts
{ ruleId: 'fleet.cnh_expired',              domain: 'fleet', label: 'CNH vencida' },
{ ruleId: 'fleet.cnh_expiring',             domain: 'fleet', label: 'CNH vencendo' },
{ ruleId: 'fleet.maintenance_date_overdue', domain: 'fleet', label: 'Manutenção em atraso' },
{ ruleId: 'fleet.maintenance_date_due',     domain: 'fleet', label: 'Manutenção próxima (data)' },
{ ruleId: 'fleet.maintenance_km_overdue',   domain: 'fleet', label: 'Manutenção por km em atraso' },
{ ruleId: 'fleet.maintenance_km_due',       domain: 'fleet', label: 'Manutenção próxima (km)' },
{ ruleId: 'fleet.document_expired',         domain: 'fleet', label: 'Documento vencido (CRLV/seguro/inspeção)' },
{ ruleId: 'fleet.document_expiring',        domain: 'fleet', label: 'Documento vencendo' },
```

---

## Parte 2 — Atualizar `proactivity.service.ts`

**Arquivo:** `apps/api/src/application/proactivity/proactivity.service.ts`

### 2.1 Adicionar imports

```ts
import {
  // imports já existentes ...
  type FleetVehicleSnap,
  type FleetDriverSnap,
} from './pending-event-rules';
```

### 2.2 Atualizar `buildInput()`

```ts
private async buildInput(tenantId: string, now: Date): Promise<EvaluatorInput> {
  const [quotes, shipments, accounts, budget, fleetVehicles, fleetDrivers] = await Promise.all([
    this.loadQuotes(tenantId),
    this.loadShipments(tenantId),
    this.loadAccounts(tenantId),
    this.loadBudget(tenantId, now),
    this.loadFleetVehicles(tenantId),   // ← NOVO
    this.loadFleetDrivers(tenantId),    // ← NOVO
  ]);
  return {
    now,
    dueSoonDays: DUE_SOON_DAYS,
    startOfToday: this.startOfDayInTz(now),
    endOfToday: this.endOfDayInTz(now),
    quotes,
    shipments,
    accounts,
    budget,
    fleetVehicles,   // ← NOVO
    fleetDrivers,    // ← NOVO
  };
}
```

### 2.3 Adicionar `loadFleetVehicles()`

```ts
private async loadFleetVehicles(tenantId: string): Promise<FleetVehicleSnap[]> {
  const rows = await this.prisma.client.tenantFleetVehicle.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      vehicleNumber: true,
      licensePlate: true,
      currentOdometer: true,
      nextMaintenanceDate: true,
      metadata: true,
    },
  });

  return rows.map((v) => {
    const meta = (v.metadata as Record<string, unknown>) ?? {};
    const vehicleData = (meta.vehicle as Record<string, unknown>) ?? {};
    const revisionSchedule = (vehicleData.revisionSchedule as Record<string, {
      intervalKm?: number;
      nextRevisionOdometer?: number;
    }>) ?? {};
    const documents = (vehicleData.documents as FleetVehicleSnap['documents']) ?? {};

    return {
      id: v.id,
      vehicleNumber: v.vehicleNumber ?? v.id.slice(0, 8),
      licensePlate: v.licensePlate,
      currentOdometer: Number(v.currentOdometer ?? 0),
      nextMaintenanceDate: v.nextMaintenanceDate ?? null,
      revisionSchedule,
      documents,
    };
  });
}
```

### 2.4 Adicionar `loadFleetDrivers()`

```ts
private async loadFleetDrivers(tenantId: string): Promise<FleetDriverSnap[]> {
  const rows = await this.prisma.client.tenantFleetDriver.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      fullName: true,
      driverCode: true,
      licenseNumber: true,
      licenseExpiryDate: true,
    },
  });

  return rows
    .filter((d) => d.licenseExpiryDate != null)
    .map((d) => ({
      id: d.id,
      fullName: d.fullName,
      driverCode: d.driverCode ?? d.id.slice(0, 8),
      licenseNumber: d.licenseNumber,
      licenseExpiryDate: d.licenseExpiryDate!,
    }));
}
```

---

## Parte 3 — Endpoint para o Nexa consumir eventos de frota

**Arquivo:** `apps/api/src/application/nexa-external/nexa-external.service.ts`

O Nexa já consome `GET /api/nexa/proactivity/events`. Basta adicionar um método que retorna
os eventos de proatividade com `domain = 'fleet'` filtrados por tenant.

### 3.1 Adicionar método `getFleetAlerts()`

```ts
async getFleetAlerts(tenantId: string) {
  if (!tenantId) return { alerts: [] };

  const events = await this.prisma.client.tenantProactivityPendingEvent.findMany({
    where: {
      tenantId,
      domain: 'fleet',
      status: 'OPEN',
    },
    orderBy: [
      { severity: 'desc' },
      { updatedAt: 'desc' },
    ],
    select: {
      id: true,
      ruleId: true,
      domain: true,
      subjectType: true,
      subjectId: true,
      subjectLabel: true,
      reason: true,
      severity: true,
      dueAt: true,
      actionPath: true,
      metadata: true,
      updatedAt: true,
    },
  });

  return { alerts: events };
}
```

### 3.2 Expor via controller (ou incluir no endpoint existente de proactivity)

Se o endpoint `GET /api/nexa/proactivity/events` já existir, basta remover o filtro de
domínio para incluir `fleet`. Caso contrário, adicionar rota nova:

```ts
// nexa-external.controller.ts (ou onde estiver o controller do nexa-external)
@Get('fleet/alerts')
@UseGuards(ServiceTokenGuard)
async fleetAlerts(@Query('tenantId') tenantId: string) {
  return this.nexaExternalService.getFleetAlerts(tenantId);
}
```

---

## Parte 4 — Variáveis de ambiente (verificar)

Confirmar que estão ativas em produção:

```env
PROACTIVITY_CRON_ENABLED=true
# Intervalo padrão do cron (definido em proactivity.cron-trigger.ts)
```

Não é necessário nenhuma env nova — o motor de frota roda junto com o cron existente.

---

## Checklist de entrega (TMS)

- [ ] `pending-event-rules.ts` — `PendingDomain` atualizado com `'fleet'`
- [ ] `pending-event-rules.ts` — interfaces `FleetVehicleSnap` e `FleetDriverSnap` adicionadas
- [ ] `pending-event-rules.ts` — `EvaluatorInput` com `fleetVehicles` e `fleetDrivers`
- [ ] `pending-event-rules.ts` — `evaluateFleetDrivers()` implementado
- [ ] `pending-event-rules.ts` — `evaluateFleetVehicles()` implementado (km + data + docs)
- [ ] `pending-event-rules.ts` — `evaluatePendingEvents()` chama as novas funções
- [ ] `pending-event-rules.ts` — catálogo `PENDING_EVENT_RULES` atualizado
- [ ] `pending-event-rules.spec.ts` — testes unitários para as regras de frota
- [ ] `proactivity.service.ts` — `buildInput()` carrega veículos e motoristas
- [ ] `proactivity.service.ts` — `loadFleetVehicles()` e `loadFleetDrivers()` implementados
- [ ] `nexa-external.service.ts` — `getFleetAlerts()` ou endpoint unificado exposto
- [ ] `PROACTIVITY_CRON_ENABLED=true` confirmado em produção
