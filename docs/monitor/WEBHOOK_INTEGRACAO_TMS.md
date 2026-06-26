# Integração TMS → Nexa: Webhook de Proatividade

**Data:** 2026-06-26
**Status:** Pendente implementação (TMS + Nexa)
**Contexto:** Substituir o polling periódico do Nexa por um push do TMS quando eventos proativos são gerados.

---

## Arquitetura

### Antes (polling — deprecar)
```
[Nexa MonitorService @Interval/60s] → GET /api/nexa/proactivity/events → [TMS]
```

### Depois (webhook — implementar)
```
[TMS ProactivityService] → POST /api/monitor/ingest → [Nexa]
```

**Vantagens:**
- Sem polling desnecessário a cada 60s
- Nexa recebe na hora que o evento ocorre
- Sem mapeamento de campos (domain→category, reason→title)
- Mais confiável (sem risco de janela perdida entre ciclos)

---

## Tarefa do Squad TMS

### Quando disparar
Após o `ProactivityService` gerar ou recalcular os eventos de um tenant:
- Quando novos eventos forem criados
- Quando eventos existentes forem fechados/resolvidos
- Quando a severidade de um evento mudar

### Endpoint
```
POST https://nexa.hipertms.com.br/api/monitor/ingest
Authorization: Bearer <NEXA_SERVICE_TOKEN>
Content-Type: application/json
```

### Payload
```json
{
  "tmsTenantId": "0d76edb5-cd79-4d03-937b-7fb42ef451a8",
  "events": [
    {
      "id": "string",
      "severity": "CRITICAL | OVERDUE | DUE_SOON | INFO",
      "category": "frota | logistic | finance | fiscal",
      "title": "CNH de João vence em 14/07 (19d)",
      "description": "string ou null"
    }
  ]
}
```

> **IMPORTANTE:** Se `events` vier vazio `[]`, significa que o tenant não tem
> pendências no momento — o Nexa vai resolver automaticamente todos os alertas
> abertos desse tenant.

### Regras de implementação no TMS
- **Fire-and-forget:** não bloquear o fluxo do TMS se o Nexa não responder
- **Timeout:** máximo 5s na chamada HTTP
- **Retry:** nenhum retry automático (o Nexa tem tolerância a reenvio via upsert)
- **Log:** registrar erro no Sentry/log se o Nexa retornar != 2xx, mas não propagar

### Mapeamento de campos (TMS → payload)
| Campo TMS (`PendingEventView`) | Campo do payload | Observação |
|-------------------------------|-----------------|------------|
| `id` | `id` | ID único do evento |
| `severity` | `severity` | Mesmo valor |
| `domain` | `category` | `fleet`→`frota`, `logistic`→`logistic`, `finance`→`finance`, `fiscal`→`fiscal` |
| `reason` | `title` | Texto principal do alerta |
| `subjectLabel` | `description` | Pode ser null |

---

## Tarefa do Squad Nexa

### Novo endpoint — `POST /api/monitor/ingest`
Adicionar no `MonitorController`, protegido por `ServiceTokenGuard` (não JWT):

```typescript
@UseGuards(ServiceTokenGuard)
@Post('ingest')
async ingestFromTms(@Body() dto: IngestDto) {
  return this.monitor.ingestFromTms(dto.tmsTenantId, dto.events);
}
```

### Novo método — `MonitorService.ingestFromTms()`
Reutiliza `syncAlertStates()` já existente, só muda a origem dos dados:

```typescript
async ingestFromTms(
  tmsTenantId: string,
  events: TmsProactivityEvent[],
): Promise<{ synced: number; resolved: number }> {
  const tenant = await this.prisma.tenant.findFirst({
    where: { status: 'active' },
    // Mapeia tmsTenantId → Nexa tenantId via env TMS_TENANT_ID_*
  });
  if (!tenant) throw new NotFoundException(`Tenant TMS ${tmsTenantId} não mapeado`);
  return this.syncAlertStates(tenant.id, events);
}
```

---

## O que remover no Nexa (limpeza)

### Remover
| Arquivo | O que remover |
|---------|--------------|
| `monitor.service.ts` | `@Interval` `runCycle()` — o loop de polling |
| `hipertms.connector.ts` | Método `getProactivityEvents()` inteiro |
| `hipertms.connector.ts` | Mapeamento `DOMAIN_TO_CATEGORY` (adicionado em 2026-06-26) |

### Remover do `.env` / `.env.production`
```
MONITOR_SYNC_INTERVAL_MS   ← não precisa mais
```

### Manter
- `ConsolidationService` — sem alteração (dispara às 6h BRT = 9h UTC)
- `MonitorNotificationService` — sem alteração
- `alert_states` table — sem alteração
- `TenantNotificationConfig` table — sem alteração
- Endpoints existentes: `GET /config`, `PUT /config`, `GET /alerts`, snooze, resolve, `notify-now`
- `syncNow()` e `POST /monitor/sync` — mantém para debug manual

---

## Variáveis de ambiente após a mudança

### Remover
```env
MONITOR_SYNC_INTERVAL_MS=60000
```

### Manter
```env
MONITOR_ENABLED=true
MONITOR_DEFAULT_SEND_HOUR=9        # 6h BRT = 9h UTC (produção)
ALERT_ADMIN_PHONE=5511917747429,5511974869142
TMS_BASE_URL=http://hipertms_v12-backend-1:3000/api
TMS_SERVICE_TOKEN=hipertms-nexa-secret-2026
TMS_TENANT_ID_HIPERTMS=0d76edb5-cd79-4d03-937b-7fb42ef451a8
```

---

## Sequência de entrega

1. **Squad TMS** implementa o webhook POST ao Nexa após gerar/recalcular eventos
2. **Squad Nexa** implementa `POST /api/monitor/ingest` + `ingestFromTms()`
3. **Teste:** acionar manualmente o ciclo proativo no TMS e verificar log do Nexa
4. **Validar:** WhatsApp chega às 6h BRT com o resumo de pendências
5. **Limpeza:** remover `runCycle()` e `getProactivityEvents()` do Nexa

---

## Contato / Dúvidas
Squad Nexa: ver `CLAUDE.md` na raiz do repositório
Squad TMS: endpoint de destino é `nexa.hipertms.com.br` — não exposto externamente, tráfego interno Docker
