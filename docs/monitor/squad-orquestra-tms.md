# Monitor Proativo — Orquestra TMS

> **Para:** Agente Orquestra TMS (backend + frontend)  
> **Repo:** `github.com/hipervias/hipertms_v12`  
> **Prioridade:** Entregar os endpoints de leitura primeiro — o Nexa depende deles

---

## Parte 1 — Endpoints de leitura para o Nexa monitorar

O Nexa vai chamar esses endpoints a cada 30 minutos, autenticado via token de serviço.  
Todos são `GET`, somente leitura, sem side effects no TMS.

### Autenticação

Criar um `SERVICE_TOKEN` fixo nas variáveis de ambiente do TMS.  
O Nexa envia `Authorization: Bearer <SERVICE_TOKEN>` em cada chamada.  
Criar guard `ServiceTokenGuard` que valida esse token.

---

### 1.1 Endpoints Fiscais

```
GET /monitor/fiscal/cte-pendentes?tenantId=xxx
```
Retorna CT-es emitidos há mais de 2h sem retorno do SEFAZ.

```json
[
  { "id": "cte_123", "numero": "4521", "nfNumero": "1234", "emitidoEm": "2024-01-15T10:00:00Z" }
]
```

```
GET /monitor/fiscal/cte-rejeitados?tenantId=xxx
```
Retorna CT-es com status de rejeição SEFAZ nas últimas 24h.

```
GET /monitor/fiscal/mdfe-abertos?tenantId=xxx
```
Retorna MDF-es com status aberto cuja viagem foi encerrada há mais de 12h.

---

### 1.2 Endpoints Logística

```
GET /monitor/logistic/atrasados?tenantId=xxx
```
Retorna embarques cuja `dataEntregaPrevista < hoje` e status não é entregue/cancelado.

```json
[
  { "id": "emb_892", "numero": "EMB-0892", "destino": "Campinas", "dataEntregaPrevista": "2024-01-14", "motorista": "Pedro" }
]
```

```
GET /monitor/logistic/sem-motorista?tenantId=xxx
```
Retorna embarques com partida em menos de 24h sem motorista ou veículo vinculado.

```
GET /monitor/logistic/viagens-abertas?tenantId=xxx
```
Retorna viagens com status iniciado há mais de 5 dias sem encerramento.

---

### 1.3 Endpoints Frota

```
GET /monitor/frota/cnh-vencendo?tenantId=xxx&dias=30
```
Retorna motoristas com CNH vencendo em até `dias` dias.

```json
[
  { "id": "mot_45", "nome": "Carlos Ferreira", "cnh": "12345678900", "vencimento": "2024-01-22" }
]
```

```
GET /monitor/frota/crlv-vencendo?tenantId=xxx&dias=30
```
Retorna veículos com CRLV/licenciamento vencendo em até `dias` dias.

```
GET /monitor/frota/manutencao-proxima?tenantId=xxx
```
Retorna veículos com manutenção preventiva prevista nos próximos 500km ou 7 dias.

```
GET /monitor/frota/seguro-vencendo?tenantId=xxx&dias=30
```
Retorna veículos com seguro vencendo em até `dias` dias.

---

### 1.4 Endpoints Financeiro

```
GET /monitor/finance/contas-vencendo?tenantId=xxx
```
Retorna contas a pagar com vencimento = amanhã.

```json
[
  { "id": "cp_201", "descricao": "Fornecedor X", "valor": 1500.00, "vencimento": "2024-01-16" }
]
```

```
GET /monitor/finance/contas-vencidas?tenantId=xxx
```
Retorna contas a pagar vencidas e ainda em aberto.

```
GET /monitor/finance/faturas-vencidas?tenantId=xxx
```
Retorna faturas de clientes vencidas e não pagas.

---

---

## Parte 2 — Receptor de alertas do Nexa

O Nexa vai empurrar alertas consolidados para o TMS exibir na página nativa.

### Endpoint receptor

```
POST /monitor/alerts
Authorization: Bearer <SERVICE_TOKEN>
```

Body:
```json
{
  "tenantId": "tenant_abc",
  "alerts": [
    {
      "id": "alert_nexa_123",
      "category": "fiscal",
      "type": "cte_sem_sefaz",
      "severity": "critical",
      "externalId": "cte_123",
      "title": "CT-e sem retorno SEFAZ",
      "description": "NFs 4.521 e 4.522 emitidas há 4h sem autorização",
      "detectedAt": "2024-01-15T07:00:00Z",
      "status": "open"
    }
  ]
}
```

O TMS deve salvar esses alertas em uma tabela local (`monitor_alerts`) para exibir na página nativa.

### Tabela local no TMS (migration)

```sql
CREATE TABLE monitor_alerts (
  id            VARCHAR PRIMARY KEY,   -- id vindo do Nexa
  tenant_id     VARCHAR NOT NULL,
  category      VARCHAR NOT NULL,
  type          VARCHAR NOT NULL,
  severity      VARCHAR NOT NULL,      -- critical | urgent | info
  external_id   VARCHAR,
  title         VARCHAR NOT NULL,
  description   TEXT,
  status        VARCHAR DEFAULT 'open',
  detected_at   TIMESTAMP,
  resolved_at   TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
```

---

## Parte 3 — Página nativa no TMS

Criar página em `apps/web/src/pages/monitor/MonitorPage.tsx` (ou equivalente no FSD do TMS).

**Rota:** `/monitor` no menu lateral  
**Acesso:** apenas admin e gestores do tenant

### Layout da página

**Header:**
- Título "Pendências e Alertas"
- Badge com total de alertas abertos
- Botão "Atualizar"

**Filtros:**
- Categoria: Todos / Fiscal / Logística / Frota / Financeiro
- Severidade: Todos / Crítico / Urgente / Informativo
- Status: Abertos / Resolvidos

**Lista de alertas — card por item:**
- Ícone da categoria
- Título + descrição
- Badge de severidade (vermelho/amarelo/cinza)
- Data de detecção
- Botão "Marcar como resolvido" → chama `POST /monitor/alerts/:id/resolve` no Nexa

**Resumo no topo (4 cards):**
- Total críticos
- Total urgentes
- Total informativos
- Resolvidos hoje

---

## Checklist de entrega

**Parte 1 — Endpoints de leitura (entregar primeiro)**
- [ ] `ServiceTokenGuard` para autenticar chamadas do Nexa
- [ ] Endpoints fiscais (3 rotas)
- [ ] Endpoints logística (3 rotas)
- [ ] Endpoints frota (4 rotas)
- [ ] Endpoints financeiro (3 rotas)
- [ ] Variável de ambiente: `NEXA_SERVICE_TOKEN`

**Parte 2 — Receptor de alertas**
- [ ] Migration `monitor_alerts` no banco do TMS
- [ ] `POST /monitor/alerts` receptor com upsert por `id`

**Parte 3 — Página nativa**
- [ ] Página `MonitorPage` com lista, filtros e cards de resumo
- [ ] Botão "Marcar como resolvido" integrado ao Nexa
- [ ] Link no menu lateral do TMS
