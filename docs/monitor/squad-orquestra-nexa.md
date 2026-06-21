# Monitor Proativo — Orquestra Nexa

> **Para:** Agente Orquestra Nexa (backend + frontend)  
> **Repo:** `github.com/hipervias/nexa`  
> **Depende de:** Orquestra TMS entregar `GET /proactivity/events` primeiro

---

## Contexto

O TMS já detecta e classifica os eventos (CRITICAL, OVERDUE, DUE_SOON, INFO).
O Nexa não precisa recriar a lógica de detecção — só lê, consolida e envia.
Trabalho significativamente menor que o escopo original.

---

## 1. Tabelas Prisma — migration

```prisma
model TenantNotificationConfig {
  id              String   @id @default(cuid())
  tenantId        String   @unique
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  sendHour        Int      @default(7)
  sendWeekends    Boolean  @default(false)
  channel         String   @default("whatsapp") // whatsapp | email | both
  fiscalEnabled   Boolean  @default(true)
  logisticEnabled Boolean  @default(true)
  frotaEnabled    Boolean  @default(true)
  financeEnabled  Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model AlertState {
  id          String    @id @default(cuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id])
  tmsEventId  String                        // id do evento no TMS
  severity    String                        // CRITICAL | OVERDUE | DUE_SOON | INFO
  category    String
  title       String
  description String?
  status      String    @default("open")   // open | snoozed | resolved
  snoozedUntil DateTime?
  notifiedAt  DateTime?
  notifyCount Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([tenantId, tmsEventId])
}

model NotificationLog {
  id        String   @id @default(cuid())
  tenantId  String
  channel   String
  content   String
  sentAt    DateTime @default(now())
  success   Boolean
  error     String?
}
```

Rodar: `npx prisma migrate dev --name add_monitor_tables`

---

## 2. MonitorService — busca eventos do TMS

```typescript
@Injectable()
export class MonitorService {
  // Roda a cada 30 minutos
  @Interval(30 * 60 * 1000)
  async runCycle() {
    const tenants = await this.getActiveTenants()
    for (const tenant of tenants) {
      const events = await this.tmsConnector.getProactivityEvents(tenant.tmsId)
      await this.syncAlertStates(tenant.id, events)
    }
  }

  private async syncAlertStates(tenantId: string, events: TmsEvent[]) {
    for (const event of events) {
      await this.prisma.alertState.upsert({
        where: { tenantId_tmsEventId: { tenantId, tmsEventId: event.id } },
        create: { tenantId, tmsEventId: event.id, severity: event.severity,
                  category: event.category, title: event.title,
                  description: event.description },
        update: { severity: event.severity, title: event.title }
      })
    }
    // Resolver alertas que o TMS não retornou mais
    await this.resolveStaleAlerts(tenantId, events.map(e => e.id))
  }
}
```

---

## 3. ConsolidationService — 1 mensagem por dia

Roda no horário configurado (padrão 7h). Busca todos `AlertState` com `status=open`,
agrupa por severidade (CRITICAL primeiro), monta texto e passa para `NotificationService`.

Após envio: atualiza `notifiedAt` e incrementa `notifyCount`.
Se `notifyCount >= 2` e sem resolução em 48h: muda status para `archived`.

---

## 4. NotificationService — WAHA ou e-mail

Interface agnóstica:
```typescript
interface NotificationChannel {
  send(tenantId: string, message: string): Promise<void>
}
// Fase 1: WahaNotificationChannel (já existe no projeto)
// Fase 2: WhatsAppBusinessChannel (Z-API ou Twilio)
```

---

## 5. Endpoints REST

```
GET  /monitor/config           → config do tenant
PUT  /monitor/config           → atualiza preferências
GET  /monitor/alerts           → lista alertas abertos
POST /monitor/alerts/:id/snooze  → snooze 24h
POST /monitor/alerts/:id/resolve → resolve manualmente
```

---

## 6. Página de configuração — frontend

`apps/frontend/src/pages/MonitorConfigPage.tsx`  
Rota: `/settings/monitor` · Role: `ADMIN`  
Campos: horário de envio, canal (WhatsApp/e-mail/ambos), categorias ativas (4 toggles).

---

## Checklist de entrega

- [ ] Migration com 3 tabelas Prisma
- [ ] `MonitorService` com cron que busca `GET /proactivity/events` do TMS
- [ ] `ConsolidationService` com agrupamento por severidade
- [ ] `NotificationService` agnóstico ao canal
- [ ] 5 endpoints REST
- [ ] `MonitorModule` registrado no `AppModule`
- [ ] Página de configuração no frontend
- [ ] Env var: `MONITOR_ENABLED=true`
