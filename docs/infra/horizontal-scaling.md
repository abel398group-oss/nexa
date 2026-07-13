# Horizontal scaling — distributed locks for scheduled workers

## Problem

The Nexa backend runs several `@Interval` / `@Cron` workers that mutate data and
send messages (follow-ups, e-mail campaigns, monitor consolidation, conversation
janitor, ticket intelligence, WhatsApp sender). With a **single** backend
instance this is fine. The moment a **second** replica is started behind a load
balancer, every replica fires the same tick, causing:

- duplicate follow-up messages to leads,
- e-mail campaigns sent twice,
- ticket analysis / notifications duplicated,
- the WhatsApp anti-ban delay (30–90 s) violated by two senders running together.

So, before this change, the backend could **not** be scaled beyond one instance
without corrupting data — the main blocker for handling more concurrent users.

## Solution — `RedisLockService`

A single, global, Redis-backed mutual-exclusion lock:
`apps/backend/src/shared/lock/redis-lock.service.ts`.

Each guarded worker wraps its tick:

```ts
@Interval(20000)
async tick(): Promise<void> {
  const release = await this.lock.acquire('lock:followup:tick', 60);
  if (!release) return;          // another replica holds it → skip this tick
  try {
    await this.tickLocked();     // original body, unchanged
  } finally {
    await release();             // release as soon as the run finishes
  }
}

private async tickLocked() { /* ... */ }
```

How it works:

- `acquire(key, ttl)` runs `SET key <token> NX EX ttl`. Only one replica gets
  `OK`; the others get `null` and skip the tick.
- Release uses a Lua **compare-and-delete**: the key is only deleted if the token
  still matches, so a replica whose lock already expired can never delete a lock
  another replica has since acquired.
- The TTL is a **crash safety-net**: normally the lock is released in `finally`,
  but if the process dies mid-run the lock frees itself after `ttl` seconds.
- **No `REDIS_URL`** → `acquire` returns a no-op release (always "acquires"), so
  single-instance dev/deploys behave exactly as before.
- **Redis unreachable at runtime** → fail-open (runs without the lock) and logs a
  warning, so a Redis blip never silently freezes a worker.

## Guarded workers

| Worker | Method | Lock key | TTL |
|---|---|---|---|
| `FollowUpService` | `tick` | `lock:followup:tick` | 60 s |
| `EmailCampaignSenderService` | `tick` | `lock:email-campaign:tick` | 60 s |
| `ConsolidationService` | `runConsolidation` | `lock:consolidation:run` | 240 s |
| `ConversationJanitorService` | `closeInactiveConversations` | `lock:janitor:close-inactive` | 1800 s |
| `ConversationJanitorService` | `purgeEphemeralData` | `lock:janitor:purge-ephemeral` | 3600 s |
| `ConversationJanitorService` | `anonymizeExpiredData` | `lock:janitor:anonymize-expired` | 3600 s |
| `TicketIntelligenceService` | `runIntelligence` | `lock:ticket-intelligence:run` | 900 s |
| `SenderService` | `tick` | `lock:sender:tick` | 60 s |

TTL rule of thumb: comfortably **above** the tick's normal runtime and **below**
its interval.

### Already coordinated before this change (left untouched — see REGRA 8)

- `ProactiveEngineCron` and `WebhookService` already implement their own Redis
  locks. They are intentionally **not** migrated to `RedisLockService` here to keep
  scope tight; a future cleanup can consolidate them onto the shared service.
- `SenderService` already shared anti-ban state (`sender:lastSentAt` /
  `sender:nextDelayMs`, "BUG-001") across replicas. The new tick lock complements
  it by guaranteeing a single sender per tick.

## Adding a lock to a new worker

1. Inject `RedisLockService` (it is provided by the global `RedisLockModule`, so
   no module import is needed).
2. Rename the worker body to a private `…Locked()` method.
3. Wrap it with the `acquire → try → finally release` pattern above, choosing a
   unique `lock:*` key and a TTL between runtime and interval.

## Prerequisites for running multiple replicas

- `REDIS_URL` must be set and point to the **same** Redis for all replicas (the
  production `redis` service already is shared).
- WebSocket scaling is already handled by the socket.io Redis adapter
  (`@socket.io/redis-adapter` in `presentation/ws/conversations.gateway.ts`).
- Only after the above, raise the replica count (e.g. Docker Compose
  `deploy.replicas` / an orchestrator) — the workers will now divide work safely.

## Concurrency cap on AI calls (done)

`AnthropicService` now gates every call through an in-memory FIFO semaphore
(`AI_MAX_CONCURRENCY`, default 8) so a burst of messages cannot fan out into
hundreds of parallel Anthropic requests (rate-limit 429 / cost / memory). The
existing per-attempt timeout and retry are unchanged. Tune via env
`AI_MAX_CONCURRENCY`.

## Webhook delivery (reviewed — already durable)

Contrary to an earlier note, webhook delivery state is **not** in-memory: each
delivery is a `WebhookDelivery` row (Postgres) with retry + exponential backoff,
and `retryPending()` is a `@Interval` guarded by a Redis lock (one instance at a
time). A restart loses nothing. `emit()` now dispatches the first attempt
**fire-and-forget** so it never blocks the caller (hot path) on outbound HTTP;
failures fall into the existing retry flow. A dedicated queue (BullMQ) would only
pay off at much higher volume.

## Still open (tracked separately, not in this change)

- Consolidate `ProactiveEngineCron` / `WebhookService` onto `RedisLockService`.
- Only if webhook volume grows a lot: move retry to BullMQ for higher throughput.
