-- Separação de `telemarketing` em `sdr` + `closer`, e `support` formal.
--
-- Quem trabalha hoje com `telemarketing` ganha AS DUAS novas permissões. Conceder as
-- duas é deliberado: a permissão única já dava as duas mesas, e entregar só uma seria
-- tirar acesso de quem está no telefone agora. O admin separa depois, na tela de
-- Usuários — que é o ponto do módulo.
--
-- `telemarketing` NÃO é removida. Duas razões: um rollback do backend precisa dela para
-- o guard antigo reconhecer os mesmos usuários, e o filtro de `users.service` descarta em
-- silêncio o que não estiver na lista de permissões válidas — tirar a permissão antes de
-- todo mundo estar migrado faria a primeira edição de um usuário apagar o acesso dele
-- sem aviso.
--
-- Idempotente pelo `NOT ... = ANY`: rodar de novo não duplica nada.
UPDATE "users" SET permissions = array_append(permissions, 'sdr')
 WHERE 'telemarketing' = ANY(permissions) AND NOT ('sdr' = ANY(permissions));

UPDATE "users" SET permissions = array_append(permissions, 'closer')
 WHERE 'telemarketing' = ANY(permissions) AND NOT ('closer' = ANY(permissions));

-- `support` para quem já opera o atendimento HOJE — isto é, quem tem `inbox` e NÃO é
-- vendedor. O recorte por papel importa: `vendedor` recebe `inbox` de fábrica
-- (sellers.service.ts), e dar `support` a todo o comercial abriria a nota interna do
-- chamado para o lado de vendas, que é o furo fechado pela auditoria de 06/08.
UPDATE "users" SET permissions = array_append(permissions, 'support')
 WHERE 'inbox' = ANY(permissions)
   AND role <> 'vendedor'
   AND NOT ('support' = ANY(permissions));
