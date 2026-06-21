# Monitor Proativo — Orquestra TMS

> **Para:** Agente Orquestra TMS (backend + frontend)  
> **Repo:** `github.com/hipervias/hipertms_v12`  
> **Descoberta:** o motor de proatividade já existe — trabalho muito menor que o planejado

---

## Contexto

A auditoria revelou que o TMS já tem:
- Módulo `proactivity` com detecção de eventos por severidade (CRITICAL, OVERDUE, DUE_SOON, INFO)
- `PendingEventsPanel.tsx` — tela nativa de pendências embutida nos hubs de área
- 6 cron jobs de digest prontos, todos opt-in desligados por env var

---

## Parte 1 — Ativar cron jobs em produção (zero código, fazer agora)

Adicionar ao `.env` de produção no Droplet:

```env
# Digest diário — embarques entregues sem fatura (seg-sex 07h10)
UNINVOICED_CRON_ENABLED=true

# Painel diário de embarques (seg-sex 07h05)
SHIPMENT_PANEL_CRON_ENABLED=true

# Cotações próximas do vencimento (seg-sex 07h30)
EXPIRING_QUOTES_CRON_ENABLED=true

# Funil de cotações semanal (seg 08h00)
QUOTE_FUNNEL_CRON_ENABLED=true

# Posição financeira semanal (seg 08h10)
WEEKLY_FINANCE_CRON_ENABLED=true

# Disponibilidade de frota (seg-sex 07h07)
FLEET_PANEL_CRON_ENABLED=true

# Motor de proatividade — reavalia eventos pendentes de todos os tenants
PROACTIVITY_CRON_ENABLED=true
```

Reiniciar o container após adicionar. Os jobs começam a rodar imediatamente.

---

## Parte 2 — Expor eventos do proactivity para o Nexa (1 endpoint novo)

O Nexa precisa ler os eventos que o módulo `proactivity` já detecta.

### Endpoint a criar

```
GET /proactivity/events?tenantId=xxx&status=pending
Authorization: Bearer <SERVICE_TOKEN>
```

**Resposta:**
```json
[
  {
    "id": "evt_123",
    "tenantId": "tenant_abc",
    "category": "fiscal",
    "type": "uninvoiced_shipment",
    "severity": "CRITICAL",
    "title": "Embarque entregue sem fatura",
    "description": "EMB-0892 entregue há 3 dias sem CT-e vinculado",
    "externalId": "emb_892",
    "detectedAt": "2024-01-15T07:00:00Z"
  }
]
```

**Implementação:** criar action/endpoint no controller do módulo `proactivity` existente que retorna os eventos ativos por tenant. Autenticar com `ServiceTokenGuard` (mesmo padrão usado em outras integrações).

### Endpoint de resolução (para o Nexa fechar alertas)

```
PATCH /proactivity/events/:id/resolve
Authorization: Bearer <SERVICE_TOKEN>
```

---

## Parte 3 — Página nativa (já existe, apenas verificar)

`PendingEventsPanel.tsx` já existe e está embutido nos hubs de área.

**Verificar apenas:**
- Se está visível e funcional no hub principal (dashboard)
- Se exibe as severidades corretamente (CRITICAL primeiro)
- Se tem ação de "marcar como resolvido"

Não construir nada novo — ajustar apenas se tiver bug visual.

---

## Checklist de entrega

- [ ] Ativar 7 env vars de cron no `.env` de produção e reiniciar
- [ ] Criar `GET /proactivity/events` com `ServiceTokenGuard`
- [ ] Criar `PATCH /proactivity/events/:id/resolve` com `ServiceTokenGuard`
- [ ] Adicionar `NEXA_SERVICE_TOKEN` ao `.env` de produção
- [ ] Verificar `PendingEventsPanel` no hub principal — ajustar só se necessário
