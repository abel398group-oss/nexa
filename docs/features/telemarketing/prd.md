---
tags:
  - prd
  - feature
status: draft
---

# PRD — Telemarketing (lead segments, batches, attempts)

| Campo | Valor |
|------|-------|
| **Status** | Módulo 1 aprovado por Abel em 2026-08-11 — restante segue rascunho |
| **Data** | 2026-08-04 · revisado 2026-08-11 (ver §Revisão 2026-08-11) |
| **Dono** | (a definir) |
| **Domínio** | contacts / opportunities / sellers |

> Nexa has three independent pillars: **TMS support**, **sales leads** and
> **proactive alert monitoring**. This feature touches the **sales leads** pillar
> only. Every design decision below is subordinate to one constraint: the other
> two pillars must not change behaviour, not even by accident.

---

## Revisão 2026-08-11 — módulo 1 e mercados

This section is authoritative where it disagrees with the rest of the document.
It was written after a design round with Abel on 2026-08-11 and after checking
the current `schema.prisma`, which already contains several things this PRD
describes as new.

### Two premises changed

**1. A human SDR makes first contact in this round.** The original PRD assumed
Lia opens, converses and qualifies every lead, with the seller only closing.
Decided 2026-08-11: Lia stays out of this round entirely. A human SDR opens the
lead using a script the manager wrote. Where Lia fits comes later.

Consequence: §Per-segment sales brain stops being a blocking prerequisite for
going live — a market can be worked by an SDR before Lia can talk about it. It
remains a prerequisite for *outbound by Lia*, and the sequencing rule still
holds for that path.

**2. `LeadSegment` is dropped. The concept already exists as "mercado".** ADR
037 named it and the schema implements it as `products` / `productCode`. The
comment at `schema.prisma:546` is explicit: a parallel `marketId` would give the
same concept two keys, so it must not be created. Every mention of
`LeadSegment` / `SegmentMember` below is superseded by mercado, with one
exception noted in §What must be created.

### What already exists (do not re-create)

Checked against `schema.prisma` on 2026-08-11:

| Concept | Where it already lives |
|---|---|
| Mercado | `products` + `productCode` (ADR 037) |
| Which mercado holds the WhatsApp thread | `AiConversation.productCode` — no `currentSegmentId` needed |
| Message template per mercado | `MessageTemplate` (schema.prisma:574) |
| Playbook per mercado | playbook keyed by `productCode` (schema.prisma:829) |
| Campaign belongs to a mercado | `Campaign.productCode` |
| Manual call / e-mail / note log | `SellerActivity` (`type`, `result`) — this is the SDR's outcome record |
| Immutable ownership + stage timeline | `OpportunityStageHistory` |
| "Lead parado" alert | `Opportunity.staleNotifiedAt` |
| "Call me back on X" | `Opportunity.pausedUntil` |
| Lead ownership | `Opportunity.assignedSellerId` and `Contact.ownerSellerId` |
| Opt-out / hard bounce (hygiene inputs) | `Contact.optOutAt`, `Contact.status`, `Contact.emailBouncedAt` |

### What must be created

Additive only, `migrate deploy`:

1. **`LeadBatch`** — as specified in §New tables. Still does not exist.
2. **`Opportunity.productCode`** (nullable) — the mercado of the work unit.
   `Opportunity` has no product column today.
3. **`Contact.batchId`** (nullable) — which list the lead came from.
4. **Seller ↔ mercado link** (`SellerMarket`) — the only part of `SegmentMember`
   with no equivalent. `Seller` carries no product relation, so "which markets
   may this SDR work" cannot be expressed today.

That is the whole list. `LeadAttempt` is **not** created — see below.

### Ownership — single source of truth

Two ownership fields exist and they overlap. Left undeclared, a seller sees a
lead on one screen and not on the other, and nobody can explain why.

| Field | Authority |
|---|---|
| `Opportunity.assignedSellerId` | **source of truth** for the SDR/closer workflow |
| `Contact.ownerSellerId` (added 2026-08-11) | filters the contacts/inbox screen only |

Distribution writes **both, in one `$transaction`**, from a single place in the
code. Two write sites is how they drift.

**Credit is not the same as the current worker.** `assignedSellerId` moves from
the SDR to the closer; the SDR who sourced the lead must not lose the record of
having sourced it, or nobody will ever pass a lead forward. The SDR's claim is
read from `OpportunityStageHistory` plus the `SellerActivity` rows they wrote —
both already immutable, both already dated.

**No commission column.** Percentage, tier and split are undecided as of
2026-08-11 and stay out of the schema until the rule exists. Money is out of
scope for Nexa by design (see §Business context). What matters is that the
*event* is recorded — every ownership change is already dated in
`OpportunityStageHistory`, and history cannot be reconstructed later, while a
nullable column can be added in one additive migration.

### Mercado sits on `Opportunity`, not on `Contact`

Unchanged from the original decision, and the reason still holds: one phone is
one WhatsApp thread. A transportadora may be a lead for TMS *and* for pneus —
two opportunities, two owners, one conversation at a time, enforced by
`AiConversation.productCode`.

**Consequence for import:** bringing a list into a mercado creates one
`Opportunity` per lead at `stage = 'new'`, carrying that mercado's
`productCode`. Without those rows the per-batch funnel has nothing to count, and
"which list is worth buying again" cannot be answered.

### Módulo 1 — "Preparar o trabalho do SDR"

One screen per mercado. Seven items. Single click on the chevron opens a short
summary (click target ~32px, larger than the glyph); double click on the row
opens an edit popup; `Esc` closes. Same interaction already used on
`CampaignsPage.tsx`.

| # | Item | Notes |
|---|---|---|
| 1 | Lista de leads | CSV upload + manual add. Hygiene runs **at import** |
| 2 | Distribuir entre SDRs | split across active / all to one / hold |
| 3 | Abertura da ligação | |
| 4 | Abertura do WhatsApp | |
| 5 | Abertura do e-mail | the only one with a subject line |
| 6 | Respostas por situação | shared across all three channels |
| 7 | Material de consulta | uses the existing knowledge base, **not** a PDF viewer |

**Only item 2 blocks.** Without an owner a lead exists for nobody. The other six
make the SDR work worse, not impossible — and a missing script means he
improvises, which is the outcome the module exists to prevent.

**Hygiene moves from send-time to import-time.** The filter already exists in
`email-campaign-sender.service.ts` and runs when a campaign fires. Running it at
import instead surfaces list quality before the operator commits to it, with a
report: how many arrived, how many were duplicates, already TMS customers,
invalid, competitors, opted out — and how many arrived **with no name**, since
that drives the greeting fallback.

**Override is allowed for one reason only: "já na base".** The other four stay
hard-blocked, each for a different non-negotiable reason:

| Motivo | Why it cannot be overridden |
|---|---|
| Opted out | LGPD. Not a preference |
| Invalid e-mail | burns sender-domain reputation for every later campaign |
| TMS customer | pitching what they already pay for is the worst possible call. Checks the TMS **or** `Contact.customerSince` — see §Módulo 3 |
| Competitor | hands them the sales script |

A generic "force selected" button is exactly how an opt-out returns to a list.

**Script lives on the mercado, not on the list.** Therefore a list must declare
its mercado at import. Openings differ per channel for technical reasons
(WhatsApp renders literal asterisks, e-mail needs a subject); objection
responses are shared so the three channels cannot drift apart.

`{{nome}}`, `{{remetente}}` and `{{saudacao}}` already work (`sender.service.ts`).
**Fallback with no name: `Bom dia! Aqui é o Mateus`** — never a dangling comma,
never a literal `null` read out loud on a call.

**Script versioning is per mercado, whole matrix at once** — one frozen version
of all seven items together, never per field. Per-field history costs real
tracking complexity to answer a question nobody asks.

For versioning to measure anything, the **call record must stamp the script
version that was on screen at that moment**. That belongs to the SDR module, but
it is named here because it cannot be reconstructed afterwards: without it the
version history is decoration.

**The SDR reads content and decides logistics.** Pass to closer, schedule a
callback with a date, book a meeting, mark no-answer, discard. He never edits
price, promise or script.

**Batch label.** Every lead carries the batch it came from, so months later the
list can be judged by outcome (`Feira agosto — 3 ganhos` vs `Lista comprada — 0`).

**Leads sitting idle: visible, not automatic.** A banner — *"Mateus: 40 leads
untouched for 5 days"* — plus manual redistribution. `staleNotifiedAt` already
exists to keep the same lead from re-alerting daily. Automatic return to the
pool is deliberately **not** built: with a two-SDR team it creates a race (he
called at 20:00, the job returned it at 20:01) and teaches the SDR to fake a
touch to reset the clock. Revisit when the operation is large enough that a
human cannot watch it.

**"Ausente" sellers receive nothing.** Vacation, sick leave, departure; their
leads fall back to the general pool. This is a **new** concept and must not be
confused with `Seller.outOfOffice` (ADR 034), which controls whether handoff
also pings WhatsApp — a different question with an inverted default.

### Import must never overwrite what Lia learned

Already the highest-severity risk in this PRD (R-1/R2) and it applies verbatim
to módulo 1: a re-imported lead fills **empty fields only**. A spreadsheet whose
`frota` column is blank must not erase the fleet size the lead stated in
conversation. The loss is silent and only surfaces later, when Lia re-asks
something already answered.

### `LeadAttempt` is not created — decided 2026-08-11

**Every mention of `LeadAttempt` below is superseded. Read `SellerActivity`.**

`SellerActivity` (schema.prisma:650) already records what the original PRD wanted
a new table for. Two tables answering "what happened on this lead" is the same
duplication this revision removed for mercado, one level down: the day someone
writes the call in one and the report reads the other, the funnel lies without
warning.

What the funnel needs, and where it already is:

| Need | Already available |
|---|---|
| channel | `SellerActivity.type` — `call \| email \| note`, free string, so `whatsapp` is a code change, not a migration |
| outcome | `SellerActivity.result` — same, so the SDR's codes (`passou_closer`, `sem_interesse`, `numero_errado`, `nao_e_decisor`) are additive text |
| "call me back Tuesday" | `Opportunity.pausedUntil` |
| which try is this | `COUNT` of the lead's activity rows |
| call duration | `SellerActivity.durationSec` |
| which batch | join through `Opportunity` → `Contact.batchId` |
| ownership/stage timeline | `OpportunityStageHistory` |

**The one real objection, and its answer.** R6 requires that nothing assume the
actor is human, so Lia can later be an operator. `SellerActivity.sellerId` is
required, so Lia cannot write there. That is not a gap — it is the split the
schema already makes: Lia's activity lives in `AiConversation` / `AiMessage`, and
`metrics.service.ts` already reads her side from there. The funnel reads both
sources; it does not need one table pretending to hold both. R6 is satisfied by
recording dispositions **through a service method** rather than only from the UI,
which costs nothing here.

Net effect: the activity log needs **no migration at all** — only new string
values. Módulo 1 comes down to one new table (`LeadBatch`), one new link
(`SellerMarket`) and two nullable columns.

### Still open (not blocking módulo 1)

- Commission rule — percentage, tier, SDR/closer split. Deferred by Abel on
  2026-08-11. Blocks nothing in módulo 1 because no commission column is created.
- O2 (LGPD basis per batch) and O3 (leads per seller) remain as recorded below.

---

## Módulo 2 — Mesa de trabalho do SDR (aprovado 2026-08-11)

Where the SDR spends the day: one screen, one lead at a time, dozens of calls.
Módulo 1 prepares the work; this is the work. Approved on 2026-08-11 as layout
and rules; not implemented.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Transportes Silva · Carlos Mendes            HiperTMS · Lote: Feira ago  │
│ (12) 98807-3788                                                          │
│ [ WhatsApp ]  [ Ligar ]  [ Copiar e-mail ]              lead 4 de 37 ▸   │
└──────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────┬──────────────────────────────┐
│ ROTEIRO — HiperTMS v3                     │ FICHA                        │
│                                           │ Frota      12 caminhões      │
│ ▸ Abertura da ligação                     │ E-mail     carlos@silva.com  │
│   "Bom dia, Carlos! Aqui é o Mateus..."   │ Origem     Feira Intermodal  │
│                                           │ Etapa      novo              │
│ ▾ Respostas por situação                  ├──────────────────────────────┤
│   ▸ "Já tenho sistema"                    │ HISTÓRICO                    │
│   ▸ "Quanto custa?"                       │ 09/08  Lia · e-mail aberto   │
│                                           ├──────────────────────────────┤
│                                           │ MATERIAL                     │
│                                           │ ▸ Tabela de planos           │
└───────────────────────────────────────────┴──────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ Anotação: [_______________________________________________________]      │
│ [Passar pro closer] [Ligar depois ▾] [Não atendeu] [Descartar ▾] [Próximo]│
└──────────────────────────────────────────────────────────────────────────┘
```

### Layout rules, each with its reason

| Rule | Why |
|---|---|
| The script owns the largest column and scrolls **independently** | it is what he reads while talking. If he has to scroll to find "quanto custa?", he improvises — the exact outcome módulo 1 exists to prevent |
| The action bar is **fixed** to the footer | five buttons used dozens of times a day; a constant position is muscle memory |
| The ficha is **read-only** here | correcting a phone or e-mail carries the overwrite risk of R2 and belongs to another screen |
| `[ Próximo ]` advances the queue and **writes nothing** | auto-advance after an action hijacks the screen while he is still editing a note |
| One timeline, two sources | human rows from `SellerActivity`, Lia's from `AiConversation` / `AiMessage`. The SDR must not have to know which system spoke |

### Actions

Every action writes one `SellerActivity` row and stamps the `roteiroVersaoId`
that was on screen at that moment. Without the stamp, módulo 1's script
versioning measures nothing and cannot be reconstructed afterwards.

| Button | Effect |
|---|---|
| Passar pro closer | `$transaction`: `assignedSellerId` **and** `ownerSellerId` → closer, `SellerActivity(result: passou_closer)`, row in `OpportunityStageHistory` |
| Ligar depois ▾ | asks date/time → `Opportunity.pausedUntil`; leaves the active queue until then |
| Não atendeu | `SellerActivity(result: nao_atendeu)` and nothing else |
| Descartar ▾ | asks the reason → `Opportunity.stage = 'discarded'` + `discardReason` |
| Próximo | advances only |

**Attempt count is `COUNT` of the lead's `SellerActivity` rows.** No counter
column — a stored counter can diverge from the rows it summarises, and one day
it will.

### Ownership on hand-off — revises the módulo 1 wording

Both ownership fields move to the closer, together, in one `$transaction`.

The earlier proposal froze `Contact.ownerSellerId` on the SDR so his "Passados"
tab would still find the lead. That breaks two ways: `ownerSellerId` filters the
**inbox**, so the lead's WhatsApp reply would keep landing on the SDR while the
closer — who now owns the deal — sees nothing; and the moment a manager
redistributes the lead, the frozen field is gone and the tab empties with no
explanation.

**The SDR's claim is history, not a frozen field.** The "Passados" tab lists
opportunities where the SDR has `SellerActivity` rows and is no longer the
assignee. Immutable, dated, auditable, and immune to any later redistribution.

### Closer role

No new entity. A closer is a `Seller`; what distinguishes them is permission and
`SellerMarket` membership, not a table.

### Channels — what each button actually does

| Button | Mechanism | Why |
|---|---|---|
| Ligar | native `tel:` | the PRD excludes telephony (no dialer, no recording). A protocol link is not an integration |
| WhatsApp | `wa.me` prefilled with the módulo 1 opening, from the **SDR's own** WhatsApp | the Nexa number is the campaign number. A Meta ban on it has no undo and would kill outbound for everyone (R-2). Trade-off: the text is not stored in Nexa, so the click writes `SellerActivity(type: whatsapp)` and the funnel still counts the touch |
| Copiar e-mail | `mailto:` with `subject` and `body` prefilled; the copy button takes the address alone | the clipboard is a single blob — subject and body copied together end up pasted into the body |

### One aggregated endpoint

`GET /sdr/next` (and `/sdr/lead/:id`) returns lead + script + ficha + timeline +
material in **one** payload. Five requests per lead, forty leads a day, is half a
second of dead time at every switch — and that is where the SDR starts keeping a
spreadsheet on the side.

Queue order respects `pausedUntil` (a lead waiting for its callback date is not
offered) and excludes sellers marked "Ausente".

### Structure

```
apps/frontend/src/pages/SdrWorkbenchPage.tsx          route /sdr
  components/sdr/
    LeadHeaderBar.tsx        name, company, phone, channel buttons, "4 de 37"
    ScriptPanel.tsx          script — left column, own scroll
    LeadCard.tsx             ficha, read-only
    LeadTimeline.tsx         SellerActivity + AiMessage in one timeline
    KnowledgeQuickList.tsx   material — reuses the existing knowledge search
    ActionBar.tsx            fixed footer: note + five buttons
    DispositionDialog.tsx    the ▾ of "Ligar depois" and "Descartar"
  entities/sdr/api/sdr.api.ts

apps/backend/src/application/sdr/
  sdr-queue.service.ts         next lead; respects pausedUntil and "Ausente"
  sdr-disposition.service.ts   the five actions, each in its own $transaction
apps/backend/src/presentation/http/sdr/
  sdr.controller.ts            @RequirePerm('telemarketing'), scoped by assignedSellerId
```

### Deliberately not built

Dialer and call recording · automatic advance to the next lead · editing the
ficha on this screen · sending WhatsApp or e-mail through the Nexa number ·
operator available/paused state.

---

## Módulo 3 — Closer: reunião e fechamento (aprovado 2026-08-11)

Starts exactly where módulo 2 ends: the lead the SDR handed over. Approved as
layout and rules on 2026-08-11; not implemented.

### The default view is the day, not a kanban

Everyone builds a kanban for the closer. It is the wrong default. A kanban
answers *"how is my pipeline"* — a closer with fifteen open deals does not wake
up with that question, he wakes up with *"what do I do today?"*. A board forces
him to sweep four columns to discover he has a meeting at 15:00 and a proposal
that has been silent for eight days.

So: **the day is the default tab. Pipeline is the second.**

```
  ┌ HOJE ┬ Pipeline ┬ Fechados ┐
  │                                                                        │
  │  AGORA                                                                 │
  │  15:00  Transportes Silva · reunião          [Abrir] [Remarcar]        │
  │                                                                        │
  │  PRECISA DE VOCÊ                                                       │
  │  Rodoviário Costa · proposta enviada há 8 dias, sem resposta           │
  │  Log Minas · voltou hoje do "sem orçamento" (adiado em 12/05)          │
  │  Expresso Sul · recebido do Mateus ontem, sem contato                  │
  │                                                                        │
  │  ESPERANDO                                                             │
  │  4 propostas em análise · 2 reuniões esta semana                       │
  └────────────────────────────────────────────────────────────────────────┘
```

| Block | Rule |
|---|---|
| AGORA | `meetingAt` falls today |
| PRECISA DE VOCÊ | proposal with no movement past a threshold · `pausedUntil` reached today · assigned by the SDR with no closer activity yet |
| ESPERANDO | everything else still open — future meetings, proposals inside the threshold |

A deal in none of the three does not need him today, and that is information
rather than an omission.

### The deal

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Transportes Silva · Carlos Mendes · (12) 98807-3788                      │
│ HiperTMS · Lote Feira ago · veio do Mateus em 10/08   proposta · R$ 1.200│
│ [ WhatsApp ]  [ Ligar ]  [ E-mail ]                                      │
└──────────────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────┬──────────────────────────────┐
│ HISTÓRICO                                 │ O NEGÓCIO                    │
│ 11/08  Mateus · ligou, agendou reunião    │ Valor      R$ 1.200/mês      │
│ 11/08  Mateus · passou pro closer         │ Reunião    14/08 15:00       │
│ 10/08  Mateus · ligou, não atendeu        │ Frota      12 caminhões      │
│ 09/08  Lia · e-mail aberto                │ Etapa      proposta          │
│                                           ├──────────────────────────────┤
│                                           │ MATERIAL                     │
└───────────────────────────────────────────┴──────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ [Agendar reunião] [Registrar proposta] [Ganhou] [Perdeu ▾] [Devolver ▾]  │
└──────────────────────────────────────────────────────────────────────────┘
```

**The timeline carries the SDR's work and Lia's, whole.** The closer joins the
call already knowing what was said — the difference between "tell me again what
you need" and "Mateus said you issue around 400 CT-e a month". Same three
sources as módulo 2, same single list.

Channel buttons behave exactly as in módulo 2 (`tel:`, `wa.me`, `mailto:`) and
for the same reason: the Nexa number is the campaign number.

### Actions

| Button | Effect |
|---|---|
| Agendar reunião | `meetingAt` + `meetingUrl` (optional) → `stage='qualified'` |
| Registrar proposta | asks the value → `Opportunity.value` → `stage='proposal'` |
| Ganhou | `$transaction`: `stage='won'` + `Contact.customerSince = now()` |
| Perdeu ▾ | **definitive** → `stage='lost'` + `discardReason` · **timing** → asks a return date → `stage='paused'` + `pausedUntil` |
| Devolver ▾ | asks the reason → `$transaction`: **both** ownership fields back to the origin SDR + row in `OpportunityStageHistory` |

**Return is not a rejection queue.** No acceptance step exists — the lead lands
in the closer's list the moment the SDR hands it over. Return is the counterweight
to that: it costs a mandatory reason, and the reason makes "return rate per SDR"
readable. The returned lead reappears in the SDR's **active** list, not in his
"Passados" tab, because it is his work again — the same ownership rule as módulo 2
produces this for free.

### `Contact.customerSince` — closing a real leak

Módulo 1's hygiene filter excludes TMS customers by asking the TMS. A contract
signed today may not be in the TMS for days: the lead signs on Monday and gets a
cold prospecting campaign on Thursday, from a different SDR, for the product he
just bought.

So `won` stamps `Contact.customerSince` in the same transaction, and **módulo 1's
filter checks both sources**: TMS lookup **OR** `customerSince IS NOT NULL`. This
revises the hygiene list in §Módulo 1.

### Meeting: recorded, not integrated

Nexa stores date/time and an optional link. No Google Calendar or Outlook
sync — invites, dynamic Meet links, time zones, cancellations and two-way
reconciliation are a project of their own, and the CRM's job here is the stage,
not the calendar.

### Database

Already exist, no migration: `Opportunity.value` (`Decimal(12,2)`), `stage`
(already includes `qualified` · `proposal` · `paused` · `won` · `lost`),
`pausedUntil`, `discardReason`, `OpportunityStageHistory`.

Create (additive, `migrate deploy`): `Opportunity.meetingAt` (`DateTime?`),
`Opportunity.meetingUrl` (`String?`), `Contact.customerSince` (`DateTime?`).

Note on §Business context: `Opportunity.value` predates this module and holds an
*estimated pipeline value*, not money owed. The boundary in that section still
holds — no invoice, no payment, no commission split, no PDF. Without the value,
a report can only say "three deals closed" and never whether they were R$ 200 or
R$ 50.000 each.

### Deliberately not built

Calendar integration · proposal/PDF generation · invoicing, payment or
commission · acceptance queue before the lead reaches the closer · kanban as the
default view.

---

## Problem

Lead supply and lead conversion are becoming two different teams. Planning
sources the leads (lists, trade shows, inbound forms) and telemarketing works
them. Today Nexa has no object representing "the batch that planning delivered"
and no record of "what happened on each contact attempt".

Without those two records the operation cannot answer its central question:
**when the target is missed, was the list bad or was the approach bad?** That
argument is unwinnable without data, and it is the argument that kills
telemarketing operations.

Secondary gap: leads are not partitioned by who they belong to. Every seller
currently competes for every hot lead (`Seller.assignedCount` is tenant-wide),
so a tyre-partner lead can land on a seller who only sells HiperTMS.

## Objetivo & métricas de sucesso

- **Objetivo:** measure conversion per batch and per seller, on the same
  funnel, so lead supply and seller execution are both accountable — and route
  each partner's leads only to the sellers assigned to that partner.
- **Como medimos sucesso:**
  - conversion rate per batch is visible within 30 days of go-live;
  - ≥ 95% of contact attempts carry a disposition code;
  - zero tyre leads assigned to a TMS-only seller, and vice versa;
  - zero regressions in support and monitoring pillars (no incident, no change
    in their error rate).

## Escopo

### Dentro do escopo

- `LeadSegment` + `SegmentMember` — one segment per partner, with the sellers
  allowed to work it.
- `LeadBatch` — the delivery unit from planning, scoped to a segment, with
  dedup/hygiene counters.
- ~~`LeadAttempt`~~ — **dropped 2026-08-11.** The attempt log is the existing
  `SellerActivity` for humans and `AiConversation` / `AiMessage` for Lia. See
  §`LeadAttempt` is not created.
- Segment-aware handoff — a hot lead only reaches a seller who is a member of
  its segment (R8, Phase 3).
- Disposition bar added to the existing seller screen — no new place to work
  leads.
- Supervisor panel — funnel per batch and per segment.
- Access control for all of the above (see §Access control).

### Business context (decided 2026-08-04)

Nexa is the **lead machine** of a commission-based sales operation. Partners
(tyre supplier, HiperTMS, others) are sold by in-house sellers; Nexa controls
the leads that go out and the employees who work them through to closing.

**Money is explicitly not Nexa's job.** Order value, invoicing, payment and
commission belong to a separate marketplace product, not yet built. Nexa
records only *that* a deal closed — never the amount. When the marketplace
exists it can be connected, and seller performance will then be measurable in
revenue terms; until then, performance is activity and conversion.

**Nexa is internal.** No partner logs in. No partner-facing isolation is
required, so `LeadSegment` needs no tenant-grade separation — normal
permissions are enough.

### Fora do escopo

- **Anything with a currency sign.** No sale value, no order, no invoice, no
  payment, no commission calculation. `closed_won` records that a deal closed
  and nothing more. This boundary is deliberate — the moment Nexa stores an
  amount it starts becoming a financial system through the back door, and that
  is the marketplace's job.
- Partner logins and partner-facing views.
- Voice calls, dialer, call recording. **Open question O1** — if "telefone"
  means real voice, that is a separate PRD with its own regulatory surface.
- Replacing the current `InboxPage`. It keeps working, untouched.
- Changing how messages are sent (`sender`, `SenderNumber`, WAHA).
- Changing the router, the support agent, or the proactive engine.
- Robot/AI as operator. Designed for (see R6) but not built here.

## Requisitos

- **R1 —** Planning uploads a batch; the system reports how many arrived, how
  many were duplicates, how many were invalid, how many entered the working set.
- **R2 —** A batch import **never overwrites data learned from conversation**.
  Fields captured by Lia (`Contact.name` when `nameSource != 'manual'`,
  `company`, `fleetSize`, `interestScore`, `leadStatus`) are fill-if-empty only.
  See §Riscos R-1 — this is the highest-severity risk in the feature.
- **R3 —** Every contact attempt produces a `LeadAttempt` row, including attempts
  made by Lia.
- **R4 —** An attempt cannot be closed without a disposition code (enforced in
  the workspace UI; the API accepts a null disposition only for
  observer-recorded rows in Phase 1).
- **R5 —** Operators see only leads assigned to them. Supervisors see all.
  Enforced **in the service layer**, not only in the UI.
- **R6 —** `LeadAttempt` records *who executed*, not *which person executed*.
  `actorType` distinguishes `ai` from `human` from day one, so introducing Lia
  as an operator later is configuration, not migration.
- **R7 —** Phase 1 changes no existing behaviour (see §Phases).
- **R8 —** A campaign belongs to a segment. Replies to it land in that segment
  and are assigned only to sellers who are members of it. A pneus seller never
  receives a TMS lead unless an admin has added them to both segments.
- **R9 —** A seller may belong to more than one segment. Membership is granted
  by an admin, one `SegmentMember` row per segment. This is the mechanism for
  "libera o fulano pra vender os dois".
- **R10 —** Segment-aware assignment must be **opt-in per conversation**. When a
  conversation has no segment, `pickAndClaimSeller` behaves byte-for-byte as it
  does today. See §Segment-aware handoff.

## Fluxos / UX

**The existing flow stays.** Confirmed 2026-08-04. Lia is already tier-1 and
remains so: campaigns go out, Lia converses, and when the lead crosses the
interest threshold she hands it to a seller on the screen that already exists.
This feature does **not** insert a human into the first contact and does not
replace that flow — it segments it, and it measures it.

```
planning uploads batch  →  batch belongs to a segment
        ↓
campaign fires (segment inherited)      ← today, unchanged except segmentId
        ↓
Lia converses, scores, qualifies        ← today for HiperTMS; a new segment
                                           needs its brain first (see
                                           §Per-segment sales brain)
        ↓
score ≥ threshold → handoff             ← today, but now segment-aware (R8)
        ↓
seller works the lead on the existing   ← today (Opportunity funnel,
seller screen                              docs/features/seller-leads)
        ↓
seller records the disposition          ← NEW
        ↓
funnel per batch / per segment / per    ← NEW
seller
```

**What is actually new**, in order of value:

1. `segmentId` on batch, campaign and opportunity — so the pneus seller only
   ever sees pneus leads;
2. segment-aware handoff (R-6) — without it, step 1 is decorative;
3. disposition recorded on the existing seller screen — the missing data;
4. `LeadBatch` + `LeadAttempt` — so conversion can be read per source;
5. supervisor panel with the per-batch funnel.

**Handoff threshold.** Today the hot-lead cut is a fixed score (≥ 70). It
becomes a per-segment setting, because a pneus list and a TMS list will not
qualify at the same bar. Default stays 70, so nothing changes until someone
edits it.

**Seller screen.** Extends the existing Opportunity screen rather than adding a
parallel one: batch and segment context on the lead, plus the disposition bar.
No second place to work leads.

**Supervisor panel.** Funnel per batch (received → contacted → replied →
qualified → closed) with side-by-side batch comparison; conversion by segment,
by batch and by seller.

## Modelo de dados / API

### Segments (carteiras) — why they sit on Opportunity, not on Contact

Leads are worked by different teams per partner ("TMS", "Pneus"). A segment
groups leads and the sellers allowed to see them.

**A segment must not live on `Contact`.** `Contact` is unique per
`(tenantId, phone)` and one phone is one WhatsApp thread. If the same
transportadora is a lead for two segments, two teams — and two versions of
Lia's playbook — would be writing into the same chat, and the lead sees one
conversation from one company. Segment therefore lives on `Opportunity`: one
contact, two opportunities, two owners, but **one active conversation at a
time**.

`AiConversation.currentSegmentId` records which segment currently holds the
thread. A second segment may work the same contact only after the first
releases it, or through an explicit handover. Without this rule the split
produces a worse lead experience than having no segments at all.

**Decided 2026-08-04 (revises the earlier answer to O4):** a segment is a
**partner's product that Lia herself sells**. Nexa runs an outsourced,
commission-based sales operation for partner companies (tyres, HiperTMS,
others); Lia does the first contact for **every** segment, and an in-house
seller closes.

That makes the per-product sales brain a hard prerequisite, not a future
option. See §Per-segment sales brain.

### Per-segment sales brain (blocking prerequisite)

Lia sells every segment (decided 2026-08-04). Today she is hard-wired to
HiperTMS in four places. **Firing a tyre campaign before these are fixed means
she pitches CT-e to a lead who wants tyres** — the failure is immediate,
visible to the lead, and damages the partner relationship, not just a metric.

| What | Today | Needs to become |
|---|---|---|
| Playbook — persona, CTA per temperature, objection library, signup URL | one row per **tenant** (`playbook.service.ts:66`) | one per segment, falling back to the tenant default |
| Knowledge retrieval | `sales-agent.service.ts:66` filters only by category, never by product | filtered by the segment's product, so tyre leads never retrieve TMS articles |
| Plan catalog | `productCode ?? 'hipertms'` (`sales-agent.service.ts:64`) | per segment; a segment with no catalog must degrade gracefully, not silently fall back to HiperTMS plans |
| Closing link | `cfg.signupUrl` points at HiperTMS signup | per segment — a tyre lead is not sent to the TMS signup page |

`AiConversation` and `AiKnowledgeBase` already carry `productCode`, so the
plumbing is half-built. `Contact` does not carry it and does not need to — the
product lives on the opportunity and the segment, per §Segments.

**Sequencing rule:** a segment cannot be activated for outbound until its brain
exists. Enforce it — `LeadSegment.status` may not become `active` without a
playbook and at least one knowledge article for its product.

### New tables (additive only)

```
-- SUPERSEDED 2026-08-11: LeadSegment and SegmentMember are NOT created.
-- Mercado already exists as `products` / `productCode` and ADR 037 forbids a
-- parallel key (schema.prisma:546). Read "segment" as "mercado" throughout this
-- document. The only surviving piece of SegmentMember is the seller<->mercado
-- link below, which has no equivalent in the schema today.

SellerMarket                          -- replaces SegmentMember
  id, tenantId
  sellerId                            -- reuses the existing Seller record
  productCode                         -- the mercado this seller may work
  role                                -- seller | lead  (drives telemarketing
                                      -- vs telemarketing_segment scope)
  @@unique([sellerId, productCode])

LeadBatch
  id, tenantId
  productCode                         -- planning delivers INTO a mercado
  name, source, sourceDetail          -- "feira intermodal", "lista sintegra sp"
  consentBasis                        -- LGPD basis; see Riscos R-3
  uploadedByUserId
  receivedCount, duplicateCount, invalidCount, validCount
  status                              -- draft | active | exhausted | archived
  createdAt

LeadAttempt                           -- the heart of every report
  id, tenantId
  contactId, batchId?, opportunityId?, conversationId?
  channel                             -- whatsapp | email
  actorType                           -- ai | human            (R6)
  actorSellerId?, actorUserId?
  attemptNo                           -- 1st, 2nd, 3rd try
  outcome?, outcomeAt?                -- disposition code
  callbackAt?                         -- "call me Tuesday 2pm"
  startedAt, endedAt?, createdAt
  @@index([tenantId, batchId])
  @@index([tenantId, outcome])
  @@index([tenantId, callbackAt])
```

No `OperatorSession` table. Available/paused/offline state belongs to a
call-centre queue, and there is no queue here — Lia holds the line until a lead
is hot, then a seller works it on the existing screen. Build it only if
Phase 3 experience shows a real need (see §Phase 3).

### Changed tables

```
Contact
  + batchId String?                   -- NULLABLE. Existing rows stay null.
                                      -- NOTE: no productCode here, on purpose —
                                      -- the mercado lives on the opportunity.

Opportunity
  + productCode String?               -- NULLABLE. Existing rows stay null and
                                      -- behave exactly as today (no mercado =
                                      -- visible under the legacy own/all rule).

AiConversation                        -- NOTHING TO ADD (revised 2026-08-11):
                                      -- `productCode` already exists and already
                                      -- records which mercado holds the thread.

Campaign                              -- NOTHING TO ADD (revised 2026-08-11):
                                      -- `productCode` already exists; replies
                                      -- inherit it (R8).
```

Nothing else changes. No column is renamed, retyped or dropped. Every added
column is nullable, so every existing row keeps its current behaviour.

### Segment-aware handoff (the one existing behaviour that must change)

`sellers.service.ts:141 pickAndClaimSeller` currently claims the active seller
with the lowest `assigned_count` **in the whole tenant**, with no notion of
segment. Left as is, a hot pneus lead can be handed to the TMS seller — the
exact outcome R8 forbids.

This is the only place in the feature that modifies a live path, and it is the
same file family involved in the 2026-07-09 handoff incident. It changes under
one rule:

```
pickAndClaimSeller(tenantId, productCode?)      -- revised 2026-08-11

  productCode == null  ->  query is unchanged, literally the current SQL
  productCode != null  ->  same query + AND id IN (
                             SELECT seller_id FROM seller_markets
                             WHERE product_code = $productCode)
```

Legacy conversations carry no segment, so they keep taking the current path.
The new path is only reachable once segments exist and a campaign or
opportunity carries one.

**Starvation rule.** If a segment has no available seller, the lead is **not**
spilled to another segment — it stays unassigned and waits. That is the correct
behaviour under R8 but it is a silent failure mode, so it must emit a warning
(`no seller available in segment X`) and surface on the supervisor panel.
Repo principle: no discard path without an explicit log.

**Inbound with no segment.** A cold inbound message has no campaign to inherit
from. Resolution order: (1) the contact's most recent open opportunity's
segment; (2) the tenant's default segment, if configured; (3) unassigned,
visible to supervisors only. Never a silent guess.

### What counts as an attempt (design rule — do not skip)

An attempt is **not** a message. Phase 1 hangs off `message.created`, so without
an explicit rule the listener would write one `LeadAttempt` per message, making
`attemptNo` meaningless and the table grow with conversation volume rather than
with work done.

Rule:

- An attempt **opens** on the first outbound message to a contact when that
  contact has no attempt open.
- It stays open while the exchange continues. Inbound and outbound messages
  inside an open attempt update `endedAt`; they do **not** create rows.
- It **closes** when a disposition is recorded, or automatically after
  `ATTEMPT_IDLE_HOURS` (proposed: 48h) with `outcome = no_answer`.
- The next outbound message after a close opens attempt `attemptNo + 1`.

Consequence: one row per *try*, not per message. A three-message back-and-forth
is one attempt. Reaching out again next week is attempt 2.

**Volume.** Roughly one row per contact per try, so a 1.000-lead batch with a
3-try cadence produces ~3.000 rows. Negligible. Retention: none planned; if it
ever matters, `LeadAttempt` is safe to archive by `createdAt` because every
report reads it in aggregate.

### Funnel metric definitions (agree before building charts)

The charts are worthless if two people read "contacted" differently. Each step
is defined against concrete data:

| Step | Definition |
|---|---|
| received | `LeadBatch.receivedCount` — raw rows in the upload |
| valid | `receivedCount` minus duplicates, invalid numbers and opted-out |
| contacted | contacts with ≥ 1 `LeadAttempt` whose outbound message was delivered |
| replied | attempts with ≥ 1 inbound message |
| qualified | contact reached `Opportunity.stage = 'qualified'` |
| closed | `Opportunity.stage = 'won'` |

Two traps worth naming: *contacted* means delivered, not sent — a number that
does not exist on WhatsApp is the single biggest silent loss in a cold batch
(see the bad-batch example that motivated this feature). And every rate is
computed over **valid**, never over **received**, or a dirty list flatters
itself.

### Disposition codes (`LeadAttempt.outcome`)

`closed_won` · `callback_scheduled` · `considering` · `no_interest` ·
`no_answer` · `wrong_number` · `invalid_number` · `opted_out` ·
`not_decision_maker`

Kept as a string column (not a Postgres enum) so adding a code later is a code
change, not a migration.

### Reused as-is (no changes)

`Contact` · `Opportunity` + `OpportunityStageHistory` (the evolution timeline
already exists) · `Seller` + round-robin handoff · `Campaign` /
`CampaignTarget` / `SenderNumber` (window, daily limit, anti-ban) ·
`FollowupService` · the `message.created` event · `PlaybookService`.

---

## Access control

The existing model is sufficient. **No new `UserRole` is added** — `UserRole` is
a Postgres enum, so a new value is a migration and is not trivially reversible.
Permissions are a `String[]` on `User` and cost nothing to add or remove.

### New permissions

| Permission | Grants | Typical holder |
|---|---|---|
| `telemarketing` | the existing seller screen; **own** leads only | seller |
| `telemarketing_segment` | every lead in the segments they belong to | segment lead (`SegmentMember.role = 'lead'`) |
| `telemarketing_supervisor` | all segments, all sellers, reassign, funnel panel | gestor comercial |
| `lead_batches` | upload and manage batches, batch performance | planning |

`PermissionsGuard` already grants everything to `role === 'admin'`, so the
platform admin needs no change.

### Visibility scopes

Three levels, resolved server-side in this order:

| Scope | Rule |
|---|---|
| `own` | `Opportunity.assignedSellerId = me` |
| `segment` | `Opportunity.segmentId IN (segments where I am a member)` |
| `all` | no segment filter |

Mercado membership comes from `SellerMarket` (revised 2026-08-11), keyed by the
user's `sellerId`, and `Opportunity.segmentId` above reads
`Opportunity.productCode`.
A user with no membership and only `telemarketing` sees `own` — which is
exactly today's behaviour, so existing users are unaffected by the new layer.

### Seller identity

A telemarketing seller is an existing `User` with `role = 'vendedor'` and
`sellerId` set, plus the `telemarketing` permission — the same identity already
used by `docs/features/seller-leads`. `Opportunity.assignedSellerId` already
exists and already scopes leads by seller — R5 reuses it rather than inventing a
second ownership concept.

### Enforcement rule (important)

`apps/frontend/src/components/Layout.tsx` gates menu items by permission
strings, and two of them (`dashboard`, `inbox`) are **not** enforced by any
`@RequirePerm` on the backend. Hiding a menu item is not access control.

Every new endpoint in this feature must carry `@RequirePerm`, and every list
endpoint must additionally scope by `assignedSellerId` for non-supervisors. The
frontend gate is cosmetic and is added only so the menu looks right.

---

## API surface

All under the global `/api` prefix. Every route carries `@RequirePerm`; every
list route additionally applies the scope rules in §Visibility scopes. New DTOs
declare every field explicitly — `forbidNonWhitelisted` is global, and a field
missing from a DTO is a 400 (REGRA 1, the 2026-07-09 incident).

| Route | Perm | Notes |
|---|---|---|
| `POST /lead-batches` | `lead_batches` | upload; returns hygiene counters |
| `GET /lead-batches` | `lead_batches` | list with funnel per batch |
| `GET /lead-batches/:id/performance` | `lead_batches` | funnel + attempt curve |
| ~~`GET /segments`~~ | — | dropped: mercado is already served by the markets module (ADR 037) |
| ~~`POST /segments` · `PATCH /segments/:id`~~ | — | dropped: same |
| `POST /markets/:productCode/sellers` · `DELETE .../sellers/:sellerId` | `admin` | grants "vende os dois" (R9), via `SellerMarket` |
| `POST /lead-batches/:id/distribute` | `lead_batches` | módulo 1 item 2 — writes both ownership fields in one `$transaction` |
| `POST /opportunities/:id/attempts/:attemptId/disposition` | `telemarketing` | closes the attempt on the existing seller screen (R4) |
| `GET /telemarketing/supervisor` | `telemarketing_supervisor` | funnel panel |

No queue endpoint, no operator-state endpoint. There is no new place to work
leads — see §Phase 3 for why the classic call-centre pieces (available/paused
state, inbound queue) are deliberately out of scope.

**Real-time.** The supervisor panel reuses the existing socket.io gateway
(`presentation/ws/`) rather than polling, for live conversion numbers as
dispositions come in.

**No TMS contract change.** None of these routes is consumed by the TMS, so the
contract checklist in REGRA 1 does not apply to this feature. If that ever
changes, it becomes a separate commit with its own impact note.

## Frontend

New routes, no existing seller-facing page modified:

- `/telemarketing/supervisor` — funnel panel (perm `telemarketing_supervisor`)
- `/lead-batches` — planning (perm `lead_batches`)
- `/segments` — segment and membership management (perm `admin`)

The disposition bar and batch/segment context are added **inside** the existing
Opportunity screen (`OpportunitiesPage`, per `docs/features/seller-leads`), not
on a new route.

Nav entries go in `apps/frontend/src/components/Layout.tsx` alongside the
existing sales block, using the same `perm` key as the backend guard so the two
cannot drift. Reminder from §Enforcement rule: the nav gate is cosmetic.

## Migration & backfill

Three migrations, all additive, all applied with `migrate deploy`. Never
`migrate dev`, `reset` or `db push` — the local `.env` points at the production
database (REGRA 5).

Revised 2026-08-11 — three became two, because mercado already exists:

1. `SellerMarket` + `LeadBatch`
2. nullable columns: `Contact.batchId`, `Opportunity.productCode`

No `LeadAttempt` migration: the activity log is `SellerActivity`, which already
exists, and its `type` / `result` are free strings — new codes are a code change.

`AiConversation` and `Campaign` need no migration — both already carry
`productCode`. No `marketId` is created, ever (ADR 037, `schema.prisma:546`).

**Backfill: none.** Existing contacts, opportunities and conversations keep
`segmentId = null` and `batchId = null`, which resolves to today's behaviour by
design (R10). No legacy batch is invented, no historical attempt is
reconstructed — the funnel simply starts on go-live day, and that is honest
data rather than a fabricated baseline.

**Windows note.** `prisma generate` locks the query engine DLL; the local
backend must be stopped before running it and restarted after (CLAUDE.md).

## Rollback

| Change | How it is undone |
|---|---|
| New tables | left in place, unreferenced — nothing reads them |
| Nullable columns | left in place, all null — behaviour is pre-feature |
| New routes/pages | permission not granted → invisible and 403 |
| Phase 3 behaviour | feature flag off, no deploy needed |
| Segment-aware handoff | conversations with `segmentId = null` take the legacy path automatically |

The only step without a clean rollback is the first batch import (R-1). It is
the one action that requires a backup beforehand.

## Related decisions

Two choices here are architectural and should be captured as ADRs rather than
buried in a PRD:

- segment lives on `Opportunity`, not on `Contact`, because one phone is one
  WhatsApp thread (§Segments);
- team separation uses permissions plus `SegmentMember`, not a new `UserRole`,
  because `UserRole` is a Postgres enum and permissions are a string array
  (§Access control).

## Phases

### Phase 1 — schema + observer (changes nothing)

Create the tables and the nullable columns. Add a listener on the existing
`message.created` event that opens and updates `LeadAttempt` rows for the
conversations Lia already runs, following §What counts as an attempt.

The send path is not modified and does not depend on the listener. **The
listener must wrap its entire body in try/catch** and swallow its own errors
into the log — an unhandled rejection in an `@OnEvent` handler can surface in
the emitting flow.

Outcome: the schema is live and already collecting real data before any human
touches a screen, which is the chance to find a wrong metric definition
*before* the workspace is built on top of it.

### Phase 2 — segments and disposition (the actual deliverable)

Segments, members, batch upload, `segmentId` on campaigns, the disposition bar
on the **existing** seller screen, and the supervisor panel.

No new place to work leads. The seller keeps working where they work today; the
screen gains batch/segment context and the disposition bar. `InboxPage`
untouched.

### Phase 3 — segment-aware handoff, behind a flag

The only change to a live path (R-6): assignment starts respecting segment
membership, and the hot-lead threshold becomes per-segment. Enabled per tenant
by flag. If it goes wrong, flip the flag — no deploy needed to roll back.

Everything else that a classic call centre would need here — operator
available/paused state, inbound queue with waiting time, simultaneous-lead
limits — is **deliberately deferred**. Lia holds the queue, so the seller is not
staffing one; `Seller.outOfOffice` already covers "don't route to me". Build it
only if the operation later reports a real problem it would solve.

### Phase 4 — Lia closing, not only qualifying (not in this PRD)

By the end of Phase 3, Lia does first contact for every active segment (gated
by §Per-segment sales brain) and a human seller closes. Phase 4 is her going
further into the close itself. That is why R6 and the two constraints in
§IA / Autonomia exist. Nothing in Phases 1–3 may make it harder.

---

## IA / Autonomia

**Lia already drives first contact, for every segment.** Decided 2026-08-04:
this is not a human-operated module in the call-centre sense — Lia opens,
converses and qualifies every lead, same as she does for HiperTMS today. A
segment goes live only once it has a brain (§Per-segment sales brain); until
then it cannot be activated for outbound at all, so Lia is never put in front
of a lead she cannot talk about competently.

The seller's job is the close and the disposition — not the first contact.
Their own manual attempts (a callback call, a follow-up) are also
`LeadAttempt` rows, `actorType = 'human'`, alongside Lia's `actorType = 'ai'`
rows from the same conversation. Both feed the same funnel.

`R6` exists for the piece that is still ahead: Lia closing the deal herself,
not only qualifying it (Phase 4). Two things must hold for that transition to
stay configuration rather than migration:

- no column, query or screen may assume `actorType = 'human'`;
- dispositions are recorded through a service method, not only from the UI, so a
  non-UI actor can call it.

Nothing here requests an irreversible action, so `action-policy.ts` (ADR 012) is
unaffected.

---

## Riscos & dependências

**R-1 (severity: high) — batch import overwriting conversation data.**
`Contact` is unique per `(tenantId, phone)`. A re-imported lead that already
exists must not have its name, company, fleet size or score replaced by
spreadsheet values. Losing them is silent and only becomes visible later, when
Lia starts re-asking questions the lead already answered. Mitigation: R2, plus
run the first import against 10 leads before 1.000, plus a backup before the
first real run. This is the only step in the feature with no clean rollback.

**R-2 (severity: high) — number ban.** `sender` and `SenderNumber.dailyLimit`
are out of scope precisely because a Meta ban has no undo: the number and every
conversation in it are lost. No phase touches the send path.

**R-3 (severity: medium) — LGPD basis for cold outbound.** Batch sources differ
in kind: a trade-show list carries consent, a scraped or purchased list does
not. `LeadBatch.consentBasis` is recorded per batch so the exposure is at least
visible. Legal call, not a technical one — **Open question O2**.

**R-4 (severity: low) — shared surfaces.** Support and sales share four things:
the router, the conversation table, the knowledge base (category-filtered), and
the WhatsApp sender. This feature touches none of them. Any change that starts
to touch one is out of scope by definition and needs its own approval.

**R-5 — connection pool.** The DO database caps at 22 connections. New
background work (the Phase 1 listener, any scheduled aggregation) must reuse the
existing `PrismaService`; no new client.

**R-6 (severity: high) — handoff is live code.** R8 forces a change in
`pickAndClaimSeller`, the assignment path. Handoff was the subject of the
2026-07-09 production incident and was otherwise on this feature's do-not-touch
list. It is in scope only under the null-segment guarantee in §Segment-aware
handoff, it ships in Phase 3 behind the flag (never in Phase 1), and it needs a
regression test proving the legacy path is unchanged before anything else in
that file is touched. The concurrency behaviour (`FOR UPDATE SKIP LOCKED`, added
to fix a real double-assignment bug) must be preserved exactly — do not rewrite
the query, only add the membership filter.

### Open questions (blocking design, not blocking Phase 1)

**Decided 2026-08-04:**

- **O1 — channels.** Planning delivers whatever it has: phone, e-mail,
  WhatsApp. The batch accepts all of them and stores what came. `LeadAttempt.channel`
  therefore includes `voice`, but **as a manual log only** — the operator calls
  from their own phone and records the outcome. No dialer, no recording, no
  telephony integration in this PRD. If real voice infrastructure is ever
  wanted, it is a separate project with its own regulatory surface.
- **O4 — segment is a list, not a product.** See §Segments.
- **O5 — thread ownership.** A contact may be a lead in more than one segment.
  The first segment to open a conversation holds the thread until it closes its
  opportunity or hands over explicitly.
- **Starvation.** A lead in a segment with no available seller waits; it is
  never spilled into another segment. Must warn and surface on the supervisor
  panel (see §Segment-aware handoff).

**Still open:**

- **O2 —** Where do the leads come from? Determines R-3 (LGPD basis) and the
  realistic contact rate. Recorded per batch in `LeadBatch.consentBasis`
  regardless, so the exposure is visible even before the answer.
- **O3 —** How many hot leads can one seller carry before the hand-off
  threshold needs tightening per segment? Sizes the sales team per partner.
  Needed before onboarding a new partner segment, not before Phase 1.

---

## Testes

- `LeadBatch` import: duplicate detection; **R2 non-overwrite assertions per
  protected field** (the critical test of this feature); opted-out exclusion.
- `LeadAttempt` listener: writes on `message.created`; **throws internally →
  message flow still completes** (regression test for R-4/Phase 1).
- Permissions: seller without `telemarketing_supervisor` cannot read another
  seller's leads via the API directly, not only via the UI (R5); a seller in
  segment A cannot read a segment B lead by guessing its id.
- Handoff (R-6), in this order:
  1. **regression first** — conversation with no segment assigns exactly as it
     does today, including the concurrency behaviour under parallel hot leads;
  2. lead in segment A never lands on a seller who is only in segment B;
  3. seller belonging to A and B is eligible for both (R9);
  4. segment with no available seller leaves the lead unassigned **and logs**,
     rather than spilling to another segment.
- Migration: applies cleanly with `migrate deploy`; existing `Contact` rows keep
  `batchId = null` and every existing query still returns the same rows.

---

## CHECKLIST FINAL

```
[ ] Type-check frontend zero erros / build backend instruído
[ ] Testes do escopo alterado passando
[ ] Tocou em endpoint consumido pelo TMS? → NÃO (feature não toca contrato TMS↔Nexa)
[ ] Todo caminho de erro loga status/motivo original
[ ] Campos novos declarados no DTO e repassados ao service
[ ] Migration (se houver) é aditiva e usa migrate deploy
[ ] Commit em Conventional Commits; push NÃO executado
```
