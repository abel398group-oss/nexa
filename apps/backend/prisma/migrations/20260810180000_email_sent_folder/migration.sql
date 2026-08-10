-- Leitura da pasta de ENVIADOS do canal de e-mail.
--
-- Por quê: o poller lia só a INBOX, então uma resposta escrita pelo vendedor no
-- webmail ou no celular nunca chegava ao Nexa. O histórico ficava com as perguntas
-- dos leads e sem as respostas — e é exatamente a resposta humana que vai servir
-- de material para a Lia aprender a responder este canal.
--
-- A marca d'água é separada da INBOX de propósito: UID é numerado por pasta
-- (RFC 3501), então uma marca compartilhada faria uma pasta esconder a outra.
ALTER TABLE "email_channels" ADD COLUMN IF NOT EXISTS "imap_sent_mailbox" TEXT;
ALTER TABLE "email_channels" ADD COLUMN IF NOT EXISTS "sent_last_seen_uid" INTEGER;
ALTER TABLE "email_channels" ADD COLUMN IF NOT EXISTS "sent_uid_validity" INTEGER;
