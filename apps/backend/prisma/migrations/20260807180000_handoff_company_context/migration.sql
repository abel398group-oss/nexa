-- Contexto de empresa no handoff (aditivo).
--
-- O TMS envia companyName + cnpj no POST /api/handoff/token desde 2026-08-06
-- (hipertms_v12: lia-support.service.ts, getSupportToken e buildHandoffLink).
-- O CreateHandoffDto do Nexa não declarava os campos e, com o ValidationPipe
-- global em forbidNonWhitelisted, TODO handoff era rejeitado com 400 — a aba
-- "Chamados" do widget ficava fora do ar.
--
-- Colunas nullable: tokens já existentes seguem válidos sem backfill.
ALTER TABLE "handoff_tokens" ADD COLUMN IF NOT EXISTS "company_name" TEXT;
ALTER TABLE "handoff_tokens" ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
