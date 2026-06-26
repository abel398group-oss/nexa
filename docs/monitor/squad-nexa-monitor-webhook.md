# Squad Nexa — Implementação: Endpoint de Ingestão de Eventos TMS

**Data:** 2026-06-26
**Status:** Pendente
**Contexto:** O TMS vai passar a empurrar eventos proativos via webhook. O Nexa
precisa receber esses eventos e persistir no `alert_states`. O polling atual
(`MonitorService @Interval`) será removido após essa entrega.

---

## O que implementar

### 1. Novo endpoint `POST /api/monitor/ingest`

Adicionar em `MonitorController`, protegido por `ServiceTokenGuard` (mesmo guard
que o endpoint `/api/nexa/proactivity/events` do TMS usa — valida o header
`Authorization: Bearer <TMS_SERVICE_TOKEN>`):

```typescript
// monitor.controller.ts

@UseGuards(ServiceTokenGuard)
@Post('ingest')
async ingestFromTms(@Body() dto: IngestFromTmsDto) {
  return this.monitor.ingestFromTms(dto.tmsTenantId, dto.events);
}
```

**DTO:**
```typescript
class TmsEventDto {
  @IsString() id: string;
  @IsIn(['CRITICAL','OVERDUE','DUE_SOON','INFO']) severity: string;
  @IsIn(['frota','logistic','finance','fiscal']) category: string;
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
}

class IngestFromTmsDto {
  @IsString() tmsTenantId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TmsEventDto)
  events: TmsEventDto[];
}
```

---

### 2. Novo método `MonitorService.ingestFromTms()`

Reutiliza `syncAlertStates()` já existente — só muda a origem dos dados:

```typescript
async ingestFromTms(
  tmsTenantId: string,
  events: TmsProactivityEvent[],
): Promise<{ synced: number; resolved: number }> {
  // Mapeia tmsTenantId (UUID do TMS) → Nexa tenantId
  // usando as envs TMS_TENANT_ID_<SLUG>
  const tenants = await this.prisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true, slug: true },
  });

  const tenant = tenants.find((t) => {
    const key = `TMS_TENANT_ID_${t.slug.toUpperCase().replace(/-/g, '_')}`;
    return process.env[key] === tmsTenantId;
  });

  if (!tenant) {
    this.logger.warn(`ingestFromTms: tmsTenantId ${tmsTenantId} não mapeado para nenhum tenant ativo`);
    return { synced: 0, resolved: 0 };
  }

  return this.syncAlertStates(tenant.id, events);
}
```

---

### 3. O que remover após a entrega

| Arquivo | O que remover |
|---------|--------------|
| `monitor.service.ts` | Método `runCycle()` com `@Interval` — o loop de polling |
| `hipertms.connector.ts` | Método `getProactivityEvents()` inteiro |
| `hipertms.connector.ts` | Mapeamento `DOMAIN_TO_CATEGORY` (adicionado em 2026-06-26) |

**Env vars para remover do `.env.production`:**
```
MONITOR_SYNC_INTERVAL_MS   ← remover
```

**Manter:**
- `syncNow()` + `POST /monitor/sync` — útil para debug manual
- `ConsolidationService` — sem alteração (dispara às 6h BRT = 9h UTC)
- `MonitorNotificationService`, `alert_states`, config, snooze, resolve, notify-now

---

## Sequência de entrega

1. Implementar `IngestFromTmsDto` + `POST /api/monitor/ingest`
2. Implementar `MonitorService.ingestFromTms()`
3. Testar com curl simulando o TMS:
```bash
curl -X POST https://nexa.hipertms.com.br/api/monitor/ingest \
  -H "Authorization: Bearer hipertms-nexa-secret-2026" \
  -H "Content-Type: application/json" \
  -d '{
    "tmsTenantId": "0d76edb5-cd79-4d03-937b-7fb42ef451a8",
    "events": [{
      "id": "test-001",
      "severity": "DUE_SOON",
      "category": "frota",
      "title": "CNH de teste vence em 14/07 (19d)",
      "description": null
    }]
  }'
```
4. Confirmar que alerta aparece em `GET /api/monitor/alerts`
5. Confirmar que `POST /api/monitor/notify-now` dispara WhatsApp
6. Remover `runCycle()` e `getProactivityEvents()`
7. Deploy e validar em produção

---

## Dependência
Squad TMS precisa implementar o disparo do webhook no lado deles.
Doc do TMS: `hipertms_v12/docs/features/platform/nexa-proactivity-webhook.md`
