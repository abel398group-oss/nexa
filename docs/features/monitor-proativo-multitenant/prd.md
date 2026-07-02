# PRD — Monitor Proativo Multi-Tenant (Auto-Provisionamento)

**Status:** Draft  
**Autor:** Nexa PM  
**Data:** 2026-07-02  
**Fase:** 4

---

## Problema

O Monitor Proativo atual funciona apenas para o tenant Hipervias (mapeado manualmente via env var). Todos os outros clientes do TMS — Ribeiro Ogawa, Demo, e qualquer novo cliente que se cadastrar — têm seus alertas descartados com "não mapeado". O cliente precisa de nenhuma configuração: se está no TMS, deve receber os alertas automaticamente.

---

## Objetivo

Qualquer cliente cadastrado no TMS passa a receber alertas de proatividade via WhatsApp automaticamente, sem nenhuma configuração manual no Nexa. O número de destino é gerenciado no TMS. Se o cliente mudar o telefone no TMS, na próxima rodada do cron (≤ 1h) a mudança já está em vigor.

---

## Como funciona hoje (baseline)

```
TMS cron (1x/h)
  └─► POST /monitor/ingest { tmsTenantId, events[{ adminPhone, ... }] }
        └─► MonitorService.ingestFromTms()
              ├─ se tmsTenantId mapeado → salva alertas → envia WA (só novos)
              └─ se NÃO mapeado → DESCARTA (warn log) ← problema
```

O `ConsolidationService` (resumo diário) só roda para tenants Nexa cadastrados, lendo `TenantNotificationConfig.notificationPhone`.

---

## Como vai funcionar (target)

```
TMS cron (1x/h)
  └─► POST /monitor/ingest { tmsTenantId, events[{ adminPhone, adminName, companyName, ... }] }
        └─► MonitorService.ingestFromTms()
              ├─ se mapeado → fluxo atual (tenant Nexa)
              └─ se NÃO mapeado → aceita, salva alertas com adminPhone no registro
                    └─► envia WA imediato para adminPhone (eventos novos)

ConsolidationService (a cada 5min, no horário configurado)
  └─► agrupa alert_states abertos por adminPhone (independente de tenant Nexa)
        └─► envia resumo diário para cada adminPhone único
```

O telefone vem do TMS, não de config manual no Nexa.

---

## Mudança de telefone

1. Admin do cliente altera "Telefone para alertas" no TMS (campo novo na tela de empresa)
2. Próximo push do cron: eventos chegam com novo `adminPhone`
3. Nexa faz upsert nos `alert_states` atualizando `adminPhone` no registro
4. ConsolidationService usa o `adminPhone` atual dos alertas → envia para novo número
5. **Tempo máximo para mudança refletir: ≤ 1 hora** (próximo cron TMS)

---

## Histórias de usuário

### H1 — Recebimento automático (must have)
**Como** admin de uma transportadora cadastrada no TMS  
**Quero** receber alertas de proatividade no WhatsApp sem precisar configurar nada no Nexa  
**Para** ser avisado sobre embarques atrasados, manutenções vencendo e documentos fiscais pendentes

**Critérios de aceite:**
- [ ] Novo cliente cadastrado no TMS recebe WA na primeira rodada do cron (≤ 1h após cadastro)
- [ ] Não é necessário criar tenant no Nexa nem configurar env vars
- [ ] Alertas de clientes sem tenant Nexa não aparecem mais como "warn: não mapeado" nos logs

### H2 — Configurar telefone no TMS (must have)
**Como** admin de uma transportadora  
**Quero** definir no TMS qual número recebe os alertas de proatividade  
**Para** direcionar para o WhatsApp correto (meu pessoal, não o número da empresa)

**Critérios de aceite:**
- [ ] Campo "Telefone para alertas" disponível nas configurações da empresa no TMS
- [ ] Campo aceita formato com ou sem DDI (sistema normaliza para E.164)
- [ ] Se campo vazio, usa o telefone do admin principal da conta

### H3 — Mudança de telefone sem reconfiguração (must have)
**Como** admin de uma transportadora  
**Quero** alterar o telefone de destino dos alertas no TMS  
**Para** não precisar acessar o Nexa para fazer essa mudança

**Critérios de aceite:**
- [ ] Após alterar no TMS, próximo cron (≤ 1h) já usa o número novo
- [ ] Alertas anteriores no banco são atualizados com o novo phone no próximo push
- [ ] Não há duplicidade (alerta não vai para o número antigo após a mudança)

### H4 — Resumo diário por cliente (should have)
**Como** admin de uma transportadora  
**Quero** receber um resumo diário consolidado com todos os meus alertas abertos  
**Para** ter visão geral do que precisa de atenção sem ser bombardeado de mensagens

**Critérios de aceite:**
- [ ] ConsolidationService agrupa alertas por `adminPhone` (não por tenant Nexa)
- [ ] Horário do resumo: padrão 7h BRT, configurável no TMS (campo "Horário do resumo")
- [ ] Se não houver alertas abertos, não envia mensagem

### H5 — Override de horário por cliente (could have)
**Como** admin de uma transportadora  
**Quero** escolher o horário do resumo diário (ex: 8h em vez de 7h)  
**Para** receber no início do meu expediente, não antes

**Critérios de aceite:**
- [ ] Campo "Horário do resumo" nas configurações da empresa no TMS
- [ ] TMS envia `preferredSendHour` no payload do push
- [ ] Nexa respeita o horário por `adminPhone/tmsTenantId`

---

## Escopo técnico

### Nexa — Backend

**1. `AlertState` — adicionar coluna `admin_phone`**
```prisma
model AlertState {
  // ... campos existentes
  adminPhone   String?   // phone do admin do sub-cliente (E.164 sem +)
  adminName    String?
  companyName  String?
}
```
Migration: `ALTER TABLE alert_states ADD COLUMN admin_phone VARCHAR(20)`.

**2. `MonitorService.ingestFromTms()` — aceitar tenants não mapeados**
```typescript
// Antes: descartava se !tenant
// Depois: usa tmsTenantId como chave "virtual" e salva com adminPhone do evento
const tenantKey = tenant?.id ?? `tms::${tmsTenantId}`;
```
- Salva alertas com `tenantId = 'tms::' + tmsTenantId` (ou tenant Nexa se mapeado)
- Atualiza `adminPhone`, `adminName`, `companyName` no upsert

**3. `ConsolidationService` — agrupar por adminPhone**
```typescript
// Busca todos alert_states abertos com adminPhone preenchido
// Agrupa por adminPhone → monta mensagem → envia
```
- Remove dependência de `TenantNotificationConfig` para clientes não-Nexa
- Mantém `TenantNotificationConfig` como override para tenants Nexa

**4. `WahaNotificationChannel` — sem mudança**
Já usa `normalizePhone()` → compatível.

### TMS — Backend + Frontend

**5. `Company` model — campo `alertPhone` e `alertSendHour`**
```typescript
alertPhone?: string    // telefone destino dos alertas
alertSendHour?: number // 0-23, horário BRT do resumo diário
```

**6. `ProactivityService.notifyNexa()` — usar `alertPhone` no payload**
```typescript
adminPhone: company.alertPhone ?? company.adminPhone
```

**7. Frontend TMS — tela de configurações da empresa**
- Campo "Telefone para alertas (WhatsApp)" com placeholder `55119...`
- Campo "Horário do resumo diário" (select 0-23h)
- Seção "Notificações Proativas" nas settings da empresa

---

## Fora do escopo (v1)

- Opt-out por cliente (cancelar alertas via WA) — Fase 5
- Canal email por cliente — Fase 5
- Painel Nexa por cliente não-Nexa — Fase 5
- Histórico de notificações por cliente — Fase 5

---

## Dependências

| Item | Responsável | Prazo |
|---|---|---|
| Campo `alertPhone` no TMS | Squad TMS | antes do Nexa |
| Migration `admin_phone` no Nexa | Squad Nexa | paralelo |
| Ajuste `ingestFromTms` | Squad Nexa | após migration |
| Ajuste `ConsolidationService` | Squad Nexa | após migration |
| Frontend TMS (settings) | Squad TMS frontend | paralelo |

---

## Critério de done (feature completa)

1. Cliente novo cadastrado no TMS → em até 1h recebe WA de alerta sem nenhuma config no Nexa ✅
2. Admin altera telefone no TMS → em até 1h alertas vão para novo número ✅
3. Zero warnings "não mapeado" nos logs do Nexa para tenants TMS válidos ✅
4. Resumo diário chega no horário configurado no TMS ✅
