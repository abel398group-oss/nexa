-- PlanLimit.monitorNumbersIncluded — WA numbers included in the plan, synced from the TMS.
--
-- The TMS owns the plan catalogue (ADR 011). Until now Nexa hard-coded the
-- included count per plan name (MONITOR_WA_INCLUDED), which silently drifts
-- whenever the TMS changes a plan. This column stores what the TMS reports so
-- the constant becomes a fallback only.
--
-- Nullable on purpose: NULL means "the TMS has not synced this tenant yet" and
-- the fallback applies. -1 means unlimited (Corporativo), capped by Nexa at the
-- technical limit. Additive only — no backfill, no data loss.
ALTER TABLE "plan_limits"
  ADD COLUMN IF NOT EXISTS "monitor_numbers_included" INTEGER;
