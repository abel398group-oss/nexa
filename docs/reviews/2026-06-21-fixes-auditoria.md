# Guia de Correções — Auditoria 2026-06-21

> **Revisão pós-implementação — 2026-06-21**
> Squad implementou 7 dos 8 fixes ALTOS. Resultado da revisão adversarial:
>
> | Finding | Status |
> |---------|--------|
> | SEC-002 JWT fallback | ✅ Correto |
> | SEC-003 Portal JWT audience | ✅ Correto |
> | BUG-002 Webhook lock Redis | ✅ Correto |
> | BUG-006 WAHA timeouts | ✅ Correto |
> | PERF-001 N+1 campanhas | ✅ Correto — ver verificação de campo no frontend abaixo |
> | PERF-002 listTags SQL | ✅ Correto |
> | BUG-004 fromStatus janitor | ⚠️ Parcial — ver pendência abaixo |
> | BUG-001 Sender Redis state | ❌ Não implementado — ver abaixo |
>
> **3 itens pendentes documentados no topo deste arquivo.**

> Squad: aplicar as correções na ordem CRÍTICO → ALTO → MÉDIO.
> Cada item tem: localização exata, o que está errado, e o código correto.
> **Não é preciso entender toda a auditoria — cada fix é autocontido.**
> Contexto completo: `docs/reviews/2026-06-21-auditoria-tecnica-completa.md`

---

---

## 🔴 PENDÊNCIAS PÓS-REVISÃO (implementar agora)

---

### BUG-001 — Sender anti-ban: estado ainda em memória de instância

**Arquivo:** `apps/backend/src/application/sender/sender.service.ts` — linhas 24-25

**Situação:** Fix não foi implementado. As linhas abaixo ainda estão presentes:
```typescript
private lastSentAt = 0;
private nextDelayMs = DELAY_MIN_MS;
```
O construtor não injeta Redis. O `tick()` ainda lê/escreve `this.lastSentAt` diretamente.
Com 2 instâncias, os dois processos podem enviar ao mesmo número simultâneo — risco de ban.

**Fix — 3 passos:**

**Passo 1:** Injetar `ioredis` no construtor (já está no projeto via `WebhookService`):
```typescript
import { Redis } from 'ioredis';

// Adicionar no construtor:
private redis: Redis | null = null;

constructor(
  private readonly prisma: PrismaService,
  // ...demais injeções existentes
) {
  const url = process.env.REDIS_URL;
  if (url) this.redis = new Redis(url, { lazyConnect: true });
}
```

**Passo 2:** Substituir a checagem de delay no `tick()`:
```typescript
// ANTES (linha ~370 do tick):
if (Date.now() - this.lastSentAt < this.nextDelayMs) return;

// DEPOIS:
const lastSentRaw = this.redis
  ? await this.redis.get(`sender:lastSentAt:${campaign.tenantId}`)
  : String(this.lastSentAt);
if (Date.now() - (Number(lastSentRaw) || 0) < this.nextDelayMs) return;
```

**Passo 3:** Substituir a gravação após envio bem-sucedido no `tick()`:
```typescript
// ANTES (após o envio bem-sucedido, ~linha ~530):
this.lastSentAt = Date.now();
this.nextDelayMs = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));

// DEPOIS:
const now = Date.now();
this.lastSentAt = now; // mantém local como fallback
if (this.redis) await this.redis.set(`sender:lastSentAt:${campaign.tenantId}`, String(now), 'EX', 300);
this.nextDelayMs = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
```

> `nextDelayMs` (o jitter 30-90s) pode continuar local — cada instância sorteia independentemente,
> o que é aceitável. Apenas o timestamp do último envio precisa ser compartilhado.

**Commit sugerido:** `fix(sender): share lastSentAt anti-ban state via Redis`

---

### BUG-004 (pendência) — `closeNoResponseSupport` ainda com `fromStatus` hardcoded

**Arquivo:** `apps/backend/src/application/conversations/conversation-janitor.service.ts` — método `closeNoResponseSupport()`, ~linha 155

**Situação:** `closeResolvedSupport` foi corrigido (usa `c.status` real). Mas `closeNoResponseSupport` ainda tem:
```typescript
data: ids.map((id: any) => ({
  fromStatus: 'open',  // ← HARDCODED — fecha também waiting_customer, mas registra 'open'
```
Esse método fecha conversas com status `'open'` **ou** `'waiting_customer'`. Para as `waiting_customer`, o histórico vai ficar errado.

**Fix — mesmo padrão do `closeResolvedSupport`:**

```typescript
// 1. Adicionar status ao select:
select: { id: true, status: true },  // era: select: { id: true }

// 2. Mudar o map para usar o status real:
// ANTES:
const ids = candidates.map((c: any) => c.id);
// ...
data: ids.map((id: any) => ({
  conversationId: id,
  fromStatus: 'open',

// DEPOIS:
// (manter candidates como está, já tem .status pelo select)
await this.prisma.$transaction([
  this.prisma.aiConversation.updateMany({
    where: { id: { in: candidates.map((c: any) => c.id) } },
    // ...igual ao atual
  }),
  this.prisma.conversationStageHistory.createMany({
    data: candidates.map((c: any) => ({  // iterar candidates, não ids
      conversationId: c.id,
      fromStatus: c.status,  // ← status real
      toStatus: 'closed',
      toOutcome: 'no_response',
      reason: `suporte_sem_resposta_${SUPPORT_INACTIVITY_HOURS}h`,
      changedAt: now,
    })),
  }),
]);
```

**Commit sugerido:** `fix(janitor): use real fromStatus in closeNoResponseSupport history`

---

### PERF-001 (verificação) — Campo `counts` vs `stats` no frontend

**Situação:** `listCampaigns()` foi corrigido e retorna `counts` (antes era `stats`). Verificar se o frontend
que consome esse endpoint já foi atualizado para ler `counts`.

**Onde verificar:**
```
apps/frontend/src/
```
Buscar por `stats` nos componentes de campanhas (ex.: `CampaignsList`, `CampaignCard`) e substituir por `counts` se necessário. O shape é o mesmo objeto `{ pending, queued, sending, sent, failed, skipped }`.

**Comando para encontrar rapidamente:**
```bash
grep -r "\.stats" apps/frontend/src --include="*.tsx" --include="*.ts" -l
```

---

## ⚠️ CRÍTICO

---

### SEC-001 — API key Anthropic no `.env`

> **Status:** ⏳ Pendente — Abel irá rotacionar ao final do ciclo de dev ativo.
> **Bloqueante para produção:** Sim.

**Quando Abel confirmar que está pronto:**
1. Acessar https://console.anthropic.com/account/keys
2. Revogar a key atual
3. Gerar nova key
4. Atualizar `.env` local e variável no servidor de produção (DigitalOcean Secrets)
5. Verificar que nunca foi commitada: `git log --all -p -- .env`

---

## 🔴 ALTOS

---

### SEC-002 — JWT secret com fallback fraco (2 arquivos)

**Problema:** Se `JWT_SECRET` não chegar ao processo, o app sobe com `'dev-secret-trocar'` — qualquer pessoa pode forjar tokens.

**Fix 1 — `apps/backend/src/application/auth/auth.module.ts`**

Substituir:
```typescript
JwtModule.register({
  secret: process.env.JWT_SECRET ?? 'dev-secret-trocar',
}),
```
Por:
```typescript
JwtModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    return { secret };
  },
  inject: [ConfigService],
}),
```
> Adicionar `ConfigModule` aos imports do `AuthModule` se não estiver.

**Fix 2 — `apps/backend/src/shared/auth/jwt.strategy.ts:17`**

Substituir:
```typescript
secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-trocar',
```
Por:
```typescript
secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
```
> `JwtStrategy` já recebe `ConfigService` via construtor? Se não, injetar:
```typescript
constructor(private config: ConfigService) {
  super({ jwtFromRequest: ..., secretOrKey: config.getOrThrow('JWT_SECRET') });
}
```

**Teste de regressão:** `POST /auth/login` com credenciais válidas deve retornar cookie. `POST /auth/me` com token válido deve retornar 200.

---

### SEC-003 — Portal JWT: `sign()` sem audience → portal quebrado

**Arquivo:** `apps/backend/src/application/portal/portal-session.service.ts`

**Problema:** `sign()` não define `audience: 'portal'`, mas `verify()` exige. Todo token gerado falha na verificação — portal do cliente inoperante.

**Fix:**
```typescript
async sign(c: PortalCustomer): Promise<string> {
  return this.jwt.signAsync(
    { sub: c.externalId, tenantId: c.tenantId, name: c.name },
    { audience: 'portal', expiresIn: '24h' }, // ← adicionar esta linha
  );
}
```
> O `verify()` já está correto — não mexer.

**Teste de regressão:** Gerar um token via `sign()`, passar para `verify()` → deve retornar o objeto `PortalCustomer` sem lançar exceção.

---

### BUG-001 — Estado anti-ban do sender em memória (multi-instância)

**Arquivo:** `apps/backend/src/application/sender/sender.service.ts`

**Problema:** `private lastSentAt = 0` e `private nextDelayMs` são estado de instância. Com 2+ processos, o controle de delay anti-ban não é compartilhado → números podem ser banados.

**Fix:** Substituir estado local por Redis. Exemplo mínimo:

```typescript
// Injetar Redis no construtor (já existe via ioredis no projeto)
constructor(
  private readonly prisma: PrismaService,
  @InjectRedis() private readonly redis: Redis, // ou via ConfigService
  // ...demais injeções
) {}

// Substituir a checagem de delay:
private async canSend(tenantId: string): Promise<boolean> {
  const key = `sender:lastSentAt:${tenantId}`;
  const last = await this.redis.get(key);
  const elapsed = Date.now() - (Number(last) || 0);
  return elapsed >= this.nextDelayMs;
}

private async recordSent(tenantId: string): Promise<void> {
  const key = `sender:lastSentAt:${tenantId}`;
  await this.redis.set(key, String(Date.now()), 'EX', 300);
}
```
> Nota: o cálculo de `nextDelayMs` (jitter) pode continuar local por instância — apenas o timestamp do último envio precisa ser compartilhado.

---

### BUG-002 — Retry de webhooks sem lock distribuído

**Arquivo:** `apps/backend/src/application/webhooks/webhook.service.ts`

**Problema:** `@Interval(60_000) retryPending()` roda em todas as instâncias simultaneamente → mesmo webhook entregue N vezes.

**Fix rápido (lock Redis):**
```typescript
@Interval(60_000)
async retryPending(): Promise<void> {
  // Adquirir lock por 55s (janela menor que o interval)
  const locked = await this.redis.set(
    'webhook:retry:lock', '1', 'NX', 'EX', 55
  );
  if (!locked) return; // outra instância já está processando

  try {
    const pending = await this.prisma.webhookDelivery.findMany({ /* ... */ });
    for (const d of pending) await this.deliver(d);
  } finally {
    await this.redis.del('webhook:retry:lock');
  }
}
```
> Fix definitivo (backlog): migrar para BullMQ conforme TODO já documentado no código.

---

### ARCH-001 — `ConversationAgentService` god object (492 linhas)

**Arquivo:** `apps/backend/src/application/agents/conversation-agent.service.ts`

**Problema:** Uma classe com 13 dependências faz handoff, TMS lookup, histórico, roteamento, geração de resposta, supervisão, envio, opt-out, criação de oportunidades, e notificações.

**Não é um fix de uma linha — é uma refatoração planejada.**
Criar ADR antes de iniciar. Divisão sugerida:

| Novo serviço | Responsabilidade |
|---|---|
| `ConversationContextService` | Carrega histórico + contexto anterior |
| `AgentOrchestrationService` | Decide rota (Router → Sales/Support/Diagnostic) |
| `PostMessageProcessingService` | Handoff, oportunidades, notificações pós-resposta |
| `ConversationAgentService` (restante) | Orquestrador de 30-50 linhas que chama os 3 acima |

**Pré-requisito para escalar:** escrever testes unitários antes de refatorar.

---

### PERF-001 — N+1 na listagem de campanhas

**Arquivo:** `apps/backend/src/application/sender/sender.service.ts` (~linha 166)

**Problema:** 1 query de `groupBy` por campanha em loop → 21 queries para 20 campanhas.

**Fix:**
```typescript
// Uma única query agregada
const allCounts = await this.prisma.campaignTarget.groupBy({
  by: ['campaignId', 'status'],
  where: { campaignId: { in: camps.map((c: any) => c.id) } },
  _count: { _all: true },
});

// Montar map em memória
const countMap = new Map<string, Record<string, number>>();
for (const row of allCounts) {
  if (!countMap.has(row.campaignId)) countMap.set(row.campaignId, {});
  countMap.get(row.campaignId)![row.status] = row._count._all;
}

// Usar no map das campanhas (substituir o Promise.all com groupBy por campanha)
const withCounts = camps.map((c: any) => ({
  ...c,
  stats: countMap.get(c.id) ?? {},
}));
```

---

### PERF-002 — `listTags()` full table scan em memória

**Arquivo:** `apps/backend/src/application/contacts/contacts.service.ts` (~linha 43)

**Problema:** Carrega TODOS os contatos do tenant na memória para contar tags. Com 50k contatos → OOM.

**Fix:**
```typescript
async listTags(tenantId: string): Promise<{ tag: string; count: number }[]> {
  return this.prisma.$queryRaw<{ tag: string; count: number }[]>`
    SELECT tag, COUNT(*)::int AS count
    FROM contacts, unnest(tags) AS tag
    WHERE tenant_id = ${tenantId}
    GROUP BY tag
    ORDER BY count DESC
  `;
}
```

---

### QUAL-001 — Zero testes nos serviços críticos

**Problema:** `conversation-agent.service.ts` (492 linhas), `sender.service.ts` (612 linhas), `auth.service.ts`, `conversations.service.ts` — sem nenhum `.spec.ts`.

**Ação:** Criar specs antes de qualquer refatoração. Começar pelos mais críticos:

```
apps/backend/src/application/auth/auth.service.spec.ts
apps/backend/src/application/conversations/conversations.service.spec.ts
apps/backend/src/application/sender/sender.service.spec.ts
apps/backend/src/application/agents/conversation-agent.service.spec.ts
```

Referência: `docs/quality/plano-testes.md` para padrões de mock do Prisma.

---

## 🟡 MÉDIOS (backlog)

Estes não bloqueiam o deploy mas devem entrar no próximo sprint.

| ID | Arquivo | Fix resumido |
|----|---------|-------------|
| SEC-004 | `email-crypto.service.ts:36-41` | Configurar `EMAIL_ENCRYPTION_KEY` em prod; trocar fail-open por throw |
| SEC-005 | `whatsapp.controller.ts` | Mover `?token=xxx` para header `X-Waha-Token` para não logar o token |
| SEC-006 | `conversations.gateway.ts` | Remover `allowEIO3: true` e permitir qualquer origin fora de prod |
| SEC-007 | `auth.controller.ts:42` | Adicionar `@Throttle({ default: { limit: 3, ttl: 3600000 } })` no `/auth/setup` |
| BUG-003 | `tms-lookup.service.ts` | Substituir `pg.Client` por `pg.Pool` + reconexão automática |
| BUG-004 | `conversation-janitor.service.ts:108` | Buscar `status` atual antes de gravar `fromStatus` no histórico |
| BUG-005 | `conversation-agent.service.ts:95` | Carregar histórico anterior com `include` em vez de N queries separadas |
| BUG-006 | `waha-client.service.ts:65,103,126` | Adicionar `signal: AbortSignal.timeout(15_000)` nos `fetch()` |
| ARCH-002 | `auth.module.ts` | Migrar `JwtModule.register` → `registerAsync` (já coberto por SEC-002) |
| ARCH-003 | `sender.service.ts` | Planejar split em `SenderWorkerService` + `CampaignService` |
| ARCH-004 | `email-crypto.service.ts` | Renomear para `CryptoService` ou criar `WebhookCryptoService` separado |
| ARCH-005 | `tms-lookup.service.ts` | Usar `pg.Pool` com `max: 2, idleTimeoutMillis: 30000` |
| PERF-003 | `conversations.service.ts` | Mover lógica de campanha para join no Prisma |
| QUAL-002 | Todo `src/` | Substituir `any` por tipos explícitos nos serviços principais |
| QUAL-003 | `conversation-agent.service.ts` | Reduzir complexidade extraindo métodos privados nomeados |

---

## 🟢 BAIXOS (backlog futuro)

| ID | Ação |
|----|------|
| SEC-008 | Mover `pgdata/` para fora da pasta do projeto |
| SEC-009 | Mover `backups/*.sql` para storage externo ou pasta fora do repo |
| BUG-007 | `anonymizeExpiredData()` — usar `updateMany` com raw SQL em vez de loop |
| PERF-004 | Adicionar índice em `AiMessage.intent` (usado em filtros de campanha) |
| QUAL-004 | Remover Storybook ou criar stories básicos para os componentes principais |
| QUAL-005 | Mover `SAFE_FALLBACK_*` para constantes de módulo |

---

## Commits sugeridos (Conventional Commits)

```
fix(auth): remove jwt dev-secret fallback, use registerAsync
fix(portal): add audience portal to sign() in portal-session.service
fix(sender): move lastSentAt anti-ban state to Redis
fix(webhooks): add distributed Redis lock to retryPending
fix(contacts): replace in-memory listTags with SQL unnest query
fix(sender): replace N+1 campaign stats with single groupBy query
fix(waha): add AbortSignal timeout to all fetch calls
perf(campaigns): single aggregated groupBy query for campaign stats
```

---

## Relacionados

- `docs/reviews/2026-06-21-auditoria-tecnica-completa.md` — visão executiva
- `docs/security/secrets-management.md` — política de secrets (inclui nota sobre API key)
- `docs/quality/plano-testes.md` — plano de testes (QUAL-001)
- `docs/infra/escalabilidade-nexa.md` — contexto para BUG-001 e BUG-002
