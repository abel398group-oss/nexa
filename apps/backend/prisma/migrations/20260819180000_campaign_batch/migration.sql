-- Lote que originou a campanha.
--
-- Sem esta coluna não havia como disparar "para esta lista": o disparo aceitava
-- telefones colados na mão ou TODOS os contatos do tenant, e nada no meio. Quem
-- importava um CSV, passava pela peneira (duplicado, inválido, opt-out, cliente do
-- TMS, concorrente) e distribuía entre os vendedores tinha de exportar o mesmo CSV e
-- subir de novo no Disparo — onde a peneira inteira rodava outra vez, do zero.
--
-- Aditiva e anulável: campanha de telefone avulso e de "todos os contatos" continuam
-- válidas e ficam com NULL.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "batch_id" TEXT;

-- "Quais campanhas saíram deste lote" é a pergunta do relatório por lote.
CREATE INDEX IF NOT EXISTS "campaigns_tenant_id_batch_id_idx" ON "campaigns" ("tenant_id", "batch_id");
