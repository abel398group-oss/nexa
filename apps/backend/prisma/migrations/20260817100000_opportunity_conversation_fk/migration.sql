-- A oportunidade guarda de qual conversa ela nasceu, e o banco não conferia nada.
--
-- Sem a chave estrangeira, apagar uma conversa deixa o `conversation_id` apontando para
-- o vazio, e nada avisa. Em 17/08/2026 havia 2 assim, de 20 oportunidades — uma delas é
-- o card em `proposal` que aparecia no painel do closer sem nome nem telefone.
--
-- Hoje isso não quebra tela nenhuma, porque nenhuma segue esse campo. Quebra no dia que
-- alguém fizer um "ver a conversa que originou": abre em branco ou dá erro, e quem for
-- investigar procura defeito no botão, que está certo. O dado é que está torto.
--
-- ON DELETE SET NULL, e não CASCADE nem RESTRICT: apagar a conversa NÃO pode apagar a
-- oportunidade (o negócio existe independente do histórico de mensagens), e também não
-- pode impedir a limpeza de conversa antiga. Perder o ponteiro é a consequência certa.
--
-- Aditiva: nenhuma linha é removida, nenhuma coluna é apagada, nenhuma tabela é
-- recriada. São um UPDATE de um campo nas linhas órfãs, um índice e uma restrição.

-- 1. Limpa o ponteiro quebrado. O Postgres recusa criar a restrição enquanto existir
--    linha que a viole, e é isto que a torna aplicável. A oportunidade continua
--    inteira; ela só deixa de apontar para algo que não existe mais.
UPDATE "opportunities" o
   SET "conversation_id" = NULL
 WHERE o."conversation_id" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "ai_conversations" c WHERE c."id" = o."conversation_id"
   );

-- 2. Índice parcial, no mesmo padrão do `batch_id`: só oportunidade vinda de conversa é
--    procurada por ela. A restrição abaixo também consulta por este caminho.
CREATE INDEX IF NOT EXISTS "opportunities_conversation_id_idx"
  ON "opportunities" ("conversation_id") WHERE "conversation_id" IS NOT NULL;

-- 3. A restrição. `duplicate_object` engolido para a migration poder rodar duas vezes
--    sem falhar — mesmo padrão das FKs já existentes neste diretório.
DO $$ BEGIN
  ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
