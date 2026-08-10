-- Dono por vendedor em contato e campanha (11/08/2026).
--
-- Três vendedores fazendo disparo, e os dados de um não podem se misturar com os
-- do outro. O vendedor passa a ver só o que é dele; o admin continua vendo tudo.
--
-- NULL = SEM DONO, e sem dono TODO MUNDO VÊ. É de propósito: toda a base que já
-- existe entra assim, então nada some da tela de ninguém no dia do deploy. O admin
-- distribui depois, pelo botão Transferir, e a partir daí a separação vale.
-- Filtrar por dono já nesta migração faria os vendedores abrirem Contatos e verem
-- zero — quebrar o que funciona para entregar o que foi pedido.
ALTER TABLE "contacts"  ADD COLUMN IF NOT EXISTS "owner_seller_id" TEXT;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "owner_seller_id" TEXT;

-- Consulta quente das duas telas: "o que é meu, dentro do meu tenant".
CREATE INDEX IF NOT EXISTS "contacts_tenant_id_owner_seller_id_idx"
  ON "contacts" ("tenant_id", "owner_seller_id");
CREATE INDEX IF NOT EXISTS "campaigns_tenant_id_owner_seller_id_idx"
  ON "campaigns" ("tenant_id", "owner_seller_id");

-- Sem chave estrangeira para `sellers` de propósito: o vendedor pode ser removido
-- do cadastro, e uma FK com RESTRICT travaria a exclusão enquanto houvesse um
-- contato dele. O escopo trata id órfão como "não casa com ninguém", que é o lado
-- seguro — o dado fica invisível para os vendedores e visível para o admin, que é
-- quem redistribui.
