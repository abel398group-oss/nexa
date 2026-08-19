-- De quem é o mercado (19/08/2026). Aditiva: coluna opcional + FK + índice.
-- NULL = mercado da casa (HiperTMS) — nenhuma linha existente é tocada.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "partner_id" TEXT;

-- SetNull: apagar o parceiro (o service só permite sem histórico de indicação)
-- não pode derrubar o mercado junto — ele volta a ser "da casa".
ALTER TABLE "products"
  ADD CONSTRAINT "products_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "partners"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "products_partner_id_idx" ON "products"("partner_id");
