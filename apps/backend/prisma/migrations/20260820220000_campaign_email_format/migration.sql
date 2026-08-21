-- Formato do e-mail por campanha (20/08/2026). Aditiva.
--
-- O envio sempre mandou texto E html no mesmo e-mail (multipart/alternative), e o
-- cliente escolhe — o Gmail escolhe o html. Ou seja: não havia como mandar texto
-- puro, que é o que entrega melhor em prospecção fria.
--
-- Default 'html' preserva o comportamento de toda campanha existente.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "email_format" TEXT NOT NULL DEFAULT 'html';
