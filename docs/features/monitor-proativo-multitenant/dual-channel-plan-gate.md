# Monitor Proativo — Dual-Channel, Auto-Fill e Plan Gate

**Status:** Implementado  
**Data:** 2026-07-04  
**ADR:** [032](../../adr/032-monitor-dual-channel-plan-gate.md)

---

## O que foi implementado

### 1. Canal dual por setor (WhatsApp + E-mail)

Cada setor agora aceita dois destinatários independentes:
- **WhatsApp** (`phone`): notificação imediata, urgente
- **E-mail** (`email`): arquivável, consultável depois

Ambos são configurados na tela `/settings/monitor`, campo por campo dentro do card de cada setor. Se apenas um for preenchido, só aquele canal é ativado. Se ambos estiverem preenchidos, o alerta chega nos dois canais simultaneamente.

**Backend:** `ConsolidationService.processPerSector()` verifica `sc.phone` e `sc.email` de forma independente. O e-mail é enviado via `EmailReplyService.sendAlertEmail()` — sem link de opt-out (notificação operacional admin-para-admin).

**Schema:** Sem migration de schema — o campo `email` é adicionado dentro do JSON `sectorConfig` que já existe.

---

### 2. Auto-fill a partir do cadastro

Novo endpoint `GET /monitor/prefill`:
```json
{ "email": "abel@hipertms.com.br", "phone": "5511988073788" }
```

- `email`: e-mail do primeiro usuário com role `admin` do tenant
- `phone`: telefone do primeiro seller ativo do tenant

O frontend exibe o botão **"Usar dados do meu cadastro"** quando o endpoint retorna algum dado. Clicar no botão preenche apenas os campos ainda em branco (não sobrescreve configurações já feitas). Comportamento idempotente.

---

### 3. Default Dom-Sáb (todos os dias)

Novos tenants e novos setores são criados com `sendDays: [0,1,2,3,4,5,6]` (todos os dias) em vez de apenas dias úteis. Razão: alertas CRITICAL (CT-e rejeitado, saldo zerado) não respeitam finais de semana.

Configs existentes com `sendDays` gravado não são tocadas.

---

### 4. Plan gate com admin override

#### Gate de plano

Planos que incluem Monitor Proativo: `pro`, `enterprise`, `profissional`, `corporativo`.

Planos sem acesso: `free`, `starter` (e qualquer outro).

**Experiência UX:**
- Se o plano não permite → banner amarelo informativo + todos os controles desabilitados + botão "Salvar" desativado
- Se o plano permite → interface normal

**Backend:**
- `GET /monitor/config` retorna `planAllowed: boolean`
- `PUT /monitor/config` com `enabled: true` → 403 se não autorizado

#### Admin override

Um **platform admin** pode desbloquear o Monitor para qualquer tenant pelo toggle visível apenas para eles na parte superior da página. Isso é útil para:
- Contas de demonstração
- Tenants em período de trial premium
- Clientes com negociação especial

**Endpoint:** `POST /monitor/config/override` — aceita `{ enabled: boolean }`, usa `x-acting-tenant-id` para identificar o tenant alvo. Exige que o JWT tenha `tenantId = null` (plataforma admin).

**Persistência:** Campo `monitor_override BOOLEAN DEFAULT false` na tabela `tenant_notification_configs`.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `prisma/schema.prisma` | Campo `monitorOverride` em `TenantNotificationConfig` |
| `prisma/migrations/20260704000000_monitor_override_plan_gate/migration.sql` | Nova coluna |
| `application/monitor/monitor.controller.ts` | `getConfig` com `planAllowed`, `updateConfig` com gate, `prefill`, `override` |
| `application/monitor/consolidation.service.ts` | Email dispatch per sector |
| `application/monitor/monitor.module.ts` | Import `EmailModule` |
| `application/email/email-reply.service.ts` | Novo método `sendAlertEmail()` |
| `application/email/email.module.ts` | Export `EmailReplyService` |
| `apps/frontend/src/pages/MonitorConfigPage.tsx` | E-mail field, auto-fill, ALL_DAYS, plan gate banner, admin override toggle |
| `docs/adr/032-monitor-dual-channel-plan-gate.md` | ADR desta feature |

---

## Comandos necessários

```bash
# Abel roda localmente (banco DO):
cd apps/backend && npx prisma migrate deploy

# Em produção (DO Console):
cd /root/nexa && docker compose -f docker-compose.production.yml exec backend sh -c \
  "npm install -g prisma@5.22.0 && prisma migrate deploy"
```
