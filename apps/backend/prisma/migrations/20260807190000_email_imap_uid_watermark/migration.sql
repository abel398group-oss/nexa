-- Marca d'água de UID no polling IMAP (aditivo).
--
-- O poller buscava apenas mensagens UNSEEN. Consequência: abrir a caixa
-- lia@hipertms.com.br no webmail marcava as mensagens como lidas e o Nexa nunca
-- mais as processava — o lead respondia e a resposta simplesmente não aparecia no
-- Inbox. Perda permanente, não atraso.
--
-- Com o UID como referência, quem leu a mensagem deixa de importar. uid_validity
-- acompanha a marca porque o servidor pode reciclar os UIDs (RFC 3501 §2.3.1.1);
-- quando ele muda, a marca é descartada em vez de pular mensagens.
--
-- Ambas nullable: canais já existentes começam sem marca e a primeira execução
-- mantém o comportamento antigo (UNSEEN) antes de assumir o controle por UID.
ALTER TABLE "email_channels" ADD COLUMN IF NOT EXISTS "last_seen_uid" INTEGER;
ALTER TABLE "email_channels" ADD COLUMN IF NOT EXISTS "uid_validity" INTEGER;
