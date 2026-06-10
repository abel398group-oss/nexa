-- ADR 021 anti-spam: controla se o link vai no 1º e-mail ou só após resposta
ALTER TABLE "campaigns" ADD COLUMN "send_link_on_first" BOOLEAN NOT NULL DEFAULT false;
