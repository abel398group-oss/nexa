# T10 — Tabular WhatsApp digest format (approved 2026-07-20)

> Spec approved by Abel on 2026-07-20 after format iterations (see chat history).
> Scope: **WhatsApp text only** (`ConsolidationService.buildUnifiedMessage`).
> The unified **e-mail** digest keeps its current per-sector HTML layout — channel
> asymmetry stands ("e-mail é barato, WhatsApp interrompe").

## 1. Approved layout

Header in normal text; every section (cash + each sector) is its own WhatsApp
monospace block (triple backtick). Double rule (═) only ABOVE the section title —
no rule below the title (explicit request). Single rule (─) before footers.
Block width: **30 chars** (fallback 28 if line-wrap is reported on small phones).

```
*HiperTMS · seg 20/07 · 25 pendências*

``` ══════════════════════════════
 SEU CAIXA — 15 dias
Faturado hoje       R$  4.320
Gasto hoje          R$  1.870
Entra (15d)         R$ 38.400
Sai (15d)           R$ 21.150
──────────────────────────────
Sobra               R$ 17.250
Vencido s/ receber  R$  6.900
CT-e s/ faturar     R$  3.100```

``` ══════════════════════════════
 FISCAL (5)
- CT-e 4519 rejeitado
  → reenviar
- CT-e 4512 sem retorno 5h
  → verificar
- Certificado vence em 19d
  → renovar
──────────────────────────────
+2 no site```

Ver tudo: hipertms.com.br/painel
```

Rules of the layout:

- Header: `*HiperTMS · {dow dd/mm} · {N} pendências*` (total open, all sectors).
- Cash block first (data = existing `buildCashViewBlock` inputs, reformatted as
  a right-aligned money column; NO change to `TmsCashView` contract or to the
  lastSlot gating — cash still appears only per current `cashViewIsOn` rules).
- One block per enabled sector that has open items; sector with 0 items is
  omitted. Sector title: `NAME (total)`, uppercase, no emoji.
- Max **3 items per sector** (`MAX_ITEMS_PER_SECTOR_UNIFIED`: 6 → 3). Items use a
  `- ` bullet — NOT numbering: most TMS titles *start* with a number
  ("21 viagens atrasadas"), and `1. 21 viagens` reads as "1.21" (changed
  2026-07-26). Each item line is telegraphic (keyword first), action verb on the
  following indented line (`  → verb`). Overflow: `─` rule + `+N no site`.
- Aggregated count rules (e.g. procurement) render as a single bullet line.
- Footer: `Ver tudo: hipertms.com.br/painel` (full URL, no shortener).
- No severity emojis, no sector emojis, no per-item dates in prose — severity is
  expressed by ORDER (see §2).

Design rationale (research, 2026-07-20): ISA-18.2 (alert = reason + action +
priority; non-actionable = noise), NN/g F-pattern scanning (first line carries
the message; keyword first per line), Cowan working-memory limit (~4 chunks →
cap per block), progressive disclosure (message = trigger, panel = detail).

## 2. Ranking criteria (which 3 items appear)

Within each sector, sort by:

1. **Severity band**: CRITICAL > OVERDUE > DUE_SOON > INFO (existing bands).
2. **Tie-break inside the band, per sector**:
   - finance: highest amount (R$) first
   - fiscal: most hours stuck first
   - logistic: most days late first
   - frota: fewest days until expiry first
   - compras: n/a (single aggregated line)
3. **Final tie-break**: oldest event first.

**Age escalation**: an OVERDUE item older than `DIGEST_AGE_ESCALATION_DAYS`
(default 30) is promoted to the top of its severity band and rendered with its
age (`CP-0012 vencida há 32d`). Prevents old debt from being forever invisible
at position 4+.

Tie-break inputs come from `AlertState` metadata pushed by the TMS (amount,
hoursWaiting, daysLeft, dueAt). Where metadata is missing, fall back to event
creation time (never crash — degrade to rule 3).

## 3. Action verb map

Static map `ruleId → short action` used for the `→` line. One entry per rule
(23 existing + 5 new TMS rules). Examples: `cte.rejected → reenviar`,
`installment.overdue(PAYABLE) → pagar`, `installment.overdue(RECEIVABLE) →
cobrar`, `fleet.cnh_expired → renovar`, `purchase.pending_approval → aprovar`,
`trip.overdue → ver rotas`. Unknown ruleId → omit the arrow line (never guess).

## 4. Out of scope / unchanged

- E-mail digest layout, throttle by severity band, send windows, dedup/catch-up,
  per-contact contacts model, closing report (T8), STANDBY flag behaviour.
- TMS→Nexa ingest contract (REGRAS-SQUAD Regra 1): NO new fields required by
  this spec. New TMS rules (trip.overdue, shipment.stalled, shipment.unlinked,
  fleet.in_maintenance) are a separate TMS-side task and flow through the
  existing payload shape.

## 5. Acceptance checklist

- [ ] Full simulation (5 sectors × 5 items) renders ≤ ~40 lines, blocks aligned
      at 30 chars, no wrapped ═ lines on a standard phone.
- [ ] Sector with ≤3 items: all shown, no `+N` footer. Sector with 0: omitted.
- [ ] CRITICAL appears at top of its sector (STANDBY mode — sole channel).
- [ ] Ranking: unit tests per sector tie-break + age escalation.
- [ ] Action verb map covers every ruleId emitted by the TMS today.
- [ ] `pnpm test:backend` green; build green (Abel local).
