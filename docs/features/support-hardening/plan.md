---
tags:
  - fix-plan
  - support
status: draft
created: 2026-08-05
---

# Support module — correctness fix plan (2026-08-05 audit)

| Campo | Valor |
|------|-------|
| **Status** | Draft — awaiting go-ahead per item |
| **Date** | 2026-08-05 |
| **Scope** | `nexa` (backend) + `hipervias_v12` (TMS, backend + frontend) |
| **Trigger** | Read-only bug hunt across the support pipeline, following the `findOrCreateWebChat` sourceChannel fix (already shipped, see §0) |

## Context

After mapping the support module end to end (Nexa: router → case-classifier →
diagnostic → resolution → escalation agents, `AiConversation` as the ticket
entity, `ticket-intelligence.service.ts` as a 30min background job; TMS: thin
proxy `lia-support` + widget), one real duplicate-conversation bug was found
and fixed. A follow-up read-only hunt across both repos surfaced 9 more items.

**Verification status matters here.** Two items (§1, §2) were read and
confirmed directly, line by line — treat those as fact. The other seven came
from an agent bug hunt and were not independently re-read before this doc was
written — treat those as a strong lead, not a settled diagnosis; the first
step of each is to re-confirm before touching code, per REGRA 8 (no fix
without reading the actual failure first).

**Cross-repo note.** Four items live in `hipervias_v12`. Per this repo's
REGRA 8 ("se a tarefa exige mexer no repo do TMS também → parar e avisar o
Abel"), this document *is* that stop-and-notify — nothing in the TMS repo gets
touched until each item below is explicitly approved. `hipervias_v12` has its
own `CLAUDE.md` and its own build/test commands (`pnpm --filter api test`,
`pnpm --filter web typecheck`, etc.) — do not assume Nexa's commands apply
there.

## §0 — Already shipped (reference, not part of this plan)

`findOrCreateWebChat` (`apps/backend/src/application/conversations/conversations.service.ts:329`)
only matched `sourceChannel: 'web_chat'` when looking for an open conversation
to reuse, so a customer who opened a ticket via the form (`sourceChannel:
'portal'`) and then opened live chat got a second, duplicate conversation.
Fixed to match `{ in: ['web_chat', 'portal'] }`; two regression tests added in
`conversations.service.spec.ts`. Needs `pnpm test:backend` +
`cd apps/backend ; pnpm build` locally (not runnable in this sandbox) before
it's considered done.

---

## Fix items

| ID | Repo | Where | Severity | Verified |
|----|------|-------|----------|----------|
| §1 | nexa | `case-classifier-agent.service.ts:87`, `escalation-agent.service.ts:27` | High | **Fixed** |
| §2 | tms | `usePortalSession.ts`, `SupportDrawer.tsx:699-721` | ~~High~~ | **Not a bug — see below** |
| §3 | nexa | `ticket-intelligence.service.ts:159-167` | High | **Fixed (full — semantic matching added same day)** |
| §4 | nexa | `portal-tickets.service.ts:182-207` | High | **Fixed** |
| §5 | nexa | `portal-tickets.service.ts` (`ensureContact`) | Medium | **Fixed** |
| §6 | nexa | `ticket-intelligence.service.ts:70-91` | Medium | **Fixed** |
| §7 | tms | `usePortalSession.ts` | Medium | **Fixed (smaller fix than first proposed — see below)** |
| §8 | tms | `lia-support.service.ts:64-148` | Medium | **Fixed** |
| §9 | tms | `service-token.guard.ts:34` | Low | **Fixed** |

Suggested order: §1 → §2 → §4 → §3 → the rest. §1 and §4 share a root cause
(no re-validation / no lock around a read-then-write on `AiConversation`) and
are worth doing back to back while that context is loaded.

---

### §1 — Category safety net can be silently bypassed (High, verified)

**Repo:** nexa. **Where:** `case-classifier-agent.service.ts:87`,
`escalation-agent.service.ts:13,27`.

**Failure scenario.** ADR 015 D6 is a hard rule: fiscal/financeiro category
with low confidence must always escalate to a human — this is the one thing
the AI is never allowed to decide alone. Both places that enforce it compare
`category` with `===`/`Array.includes` against the exact strings `'fiscal'`
and `'financeiro'`, straight out of `JSON.parse()` on the LLM's raw text
output. There is no schema validation between the parse and the compare. If
the model ever returns `"Fiscal"`, a trailing space, or any other string that
means the same thing to a human but isn't byte-identical, both checks fail
silently and the hard rule doesn't fire — with no error, no log, nothing
downstream ever finds out.

**Proposed fix.** Normalize `parsed.category` right after parsing (lowercase +
trim) and validate it against the `TicketCategory` union before it's used
anywhere — fall back to a safe default (e.g. `'outro'` with `requiresHuman =
true`, never silently drop the safety check) if it doesn't match a known
value. One normalization point, used by both the classifier's own D6 check
and by `escalation-agent.service.ts`.

**Test to add.** `case-classifier-agent.service.spec.ts`: LLM mock returns
`{"category":"Fiscal","confidence":"low",...}` (capitalized) →
`requiresHuman` must still end up `true`.

**Blast radius.** Touches only the classifier's parse path and the constant
in escalation-agent. Should not change behavior for the common case (model
already returns lowercase almost always) — this is a guard for the tail, not
a rewrite of the happy path.

---

### §2 — Investigated, not a bug (revised 2026-08-05)

**Repo:** tms. **Where:**
`apps/web/src/features/support/hooks/usePortalSession.ts`,
`apps/web/src/features/support/SupportDrawer.tsx:599-626`.

**Original claim (wrong).** State `'idle'` has no render branch in the
drawer, so a session that expires mid-use would leave the panel blank forever,
recoverable only with a full page reload.

**What a full trace of the effect chain actually shows.** `initSession` is
`useCallback(fn, [session])` inside the hook — its identity changes every time
`session` changes. The drawer's mount effect (`SupportDrawer.tsx:599-603`)
depends on `[open, initSession, location.pathname]`. So when `resetSession()`
fires (today, only reachable from the ticket-polling loop's 401 handler at
line 620), `session` flips to `null` → `initSession` gets a new reference →
the effect's dependency changed → React re-runs it → since `open` is still
`true`, it calls `initSession` again → the guard `if (session?.jwt) return`
no longer applies (`session` is `null`) → it re-authenticates on its own.
State passes `idle → loading → ready` within one effect tick; at worst
there's an imperceptible blank frame, not a stuck session. **No fix
applied — the original diagnosis did not survive a careful read, and per the
explicit instruction not to touch anything already working in production,
nothing was changed here.**

**A smaller, real, different issue found along the way (not fixed, not
re-scoped into this plan without sign-off).** Only the polling loop's catch
block calls `resetSession()` on a 401. `handleReply` (652-667) has no
try/catch at all; `handleSelectTicket` (642-650) catches everything —
including a 401 — and just falls back to an empty message list, never
resetting the session. So a session that dies while the customer is
mid-reply or opening a ticket from the list fails silently or unhandled,
without `resetSession()` ever firing to trigger the self-heal above. This is
a plausible follow-up item, intentionally not added to this plan without
explicit approval — flagging it here for later.

---

### §3 — Recurrence detection, fixed (partial — high-value, low-risk slice only)

**Repo:** nexa. **Where:** `ticket-intelligence.service.ts:154-191`
(`detectRecurrence`).

**Confirmed.** `rootCause` is genuinely free text (`diagnostic-agent.service.ts:125`
prompts for `"<causa-raiz ou null>"`, no fixed vocabulary), and the match was
an exact string `where: { rootCause }`. A second, worse bug was found in the
same function while confirming the first: the dedup check matched on the
notification **title**, which only ever embedded the live count
(`"3× em 30d"`) and never the cause itself — so two genuinely *different*
recurring problems hitting the same count on the same day produced identical
titles, and the second one was silently swallowed as a false "duplicate."

**What was fixed.** Two changes, same method, both additive/low-risk (reusing
`mode: 'insensitive'`, an existing pattern already used in
`contacts.service.ts`/`knowledge.service.ts`, not a new mechanism):

1. The count query now matches `rootCause` case-insensitively and trims the
   current value — resolves casing/whitespace drift between calls.
2. The dedup check now matches on a snippet of the root-cause text already
   stored in the notification body, instead of the count-bearing title —
   resolves the false-duplicate-suppression bug.

5 tests added in `ticket-intelligence.service.spec.ts`.

**Update 2026-08-05 (later same day) — full fix shipped.** Approved
explicitly by Abel after a walkthrough of the two options (fixed vocabulary
vs. semantic similarity). Went with semantic similarity, reusing this repo's
own established pattern instead of inventing a new one:

- New nullable column `AiConversation.rootCauseEmbedding` (`vector(384)`,
  same type as `AiKnowledgeBase.embedding`) — migration
  `20260805210000_ticket_root_cause_embedding`, additive only, no backfill
  (populated lazily as tickets are analyzed, same "no fabricated history"
  principle as the rest of this plan).
- `detectRecurrence` now also embeds the current ticket's `rootCause`
  (`EmbeddingsService.embed(..., 'passage')`, e5-small — identical call shape
  to `KnowledgeService.storeEmbedding`), stores the vector, and queries other
  tickets in the window above a cosine-similarity threshold
  (`TICKET_ROOT_CAUSE_SIMILARITY`, default 0.88, env-tunable — no real
  production data existed to calibrate against, so it starts conservative:
  fewer false "recurring" flags, at the cost of possibly missing some real
  ones early on).
- Exact match (part 1, same day) and semantic match results are combined as a
  **set of matched IDs**, not summed — a ticket that matches both ways must
  not be counted twice.
- Fully additive to the failure mode: if embeddings are disabled or the
  embedding call fails, the exact-match result from part 1 is used exactly as
  before — this can only find *more* recurrences than before, never fewer,
  and never breaks if the embeddings service is unavailable.
- `EmbeddingsService` is `@Global()` (same as `RedisLockService`) — no module
  wiring needed beyond the constructor.

9 tests added covering: embeddings-disabled preserves old behavior exactly,
the embedding gets stored, semantic matches add to the exact count, a ticket
matching both ways is deduplicated (asserted via the exact count shown in the
notification, not just "was called"), and a failed embedding call degrades to
the part-1 behavior without crashing.

---

### §4 — Concurrent replies to a closed ticket, fixed

**Repo:** nexa. **Where:** `portal-tickets.service.ts` (`reply()` +
new `reopenOrFollowUpLocked()`).

**Confirmed.** Read the full method — no transaction or lock between the
`findFirst` status check in `reply()` and the write in `reopenOrFollowUp()`.
Two near-simultaneous replies to the same closed ticket (WhatsApp + portal
arriving close together, or a double-submit) could both read `status ===
'closed'`, both decide it's past the reopen window, and both create a
separate follow-up conversation.

**Fix.** Added `reopenOrFollowUpLocked()`, which wraps the decision in the
same `RedisLockService` already used by `ticket-intelligence.service.ts` —
reused infrastructure, not a new mechanism. Whoever gets the lock first
decides normally; whoever arrives while it's held waits briefly (3 retries,
150ms apart), then re-reads the conversation fresh — if it's already been
reopened, or a follow-up already exists (checked via `followUpOfId`, since
the *original* ticket stays `'closed'` even after a follow-up is created —
checking status alone would miss that case), it reuses that result instead of
creating a second one. If the lock can't be acquired at all (Redis down), it
falls back to the pre-fix behavior (no lock) rather than blocking the
customer — never worse than today.

8 tests added/updated in `portal-tickets.service.spec.ts`, including the two
existing reopen/follow-up tests (their `findFirst` mock sequence changed —
there's now a re-read inside the lock — the assertions themselves are
unchanged) and 3 new tests: reusing an existing follow-up, reusing an
already-reopened ticket, and the no-lock-available fallback.

---

### §5 — Swallowed errors with no log, fixed

**Repo:** nexa. **Where:** `portal-tickets.service.ts` (`ensureContact`, both
best-effort `contact.update` calls).

**Confirmed.** `.catch(() => {})` in both spots, meant to absorb the expected
unique-constraint conflict (phone or externalContactId already used by
another contact), but broad enough to also swallow a transient DB failure
with zero log line — against this repo's own rule that every discard path
must log why.

**Fix.** Kept the "never throw" behavior (this is a best-effort auxiliary
update inside `ensureContact`, called from the customer-facing `open()`/
`reply()` paths — rethrowing here would risk breaking ticket creation over a
non-critical field sync, which is a bigger behavior change than this pass
should make). Only added: check `e?.code === 'P2002'` (this codebase's
established pattern for Prisma's unique-constraint code, already used in
`sellers.service.ts:105`) — swallow that in silence as before, but
`logger.warn` anything else, so a real DB failure is no longer invisible.

2 tests added, covering both the P2002-stays-silent case and the
real-error-gets-logged case.

---

### §6 — Unbounded batch in the 30min job, fixed (row cap, not full pagination)

**Repo:** nexa. **Where:** `ticket-intelligence.service.ts`
(`runIntelligenceLocked`).

**Confirmed.** No `take`/limit on "everything closed in the last 2h," and the
lock guarding concurrent runs has a fixed 900s TTL that doesn't renew mid-run.

**Fix, matching the "simple row cap" option from the original note** (didn't
have production volume data to justify full pagination, and didn't want to
query prod to find out just for this pass): added `take:
TICKET_INTELLIGENCE_MAX_PER_RUN` (env-configurable, default 500) plus
`orderBy: { endedAt: 'asc' }` so if the cap is ever hit, the oldest tickets go
first — nothing is skipped, it just spreads across more runs. Logs a warning
when the cap is reached, so if 500/run is ever actually too low, that becomes
visible instead of silently truncating. Left the lock TTL untouched — see
reasoning below.

**Why the lock TTL wasn't touched.** `release()` runs in a `finally` block, so
a thrown error already releases the lock; the only case where a longer TTL
would help is a truly hung process, and in that case a LONGER TTL is worse,
not better — it delays recovery further after a crash/restart that skipped
the `finally`. The row cap addresses the actual risk (a large batch running
long) without that tradeoff.

3 tests added.

---

### §7 — Two independent session exchanges, fixed with a smaller change than first planned

**Repo:** tms. **Where:** `usePortalSession.ts` only.

**Confirmed.** `SupportDrawer.tsx:587` and `LiaChatWindow.tsx:399` each call
`usePortalSession()` independently — mounted under different parents
(`AppTopBar.tsx` vs `ChatWidget.tsx`), both ultimately under `App.tsx`. If
both are open at once, each fires its own handoff-token exchange.

**Why the originally-proposed fix (shared context) was NOT what shipped.**
Sharing state via a `PortalSessionProvider` context would require wrapping a
provider high enough in `App.tsx` to cover both mount points, and changing
both consuming components — a real change to the app's component
composition, on a production frontend, for a bug whose actual damage is now
small: §0's `sourceChannel` fix already covers the duplicate-conversation risk
regardless of which widget's session created it, so what's left is just two
redundant network round-trips in the rare case both widgets are open at once.
That didn't seem worth the structural risk.

**What shipped instead.** A module-level (not component-level) promise cache
in `usePortalSession.ts`: the second concurrent `initSession()` call, from
either component, awaits the *same* in-flight exchange instead of starting a
new one. Zero changes to `SupportDrawer.tsx`, `LiaChatWindow.tsx`, or
`App.tsx` — both keep calling the hook exactly as before. The solo-widget
case (by far the common one) is byte-for-byte the same code path as before.

**One accepted, minor, and disclosed side effect:** the two callers can pass
different `pathname` values (which page they were on) into `initSession()`.
When a shared exchange is reused, only the *first* caller's pathname is sent
as request context — the second caller's page isn't recorded. Cosmetic
(analytics-context only, doesn't affect auth or session validity), and only
possible in the already-rare both-widgets-open-at-once window.

4 tests added in the new `usePortalSession.test.ts` (didn't exist before):
concurrent dedup, sequential calls after settlement still fetch fresh, shared
failure propagates to both callers, and the solo-widget case is unchanged.

---

### §8 — No error handling on Nexa outage, fixed

**Repo:** tms. **Where:** `lia-support.service.ts` (`getSupportToken`,
`getWebChatToken`).

**Confirmed.** Unlike `buildHandoffLink` (wraps its fetch, always logs before
degrading to the WhatsApp link), these two had no try/catch around the fetch
to Nexa. If Nexa was unreachable (not a non-2xx response — a real network
failure or the 5s timeout firing), the raw exception propagated uncaught, all
the way to the controller, as a bare unhandled rejection.

**Fix.** Wrapped just the `fetch()` call in try/catch in both methods. On
failure: log the real underlying message (`err?.message` — previously
invisible), then throw the same `UnauthorizedException` type this method
already throws for the "response not ok" case a few lines below, with a
clear, translated message. No new fallback mode was invented (e.g. no
WhatsApp-link degradation like `buildHandoffLink` has) — these two methods
return a `{token, ...}` shape the frontend uses to open a Nexa session
directly, not a URL string, so a WhatsApp-shaped fallback would need a
frontend contract change too. Matching the doc's own minimum bar — "a clear
message is better than a raw 500" — without expanding scope into a
cross-repo contract change.

6 tests added in the new `lia-support.service.spec.ts` (didn't exist before):
network failure + non-2xx + happy path, for both methods.

---

### §9 — Non-constant-time token comparison, fixed

**Repo:** tms. **Where:** `service-token.guard.ts`.

**Confirmed.** `provided !== expected` was a plain string compare — a timing
side-channel (low practical exploitability against a server-to-server secret
over a real network, but a real gap). This repo's own security audit already
flags the identical pattern in `asaas-webhook.service.ts`; this guard had the
same gap.

**Fix.** Reused that file's exact already-reviewed pattern (comment there
calls it "Security F15") instead of inventing a new one: hash both strings to
SHA-256 first, then `timingSafeEqual` on the fixed-length digests. This
sidesteps `timingSafeEqual`'s own footgun — it throws on mismatched buffer
lengths, which two arbitrary tokens being compared will usually have.

6 tests added, including the specific regression this fix targets: a wrong
token of a *different length* than expected no longer risks an internal
error, it cleanly returns 401 like any other wrong token.

## Status — 2026-08-05

All 9 original items resolved: §1, §3, §4, §5, §6, §7, §8, §9 fixed and
tested; §2 investigated and found not to be a real bug (see its section — the
original diagnosis didn't survive a full read of the effect chain). §0 (the
finding that started this pass) shipped earlier. One more item (§10, below)
was added afterward — one of the two follow-ups flagged as "noticed but not
folded in," explicitly approved and implemented in a later pass. 40 tests
added/updated across nexa + tms.

### §10 — Session-expiry errors failing silently in the reply flow, fixed

**Repo:** tms. **Where:** `SupportDrawer.tsx` (`handleSelectTicket`,
`handleReply`, `MessageThread.handleSend`).

**What this is.** Noticed while confirming §2, deliberately not folded into
this plan at the time — approved and done in a follow-up pass, not bundled
into the original 9 without sign-off.

**Confirmed.** `handleSelectTicket` caught every error (including a 401 from
an expired session) and silently rendered an empty ticket shell, never
calling `resetSession()` — so a dead session kept being reused on every
following action. `handleReply` had no try/catch at all — an error (401 or
otherwise) became an unhandled rejection. `MessageThread.handleSend` (the
caller of `handleReply`) also had no `catch` — `sending` correctly reset via
`finally`, but nothing told the customer the send failed, and the typed
message stayed in the box with zero feedback.

**Fix.** All three now distinguish a 401 from any other error:
- `handleSelectTicket`: 401 → `resetSession()` (self-heals per §2's traced
  effect chain) instead of the old empty-ticket fallback; any other error
  keeps the exact old fallback behavior.
- `handleReply`: 401 → `resetSession()` + throws a clear "sua sessão expirou,
  reconectando" message; any other error → throws a generic clear message.
  Both replace what used to be either a raw unhandled rejection or (for 401)
  nothing at all.
- `MessageThread.handleSend`: new `sendError` state, set in a `catch` around
  `onReply`, rendered inline next to the input using this file's existing
  error-text style (`text-xs text-destructive`, already used for the "abrir
  chamado" form's own error).

7 tests added in `SupportDrawer.test.tsx`: 401 on select (reauth, no empty
ticket), 401 on reply (reauth + message shown), and a non-401 reply error
(message shown, no reauth) — plus confirmation the existing T1/T2 suites
(none of which simulate a rejection) are unaffected.

## Earlier status note (superseded by the section above)

**Not yet done, by design:**
- **Build/test verification.** Nothing here ran in the sandbox — the backend
  doesn't build there (symlink issue) and this pass touched two repos. Before
  calling this done: `pnpm test:backend` + `cd apps/backend ; pnpm build` in
  nexa (**now also needs `pnpm prisma:generate` for the new migration —
  backend must be stopped first on Windows, see CLAUDE.md**);
  `pnpm --filter api test` + `pnpm --filter api build`, `pnpm --filter web
  test` in hipervias_v12.
- **§3's full fix** — done later the same day, approved explicitly. See §3's
  own section above for what shipped.
- **§7's originally-proposed shared-context refactor** — superseded by a
  smaller fix; the context approach was never built, on purpose (see §7).
