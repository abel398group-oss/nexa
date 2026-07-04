# Frontend Audit — UI Consistency, Bugs & Missing Features

> **For the implementation squads.** Actionable findings with file paths and
> acceptance hints. Complements `docs/SPEC-LISTAS-FILTROS-CRUD.md` (canonical
> list/CRUD pattern) — this audit covers what changed since and what that spec
> does not cover (states, temporal filters, functional bugs).
>
> Date: 2026-07-03 · Method: deterministic source scan of `apps/frontend/src/pages`
> (marker regexes per capability) + manual verification of each finding · Status: ready for execution

---

## 1. Capability matrix (scanned 2026-07-03)

Legend: `S` present · `-` absent · pages using the shared `DataTable`
(`components/shared/DataTable`) inherit its built-in pagination even when the
page itself has no pagination code (marked `S*`).

| Page | Lines | Search | Filter | Pagination | Loading | Error state | Empty state | Confirm | DateRange | Error toast |
|---|--:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| CampaignsPage | 1911 | S | S | S | S | S | S | S | - | S |
| ContactsPage | 759 | S | S | S | S | S | S | S | - | S |
| DashboardPage | 680 | - | - | - | S | **-** | - | - | S | - |
| DevTokensPage | 145 | - | - | - | - | - | - | - | - | - |
| EmailChannelSettingsPage | 270 | - | - | - | **-** | S | S | **-** | - | **-** |
| InboxPage | 895 | S | S | **-** | S | S | S | S | - | S |
| KnowledgePage | 293 | S | S | S | S | S | S | S | - | S |
| MonitorConfigPage | 511 | S | S | - | S | S | S | - | - | S |
| NumberHealthPage | 199 | - | - | - | S | **-** | S | - | - | - |
| OpportunitiesPage | 468 | S | S | S | S | S | S | S | **-** | S |
| PlaybookPage | 207 | - | - | - | S | S | S | S | - | S |
| SellersPage | 351 | S | - | S* | S | S | S | S | - | S |
| SupportClientsPage | 126 | **-** | **-** | **-** | S | **-** | S | - | - | **-** |
| SupportConfigPage | 170 | - | - | - | S | S | - | - | - | S |
| SupportDashboardPage | 264 | - | - | - | S | **-** | S | - | **-** | - |
| UsersPage | 232 | S | S | **-** | S | S | S | S | - | S |

(LandingPage, LoginPage, SupportPage wrapper and dashboard chart fragments
omitted — not list/CRUD surfaces.)

---

## 2. Prioritized findings — UI consistency

### P0 — user-facing gaps in production flows

1. **SupportClientsPage is bare** (`pages/SupportClientsPage.tsx`, 126 lines):
   no search, no filter, no pagination, no error state, no error toast. A TMS
   tenant with hundreds of customers makes this page unusable.
   *Accept:* replicate the Contacts pattern (spec §3–4); at minimum search +
   pagination + error state.
2. **InboxPage conversation list has no pagination/infinite scroll**
   (`pages/InboxPage.tsx`): the sidebar loads the whole conversation list and
   grows without bound. With campaign volume (50 emails/day + WhatsApp) this
   degrades within weeks.
   *Accept:* cursor pagination or `loadMore` on the sidebar list, keeping the
   real-time socket updates.
3. **Silent failure dashboards** — no error state at all: `DashboardPage`,
   `SupportDashboardPage`, `NumberHealthPage`. If the API fails, the user sees
   stale/blank charts with no hint.
   *Accept:* error state with retry, same pattern as ContactsPage.
4. **Temporal filtering is only on DashboardPage.** `DateRangeContext` exists,
   but Campaigns, Opportunities and SupportDashboard — all time-series data —
   cannot be filtered by period.
   *Accept:* wire `DateRange` into these three pages (backend endpoints already
   accept date filters where lists are paginated).

### P1 — pattern deviations

5. **EmailChannelSettingsPage** (`pages/EmailChannelSettingsPage.tsx`): saving
   SMTP/IMAP credentials has no loading state on submit, no confirm before
   overwriting a working channel, and no error toast (failures only render
   inline). Given this config gates every outbound email, harden the form.
6. **UsersPage has no pagination** and renders cards instead of the shared
   `DataTable` (232 lines). Spec already tracks the missing *edit* action; add
   pagination + DataTable adoption to the same task.
7. **SellersPage has no filters** (status/active) — search only.
8. **OpportunitiesPage destructive actions**: scan found no `confirm()` usage —
   verify stage-change/delete flows ask confirmation like sibling pages do.
9. **PlaybookPage** still has no search/pagination (spec §2 already lists it —
   unchanged since June).

### P2 — hygiene

10. `DevTokensPage` has no loading/error handling at all (dev-only, low risk).
11. `SupportConfigPage` has no empty state for the initial unconfigured case.

---

## 3. Verified functional bugs (found & reproduced 2026-07-03)

These were found during live testing with the HiperTMS tenant, root-caused in
code and — where marked — already fixed on the working branch.

1. **[FIXED — needs test + deploy] Web chat contract mismatch, Lia never
   answered support widget.** TMS widget emits `web_chat:send { body }` and
   listens to `web_chat:message`; the Nexa gateway expected `{ message }` and
   emitted `message`. Every widget message was dropped ("Mensagem vazia") and
   no reply could ever reach the widget.
   Fix: `presentation/ws/conversations.gateway.ts` now accepts `body|message`
   and emits both `message` and `web_chat:message` (outbound only, mapped to
   `{ id, body, isAgent, createdAt }`).
   *Follow-up for squad:* e2e covering widget round-trip; contract test pinning
   the ADR 027 event shapes on both repos.
2. **[OPEN — prod blocker for email campaigns] Opt-out links point to
   `localhost:3001`.** `EmailReplyService` builds the opt-out URL from
   `APP_BASE_URL ?? 'http://localhost:3001'`. Production/dev `.env` does not set
   `APP_BASE_URL`, so real recipients get a dead link — LGPD problem and a
   strong spam signal.
   *Accept:* set `APP_BASE_URL` in prod env; add it to `validateEnv` boot check
   so the backend refuses to start email sending without it.
3. **[OPEN — infra] Gmail silently drops campaign mail.** SMTP handoff to
   HostGator succeeds (`250 OK`), no bounce returns, nothing reaches Gmail
   (inbox or spam); non-Gmail recipients receive normally. Public DNSBLs are
   clean; `hipertms.com.br` has SPF+DKIM but **no DMARC record**.
   *Accept:* (a) publish DMARC `p=none` with `rua`; (b) move the tenant email
   channel to a transactional relay (SES/Resend/Brevo) — only `email_channels`
   row changes, no code; (c) register domain in Google Postmaster Tools.
4. **[OPEN — product gap] Campaign targets are marked `sent` with no delivery
   feedback.** `sent` means "SMTP accepted", not "delivered". With Gmail
   dropping silently, the panel reports 100% success on campaigns nobody
   received. *Accept:* poll the channel mailbox for bounces (IMAP already
   configured) and mark targets `bounced`; longer term, relay webhooks
   (delivered/bounce/complaint) feeding `campaign_targets.status`.

---

## 4. Cross-cutting recommendation

Adopt the canonical list pattern from `docs/SPEC-LISTAS-FILTROS-CRUD.md` as a
shared `ListPage` composition (search + filters + DataTable + pagination +
loading/error/empty states) and migrate pages in this order:

`SupportClientsPage` → `InboxPage` (pagination only) → `UsersPage` →
`SellersPage` (filters) → dashboards (error states + DateRange).

Each migration is mechanical once the first one lands; budget the pattern
extraction in the first task.
