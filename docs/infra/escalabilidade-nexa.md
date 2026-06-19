# Escalabilidade — Nexa

> Análise de gargalos e roadmap de infra por fases de crescimento.
> Referência: `escalabilidade-hipertms.md` (Design Master do TMS).
> Data: 2026-06-19

## Diagnóstico atual (0 tenants em produção)

| Componente | Gargalo identificado | Severidade |
|---|---|---|
| **Prisma** | Sem pool explícito configurado — usa padrão do driver (10 conexões). Em carga alta com múltiplos tenants, esgota conexões do PostgreSQL. | 🔴 Crítico |
| **Socket.io** | Sem Redis adapter — impede escala horizontal (múltiplas instâncias do backend). Inbox em tempo real só funciona com 1 réplica. | 🔴 Crítico |
| **WAHA** | 1 instância suporta N sessões, mas cada sessão WhatsApp é stateful. Em escala, precisa de sharding de sessões por instância WAHA. | 🟠 Importante |
| **SenderService** | `tick()` do cron de campanhas roda no event loop do NestJS — pode bloquear outros handlers em carga alta. | 🟠 Importante |
| **Anthropic API** | Rate limits por organização, não por tenant. Em carga alta, tenants concorrem pelo mesmo rate limit. | 🟡 Médio |
| **PostgreSQL** | Dimensionado para dev (512MB RAM, DO Basic). Sem connection pooler (PgBouncer) externo. | 🟡 Médio |
| **Redis** | Usado só para rate limiting. Em escala, precisará suportar Socket.io pub/sub + cache de sessão. | 🟢 Baixo agora |

## Roadmap por fase

### Fase 0 → Fase 1 (0–5 tenants) — ações imediatas no deploy

| Ação | Esforço | Impacto |
|---|---|---|
| Configurar `DATABASE_URL` com `connection_limit=20` no Prisma | Baixo | Alto |
| Habilitar Redis adapter no Socket.io (`@socket.io/redis-adapter`) | Médio | Alto |
| Mover `SenderService.tick()` para uma fila Bull/BullMQ (Redis) | Médio | Médio |
| Droplet DO: mínimo 2 vCPU / 4 GB RAM para NestJS + PostgreSQL | Baixo | Médio |
| Backup automático PostgreSQL (DO Managed DB ou script diário) | Baixo | Alto |

### Fase 1 → Fase 2 (5–50 tenants)

| Ação | Esforço | Impacto |
|---|---|---|
| Migrar para DO Managed PostgreSQL (connection pooler incluso) | Médio | Alto |
| Separar WAHA por grupo de tenants (sharding de sessões) | Alto | Alto |
| Adicionar cache Redis para KB queries (evitar RAG query por mensagem) | Médio | Médio |
| Horizontal scaling do backend (2 réplicas NestJS) — depende do Redis adapter | Alto | Alto |
| Monitoramento: Sentry errors + métricas de latência (p50/p95 por endpoint) | Médio | Médio |

Custo estimado a 50 tenants (DO): ~$120–180/mês
(2× Droplet 2vCPU/4GB + Managed PG Basic + Redis + WAHA)

### Fase 2 → Fase 3 (50–200 tenants)

| Ação | Esforço |
|---|---|
| Rate limiting por tenant na Anthropic (tenant-aware throttle interno) | Médio |
| Separar SenderService em worker dedicado (processo Node separado ou container) | Alto |
| DO Managed PostgreSQL Standard (mais conexões, backups automáticos) | Baixo |
| Load balancer na frente dos backends (DO Load Balancer) | Baixo |
| pgvector: embeddings para KB (melhora RAG, reduz tokens Anthropic) | Alto |

Custo estimado a 200 tenants (DO): ~$350–500/mês

## Gargalo específico: WAHA

O WAHA auto-hosted tem limites práticos por sessão e por servidor:

- **Engine WEBJS**: ~20–30 sessões por instância (1 vCPU/2GB) antes de degradar
- **Engine NOWEB**: mais eficiente, ~50–80 sessões, menor memória por sessão
- **Recomendação para escala**: migrar para NOWEB + múltiplas instâncias WAHA com
  roteamento por tenant (ex.: tenant A–M → WAHA-1, N–Z → WAHA-2)

## Gargalo específico: Socket.io sem Redis adapter

O inbox em tempo real usa Socket.io diretamente no processo NestJS. Sem o Redis
adapter (`@socket.io/redis-adapter`), ao escalar para 2+ réplicas do backend,
um cliente conectado na réplica 1 não recebe eventos emitidos pela réplica 2.

**Ação imediata antes de subir 2ª réplica**:
```ts
// app.module.ts / main.ts
import { createAdapter } from '@socket.io/redis-adapter';
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

## Relacionados

- `docs/infra/deploy.md` · `docs/infra/deploy-runbook.md`
- `docs/ANALISE_HIPERTMS_GAPS.md` §5 (referência do TMS)
- `docs/adr/013-environment-strategy.md`
