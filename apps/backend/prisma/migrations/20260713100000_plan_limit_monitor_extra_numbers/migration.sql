-- AddColumn: monitorExtraNumbers to plan_limits
-- Additive migration — existing rows get default 0 (no data loss).
ALTER TABLE "plan_limits" ADD COLUMN "monitor_extra_numbers" INTEGER NOT NULL DEFAULT 0;
