-- Aprovação no modelo de mensagem (20/08/2026). Aditiva.
-- O modelo é o texto que o LEAD recebe e era o único da esteira sem revisão:
-- roteiro e portfólio passam pela Validação, o modelo entrava valendo direto.
ALTER TABLE "message_templates" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft';

-- Backfill: o que já existe estava em uso no disparo — rebaixar tudo para draft
-- esvaziaria o seletor do dia para a noite. Os modelos do HiperTMS foram revisados
-- em 20/08 (toques 2 e 4 reescritos para o reposicionamento). Novos nascem draft.
UPDATE "message_templates" SET "status" = 'approved';
