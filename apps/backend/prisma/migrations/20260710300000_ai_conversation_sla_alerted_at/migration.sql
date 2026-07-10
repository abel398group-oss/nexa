-- N4: sla_alerted_at — persistent SLA dedup (replaces in-memory Map that died on restart)
ALTER TABLE "ai_conversations"
  ADD COLUMN "sla_alerted_at" TIMESTAMPTZ;
