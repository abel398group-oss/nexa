# Monitor Proativo — Orquestra Nexa

> **Para:** Agente Orquestra Nexa (backend + frontend)  
> **Repo:** `github.com/hipervias/nexa`  
> **Depende de:** Orquestra TMS entregar os endpoints de leitura primeiro

---

## 1. Tabelas Prisma — criar migration

Adicionar ao `apps/backend/prisma/schema.prisma`:

```prisma
model TenantNotificationConfig {
  id              String   @id @default(cuid())
  tenantId        String   @unique
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  sendHour        Int      @default(7)      // 0-23
  sendWeekends    Boolean  @default(false)
  channel         String   @default("whatsapp") // whatsapp | email | both
  maxWppPerDay    Int      @default(1)
  fiscalEnabled   Boolean  @default(true)
  logisticEnabled Boolean  @default(true)
  frotaEnabled    Boolean  @default(true)
  financeEnabled  Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model AlertState {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  category    String   // fiscal | logistic | frota | finance
  type        String   // cte_sem_sefaz | cnh_vencendo | embarque_atrasado | etc
  externalId  String   // ID do item no TMS (CT-e, embarque, motorista...)
  status      String   @default("open") // open | snoozed | resolved | archived
  snoozedUntil DateTime?
  detectedAt  DateTime @default(now())
  resolvedAt  DateTime?
  notifiedAt  DateTime?
  notifyCount Int      @default(0)
  metadata    Json?    // dados extras do item (placa, número NF, etc)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, type, externalId])
}

model NotificationLog {
  id         String   @id @default(cuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id])
  channel    String   // whatsapp | email
  content    String
  sentAt     DateTime @default(now())
  success    Boolean
  error      String?
}
```

Rodar: `npx prisma migrate dev --name add_monitor_tables`

---

## 2. MonitorService — cron de detecção

Criar `apps/backend/src/application/monitor/monitor.service.ts`

**Responsabilidade:** rodar a cada 30 minutos, consultar o TMS por categoria, comparar com `AlertState` e criar/atualizar alertas.

```typescript
// Estrutura do serviço
@Injectable()
export class MonitorService {
  // Roda a cada 30 minutos
  @Interval(30 * 60 * 1000)
  async runCycle() {
    const tenants = await this.getActiveTenants()
    for (const tenant of tenants) {
      await this.evaluateFiscal(tenant)
      await this.evaluateLogistic(tenant)
      await this.evaluateFrota(tenant)
      await this.evaluateFinance(tenant)
    }
  }
}
```

**Regras por categoria (o que buscar no TMS e quando abrir alerta):**

| Tipo | Endpoint TMS | Condição |
|------|-------------|----------|
| `cte_sem_sefaz` | `GET /monitor/fiscal/cte-pendentes` | emitido há > 2h sem autorização |
| `cte_rejeitado` | `GET /monitor/fiscal/cte-rejeitados` | qualquer rejeição |
| `mdfe_aberto` | `GET /monitor/fiscal/mdfe-abertos` | viagem encerrada há > 12h |
| `embarque_atrasado` | `GET /monitor/logistic/atrasados` | data prevista < hoje |
| `embarque_sem_motorista` | `GET /monitor/logistic/sem-motorista` | partida em < 24h |
| `cnh_vencendo` | `GET /monitor/frota/cnh-vencendo` | vence em <= 30 dias |
| `crlv_vencendo` | `GET /monitor/frota/crlv-vencendo` | vence em <= 30 dias |
| `manutencao_proxima` | `GET /monitor/frota/manutencao-proxima` | <= 500km ou <= 7 dias |
| `conta_vencendo` | `GET /monitor/finance/contas-vencendo` | vence amanhã |
| `conta_vencida` | `GET /monitor/finance/contas-vencidas` | vencida e em aberto |

---

## 3. AlertStateService — ciclo de vida do alerta

Criar `apps/backend/src/application/monitor/alert-state.service.ts`

**Lógica:**

```
detectou item no TMS?
  └── já existe AlertState aberto para esse externalId?
        ├── SIM → item ainda existe no TMS? 
        │         ├── SIM → mantém aberto (não cria duplicata)
        │         └── NÃO → marca como resolved, resolvedAt = now()
        └── NÃO → cria novo AlertState com status = 'open'
```

**Regras de snooze e arquivamento:**
- Status `snoozed` → ignorar até `snoozedUntil`
- `notifyCount >= 2` e sem resposta após 48h → status `archived`
- Reabre como `open` na próxima semana se ainda existir no TMS

---

## 4. ConsolidationService — 1 mensagem por dia

Criar `apps/backend/src/application/monitor/consolidation.service.ts`

**Roda todo dia no horário configurado pelo tenant (padrão 7h).**

Lógica:
1. Busca todos AlertState `open` ou `snoozed` com `snoozedUntil < now()` do tenant
2. Agrupa por categoria e severidade
3. Monta texto consolidado (críticos primeiro, depois urgentes, depois informativos)
4. Passa para `NotificationService`
5. Atualiza `notifiedAt` e incrementa `notifyCount` em cada alerta

**Severidade:**
- Crítico: `cte_rejeitado`, `cnh_vencendo` (< 7 dias), `crlv_vencendo` (< 7 dias)
- Urgente: `cte_sem_sefaz`, `embarque_atrasado`, `embarque_sem_motorista`, `conta_vencida`
- Informativo: `manutencao_proxima`, `mdfe_aberto`, `conta_vencendo`

---

## 5. NotificationService — envio via WAHA ou e-mail

Criar `apps/backend/src/application/monitor/notification.service.ts`

Interface agnóstica ao canal:

```typescript
interface NotificationChannel {
  send(tenantId: string, message: string): Promise<void>
}

// Implementações:
class WahaNotificationChannel implements NotificationChannel { ... }
class EmailNotificationChannel implements NotificationChannel { ... }
```

O serviço escolhe o canal com base em `TenantNotificationConfig.channel`.
Registra em `NotificationLog` independente do canal usado.

---

## 6. Endpoint de configuração — admin do tenant

Criar `apps/backend/src/application/monitor/monitor-config.controller.ts`

```
GET  /monitor/config        → retorna config atual do tenant
PUT  /monitor/config        → atualiza preferências
GET  /monitor/alerts        → lista alertas abertos (para a página do TMS consumir)
POST /monitor/alerts/:id/snooze  → snooze de um alerta
POST /monitor/alerts/:id/resolve → marca como resolvido manualmente
```

---

## 7. Módulo NestJS

Criar `apps/backend/src/application/monitor/monitor.module.ts` e registrar em `app.module.ts`.

---

## 8. Página de configuração — frontend Nexa

Criar `apps/frontend/src/pages/MonitorConfigPage.tsx`

Campos:
- Horário de envio (select 6h–10h)
- Canal preferido (WhatsApp / E-mail / Ambos)
- Enviar fins de semana (toggle)
- Categorias ativas: Fiscal / Logística / Frota / Financeiro (4 toggles)

Usar `react-hook-form + zod` conforme padrão do projeto.  
Rota sugerida: `/settings/monitor`  
Visível apenas para role `ADMIN` do tenant.

---

## Checklist de entrega

- [ ] Migration Prisma com as 3 tabelas
- [ ] MonitorService com cron e avaliação por categoria
- [ ] AlertStateService com ciclo de vida completo
- [ ] ConsolidationService com agrupamento e severidade
- [ ] NotificationService com interface agnóstica (WAHA + e-mail)
- [ ] Controller REST com os 5 endpoints
- [ ] MonitorModule registrado no AppModule
- [ ] Página de configuração no frontend
- [ ] Variável de ambiente: `MONITOR_ENABLED=true` (feature flag)
