# Monitor Proativo TMS — Índice de Implementação

> **Status:** Arquitetura revisada após auditoria TMS (2026-06-20)  
> **Referência:** `docs/product/monitor-proativo.md`

---

## Descoberta importante — TMS já tem o motor

A auditoria do TMS revelou que **a detecção de eventos já existe**:

- Módulo `proactivity` com `PendingEventsPanel.tsx` — severidades CRITICAL, OVERDUE, DUE_SOON, INFO
- 6 cron jobs de digest prontos (`billing-dunning`, `digest`, `proactivity` schedulers)
- Todos os cron jobs estão **opt-in desligados por padrão** — só precisam de env vars

A página nativa no TMS (`PendingEventsPanel`) já existe. Não precisa ser construída do zero.

---

## Arquitetura real (revisada)

```
TMS — proactivity module (já detecta e classifica eventos)
  └── expõe GET /proactivity/events?tenantId=xxx (novo endpoint simples)
        ↓
Nexa — MonitorService (consome eventos do TMS)
  └── ConsolidationService → 1 resumo por tenant/dia
        ↓
  NotificationService → WAHA (WhatsApp) ou SMTP (e-mail)
```

**O Nexa NÃO recria a lógica de detecção** — ela já existe no TMS. O Nexa só lê, consolida e envia.

---

## O que cada squad faz agora

| Squad | Arquivo | Responsabilidade real |
|-------|---------|----------------------|
| Orquestra TMS | `squad-orquestra-tms.md` | 1 endpoint para expor eventos + ativar cron jobs no .env |
| Orquestra Nexa | `squad-orquestra-nexa.md` | Consumir API do TMS, consolidar e enviar via WhatsApp/e-mail |
| Orquestra Nexa IA | `squad-orquestra-nexa-ia.md` | Intents on-demand da Lia (sem alteração) |

---

## Ordem de execução

1. **Orquestra TMS** ativa os cron jobs no `.env` de produção (imediato, zero código)
2. **Orquestra TMS** cria o endpoint `GET /proactivity/events`
3. **Orquestra Nexa** implementa consumo, consolidação e envio
4. Teste com 1 tenant piloto
