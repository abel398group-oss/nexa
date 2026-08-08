-- Atribuição de resposta de campanha por Message-ID.
--
-- Problema: a conversa de e-mail é indexada pelo REMETENTE (`email:<addr>`). Quando o
-- lead responde de um endereço diferente do que recebeu a campanha, o Nexa cria uma
-- conversa nova, desligada do disparo — e o alvo original nunca é contado como
-- "respondeu". A campanha exibe 0 respostas para sempre e o analista lê a resposta sem
-- ver o que foi perguntado. Observado em 08/08/2026 num teste real.
--
-- Solução: guardar o Message-ID de cada e-mail que sai e casar com o In-Reply-To /
-- References da resposta.
--
-- Aditiva: duas colunas nullable e um índice. Nada é reescrito, nenhum default
-- preenche linha existente (alvos antigos ficam com message_id NULL e simplesmente
-- não são casáveis — o que já é a situação de hoje).
ALTER TABLE "campaign_targets" ADD COLUMN IF NOT EXISTS "message_id" TEXT;
ALTER TABLE "campaign_targets" ADD COLUMN IF NOT EXISTS "replied_at" TIMESTAMP(3);

-- Índice do lookup do linker: roda uma vez por e-mail inbound.
CREATE INDEX IF NOT EXISTS "campaign_targets_tenant_id_message_id_idx"
  ON "campaign_targets" ("tenant_id", "message_id");
