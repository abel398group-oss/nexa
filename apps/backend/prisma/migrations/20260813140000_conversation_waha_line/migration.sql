-- Linha do WhatsApp por onde a conversa entrou (divisão de números, 2026-08-13).
--
-- ADITIVA e nullable de propósito: toda conversa existente fica NULL, que o
-- código lê como "linha principal" — exatamente o número único de hoje. Nada a
-- retro-preencher, nenhum comportamento muda ao aplicar.
--
-- Guarda a LINHA (o número), não a sessão do WAHA: com dois containers as duas
-- sessões se chamam `default`, então o nome da sessão não distinguiria nada.
--
-- Invariante que esta coluna existe para sustentar: a resposta sai sempre pela
-- linha por onde a mensagem entrou. Sem isto, um lead que escreveu para o número
-- de vendas receberia resposta do número de alertas — e trataria como golpe.
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "waha_line" TEXT;

-- Índice parcial: só as conversas que TÊM linha entram. Enquanto houver um
-- número só, a coluna é toda NULL e o índice fica praticamente vazio — custa
-- nada. Quando a segunda linha existir, ele serve os filtros por número.
CREATE INDEX IF NOT EXISTS "ai_conversations_waha_line_idx"
  ON "ai_conversations" ("waha_line")
  WHERE "waha_line" IS NOT NULL;
