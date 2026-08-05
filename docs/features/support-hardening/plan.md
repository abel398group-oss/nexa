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
| §3 | nexa | `ticket-intelligence.service.ts:159-167` | High | **Fixed (partial — see below)** |
| §4 | nexa | `portal-tickets.service.ts:182-207` | High | No — re-confirm first |
| §5 | nexa | `portal-tickets.service.ts:272-290` | Medium | No — re-confirm first |
| §6 | nexa | `ticket-intelligence.service.ts:70-91` | Medium | No — re-confirm first |
| §7 | tms | `SupportDrawer.tsx` + `LiaChatWindow.tsx` | Medium | No — re-confirm first |
| §8 | tms | `lia-support.service.ts:64-148` | Medium | No — re-confirm first |
| §9 | tms | `service-token.guard.ts:34` | Low | No — re-confirm first |

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

**What was deliberately NOT done.** True paraphrase matching — "certificado
vencido" vs "o certificado expirou ontem" are still counted as different
causes. Fixing that properly needs either a stable `rootCauseKey` from a fixed
vocabulary (schema migration + prompt change to the diagnostic agent) or
semantic similarity via the embeddings this repo already has wired up for the
knowledge base (`KnowledgeService`, already injected into this same service).
Both are real, larger changes with their own tradeoffs (vocabulary curation,
or similarity-threshold tuning) — deliberately left out of this pass rather
than decided unilaterally under a "fix what's necessary" instruction on a
system already in production. Worth a dedicated follow-up if D1-A's output
still looks too sparse after this fix lands.

---

### §4 — Concurrent replies to a closed ticket can create two follow-ups (High, not yet re-confirmed)

**Repo:** nexa. **Where:** `portal-tickets.service.ts:182-207` (`reply()`,
the reopen-window logic).

**Claimed failure scenario.** No lock/transaction between the `findFirst`
status check and the reopen-or-follow-up write. Two near-simultaneous replies
to the same closed ticket (WhatsApp + portal arriving close together, or a
double-submit) can both read `status === 'closed'`, both decide it's past the
reopen window, and both create a separate follow-up conversation — the same
failure family as §0.

**Before fixing:** confirm the read-then-write really has no transaction
wrapping it (read the full method, not just the range already sampled).

**Likely fix, if confirmed.** Wrap the check + the resulting write (reopen or
create-follow-up) in a single `prisma.$transaction`, or add a unique
constraint that makes the second concurrent write fail loudly instead of
silently succeeding twice.

---

### §5 — Swallowed errors with no log (Medium, not yet re-confirmed)

**Repo:** nexa. **Where:** `portal-tickets.service.ts:272-276`, `287-290`.

**Claimed failure scenario.** `.catch(() => {})` around a DB update, intended
to absorb a unique-constraint conflict, but written broadly enough to also
swallow a transient connection error or any other failure with zero log line
— directly against this repo's own rule that every discard path must log why.

**Likely fix, if confirmed.** Catch the specific error (e.g. Prisma's unique
constraint error code) and let anything else rethrow, or at minimum log
`err?.message` before discarding.

---

### §6 — Unbounded batch in the 30min job (Medium, not yet re-confirmed)

**Repo:** nexa. **Where:** `ticket-intelligence.service.ts:70-91` (the
`recentlyClosed` query) + the Redis lock at line 58.

**Claimed failure scenario.** No `take`/pagination on "everything closed in
the last 2h," combined with a fixed-TTL lock that doesn't renew — if a run
ever processes an unusually large batch, it could outlive the lock and race
with the next scheduled run.

**Before fixing:** check realistic volume (how many tickets typically close in
a 2h window) — if it's reliably small, this may not be worth the complexity of
adding pagination now; a lock-TTL extension or a simple row cap might be
enough.

---

### §7 — Two independent session exchanges when both widgets are open (Medium, not yet re-confirmed)

**Repo:** tms. **Where:** `SupportDrawer.tsx` (mounted in `AppTopBar.tsx`) and
`LiaChatWindow.tsx` (mounted in `ChatWidget.tsx`), each calling its own
`usePortalSession()`.

**Claimed failure scenario.** If a customer has both the support drawer and
the floating Lia chat bubble open in the same tab, each independently
exchanges a handoff token and gets its own Nexa portal JWT — redundant, and a
possible source of the exact duplicate-conversation pattern §0 just fixed on
the Nexa side (now mitigated there, but the redundant session creation on the
frontend is still wasteful and worth confirming isn't causing anything else).

**Likely fix, if confirmed.** Share one `usePortalSession()` instance via
context instead of two independent hook instances.

---

### §8 — No fallback on Nexa outage for two of the three handoff endpoints (Medium, not yet re-confirmed)

**Repo:** tms. **Where:** `lia-support.service.ts:64-102` (`getSupportToken`),
`109-148` (`getWebChatToken`).

**Claimed failure scenario.** Unlike `buildHandoffLink` (the legacy WhatsApp
fallback path, which wraps its fetch and logs before degrading), these two
have no try/catch around the fetch to Nexa. If Nexa is unreachable rather than
returning a non-2xx, the raw exception propagates as a bare 500 with no
fallback — the ticket-form and live-chat entry points have no degraded mode at
all if Nexa is down.

**Likely fix, if confirmed.** Wrap both in try/catch, log the real failure
(per this repo's own convention, already followed elsewhere in the same file),
and decide on a fallback — even just a clear "suporte temporariamente
indisponível, tente novamente" is better than a raw 500.

---

### §9 — Non-constant-time token comparison (Low, not yet re-confirmed)

**Repo:** tms. **Where:** `service-token.guard.ts:34`.

**Claimed failure scenario.** `provided !== expected` is a plain string
compare, not `crypto.timingSafeEqual` — a timing side-channel, though the
practical exploitability against a server-to-server secret over a real network
is low. The TMS's own security audit already flags the identical pattern in
`asaas-webhook.service.ts`; this guard has the same gap, just not yet listed
there.

**Likely fix, if confirmed.** Swap to `crypto.timingSafeEqual` with a
length-check guard (mismatched lengths throw in `timingSafeEqual`, so pad or
check length first).

## Next step

Confirm which items to implement and in what order. §1 and §2 are ready to go
as described. §3-§9 need the "before fixing" re-confirmation step first —
each is scoped to a single read of the relevant file before any edit.
