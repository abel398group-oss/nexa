-- Hard bounce de e-mail: endereço permanentemente inválido nunca mais recebe campanha.
--
-- Antes disto, a devolução 5.x.x só marcava o CampaignTarget como `failed`. O dedup
-- entre campanhas pula apenas quem tem alvo `sent`, então o endereço morto voltava
-- para a próxima campanha — e taxa de rejeição acima de 2% derruba a entrega de
-- TODOS os e-mails do domínio (diretrizes Google/Microsoft para remetentes).
--
-- Coluna própria em vez de reaproveitar `status`: o telefone do mesmo contato
-- continua válido, e marcar `status` o tiraria também do público de WhatsApp.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_bounced_at" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_bounce_reason" TEXT;

-- Público de campanha de e-mail: o filtro passa a ser "ativo, com e-mail, sem bounce".
CREATE INDEX IF NOT EXISTS "contacts_tenant_id_email_bounced_at_idx"
  ON "contacts" ("tenant_id", "email_bounced_at");

-- Normalização de caixa (defensivo).
--
-- O caminho de entrada (resposta do lead) sempre gravou em minúsculas; o de saída
-- (campanha) gravava a caixa original da planilha. Postgres compara texto com
-- sensibilidade a maiúsculas, então `Joao@x.com` e `joao@x.com` eram DOIS contatos:
-- o opt-out registrado num não era encontrado pelo outro, e a pessoa que pediu
-- descadastro recebia de novo.
--
-- O código agora normaliza nos dois sentidos. Isto aqui limpa o que já existe,
-- pulando quem colidiria com a versão minúscula já presente (a unique
-- [tenant_id, email] proíbe as duas). Colisão remanescente, se houver, é rara e
-- resolvida à mão — perder um contato num UPDATE automático seria pior.
UPDATE "contacts" c
   SET "email" = lower(c."email")
 WHERE c."email" IS NOT NULL
   AND c."email" <> lower(c."email")
   AND NOT EXISTS (
     SELECT 1 FROM "contacts" o
      WHERE o."tenant_id" = c."tenant_id"
        AND o."email" = lower(c."email")
        AND o."id" <> c."id"
   );

UPDATE "campaign_targets"
   SET "email" = lower("email")
 WHERE "email" IS NOT NULL AND "email" <> lower("email");

-- O contato de e-mail é indexado pelo telefone sintético "email:<endereço>"
-- (ver EMAIL_PHONE_PREFIX) — mesma regra, mesma colisão possível na unique
-- [tenant_id, phone].
UPDATE "contacts" c
   SET "phone" = lower(c."phone")
 WHERE c."phone" LIKE 'email:%'
   AND c."phone" <> lower(c."phone")
   AND NOT EXISTS (
     SELECT 1 FROM "contacts" o
      WHERE o."tenant_id" = c."tenant_id"
        AND o."phone" = lower(c."phone")
        AND o."id" <> c."id"
   );

-- A conversa é indexada pelo mesmo telefone sintético; sem isto a resposta do lead
-- abriria um fio novo em vez de cair no fio do disparo.
UPDATE "ai_conversations"
   SET "phone" = lower("phone")
 WHERE "phone" LIKE 'email:%' AND "phone" <> lower("phone");
