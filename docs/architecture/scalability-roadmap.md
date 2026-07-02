# Roadmap de Escalabilidade — Nexa

**Status:** Backlog técnico  
**Data:** 2026-07-02  
**Contexto:** avaliação da arquitetura atual para suportar crescimento do base de clientes TMS.

---

## Estado atual

Capacidade confortável estimada: **~200 clientes TMS ativos**.  
Infraestrutura: 1 droplet DigitalOcean, PostgreSQL gerenciado, Redis single instance, WAHA.

---

## Problemas identificados

### 🔴 Críticos (travam escala horizontal)

**1. Estado in-memory em múltiplos serviços**

Três Maps vivem na memória do processo Node.js:

| Serviço | Map | Problema ao escalar |
|---|---|---|
| `ConsolidationService` | `sentThisHour` | 2 instâncias → envia WA duplicado |
| `WhatsappService` | `lastProcessed` | Rate limit não funciona em cluster |
| `ConversationJanitorService` | `slaAlerted` | Dedup de SLA quebra em cluster |

**Fix:** migrar os 3 Maps para Redis com TTL.  
```typescript
// antes
private sentThisHour = new Map<string, number>();

// depois
await this.redis.set(`sent:${tenantId}:${slotKey}`, '1', 'EX', 300);
const alreadySent = await this.redis.exists(`sent:${tenantId}:${slotKey}`);
```

**2. `ConsolidationService` com `@Interval` — duplica em cluster**

`@Interval` do NestJS dispara em CADA instância. Com 2+ pods, cada cliente recebe N mensagens.

**Fix:** usar BullMQ com `repeatJobKey` único — apenas 1 worker processa por slot.
```typescript
// trocar @Interval por job recorrente BullMQ
await this.queue.add('consolidate', {}, {
  repeat: { every: 5 * 60 * 1000 },
  jobId: 'consolidation-global', // garante 1 só
});
```

**3. Envio WA síncrono — sem fila**

Hoje o `waha.sendText()` é chamado direto no handler HTTP. Com muitos clientes simultâneos, o processo Node trava aguardando WAHA responder.

**Fix:** publicar na fila BullMQ, worker consome com concorrência controlada.
```typescript
// handler apenas enfileira
await this.waQueue.add('send', { phone, message });

// worker processa com rate limit
@Process('send')
async handleSend(job: Job) {
  await this.waha.sendText(job.data.phone, job.data.message);
}
```

---

### 🟡 Atenção (aguenta hoje, problema com crescimento)

**4. Droplet único — sem redundância**

Single point of failure. Se o droplet cair, tudo para.

**Fix (curto prazo):** health check + restart automático via DO monitoring.  
**Fix (médio prazo):** mover para DO App Platform ou Kubernetes com 2+ réplicas. Só viável após resolver item 1 e 2.

**5. PostgreSQL sem read replica**

Leituras de relatório e dashboards vão brigar com escritas de conversa em tempo real.

**Fix:** adicionar read replica no DO Managed PostgreSQL. Prisma suporta datasource separado para leituras.

**6. WAHA — cliente não-oficial**

Risco de ban a qualquer momento. Sessão única — se cair, nenhum cliente recebe WA.

**Fix:** migrar para Meta Cloud API (oficial). Já planejado — ver PRD de custos.  
Benefício adicional: suporta múltiplos números / rate limit aumentado.

**7. Frontend sem CDN**

Assets servidos direto do container Nginx. Com muitos usuários simultâneos, aumenta carga no droplet.

**Fix:** CloudFlare na frente (gratuito). Cacheia assets estáticos, absorve picos.

---

### 🟢 Já bem resolvido (não precisa de ação)

- PostgreSQL gerenciado (DO) — escala storage/CPU independente
- Redis disponível — base para filas já existe
- BullMQ já no projeto (TMS usa, Nexa tem dependência)
- Rate limiting global (Throttler 100 req/min/IP)
- Structured logging com correlationId — facilita debug em cluster
- CI/CD automatizado — deploy sem downtime viável
- Prisma connection pooling — evita connection storm

---

## Plano de execução sugerido

### Fase A — Sem downtime, sem mudança de infra (~2 sprints)
1. Migrar `sentThisHour` → Redis
2. Migrar `lastProcessed` → Redis  
3. Migrar `slaAlerted` → Redis
4. Mover ConsolidationService para BullMQ job recorrente
5. Mover envio WA para fila BullMQ com concorrência = 5

**Resultado:** Nexa já suporta múltiplas instâncias sem duplicação.

### Fase B — Infraestrutura (~1 sprint)
6. CloudFlare na frente do frontend
7. Health check + auto-restart DO monitoring
8. Read replica PostgreSQL (quando > 500 clientes)

### Fase C — Canal oficial (~1 sprint, coordenado com PRD Monitor Multi-tenant)
9. Migrar WAHA → Meta Cloud API
10. Rate limit de envio por número (respeitar limites Meta)

### Fase D — Cluster (~quando > 1.000 clientes)
11. 2ª instância backend (load balancer DO)
12. Avaliar DO App Platform vs K8s

---

## Gatilhos para agir

| Métrica | Valor atual | Agir quando |
|---|---|---|
| Clientes TMS ativos | ~10 | > 200 → Fase A |
| Mensagens WA/dia | ~50 | > 2.000 → Fase A+B |
| CPU droplet | < 10% | > 60% sustained → Fase D |
| Response time p95 | < 100ms | > 500ms → Fase B+D |
| Erros WAHA/semana | 0 | > 5 → Fase C |

---

## Análise de custo por escala

> **Taxas reais BRL verificadas em 01/07/2026** (fonte: business.whatsapp.com — dia em que BRL billing entrou em vigor no Brasil):
>
> | Categoria Meta | Custo/mensagem | Uso no Nexa |
> |---|---|---|
> | **Utility** | **R$0,0350** | Resumo diário Monitor Proativo (fora de CSW) |
> | Marketing | R$0,3217 | Não usado |
> | Service | R$0,0000 | Conversas da Lia (resposta a usuário) — GRÁTIS |
>
> **Regra importante:** template Utility enviado DENTRO de janela de atendimento aberta (CSW) = **R$0,00**.
> Clientes que conversaram com a Lia hoje recebem o resumo do dia de graça.
>
> ⚠️ Estimativa anterior de R$0,20/mensagem estava 9× errada (era preço antigo por conversa, modelo descontinuado em 01/07/2025).

### Custo variável — WhatsApp (Meta Cloud API, tarifa Utility BRL)

Premissa conservadora: 1 resumo diário/cliente, todos fora de CSW (pior caso).

| Clientes ativos | Mensagens/mês | Custo (R$0,035) | **Custo líquido WA** |
|---|---|---|---|
| 50 | 1.500 | **R$52/mês** |
| 100 | 3.000 | **R$105/mês** |
| 500 | 15.000 | **R$525/mês** |
| 1.000 | 30.000 | **R$1.050/mês** |
| 5.000 | 150.000 | **R$5.250/mês** |

> Com WAHA (atual): custo WA = R$0. Só infraestrutura.

---

### Custo fixo — Infraestrutura (DigitalOcean)

| Fase | Componentes | Custo estimado/mês |
|---|---|---|
| Atual (< 200 clientes) | Droplet $24 + PG $15 + Redis $15 | **R$270** |
| Fase B (200–500) | Droplet $48 + PG $25 + Redis $15 + CF grátis | **R$440** |
| Fase D (500–2.000) | 2× Droplet $48 + PG $50 + Redis $25 + LB $12 | **R$925** |
| Escala (2.000–5.000) | 4× Droplet $48 + PG $100 + Redis $50 + LB $12 | **R$1.560** |

---

### Custo total por cliente (WA + infra) — valores corrigidos

| Clientes | Custo WA | Custo infra | **Total/mês** | **Custo por cliente** |
|---|---|---|---|---|
| 50 | R$52 | R$270 | R$322 | R$6,44 |
| 100 | R$105 | R$270 | R$375 | R$3,75 |
| 500 | R$525 | R$440 | R$965 | **R$1,93** |
| 1.000 | R$1.050 | R$925 | R$1.975 | **R$1,98** |
| 5.000 | R$5.250 | R$1.560 | R$6.810 | **R$1,36** |

> O custo real cai de R$6,50 (estimativa antiga) para **R$1,36–R$6,44/cliente/mês**.
> Acima de 100 clientes, fica abaixo de R$4 — margem muito superior ao esperado.

---

### Precificação sugerida ao cliente

O Monitor Proativo pode ser cobrado como **add-on do plano TMS** ou embutido no plano.

| Modelo | Preço sugerido | Margem (100 clientes) | Margem (1.000 clientes) |
|---|---|---|---|
| Acessível | R$9/cliente/mês | ~58% | ~78% |
| Recomendado | R$19/cliente/mês | ~80% | ~90% |
| Premium | R$29/cliente/mês | ~87% | ~93% |

> Recomendado: **R$19/cliente/mês** — custo real é ~R$2–4, margem de 80–90%, posicionamento acessível.

**Exemplo com 500 clientes pagando R$19/mês:**
- Receita: R$9.500/mês
- Custo total: R$965/mês
- **Lucro: R$8.535/mês (~90% de margem)**

---

### Fase WAHA vs Meta API — impacto no custo (valores corrigidos)

| | WAHA (agora) | Meta Cloud API |
|---|---|---|
| Custo WA/cliente/mês | R$0 | **~R$1,05** (pior caso) |
| Risco | Alto (ban = zero receita) | Nenhum |
| Limite | ~200 clientes | Ilimitado |
| Receita que justifica migração | — | A partir de **~20 clientes pagantes** |

> Com 20 clientes pagando R$19/mês = R$380 receita. Custo Meta: ~R$21. Migração se paga desde o início.
