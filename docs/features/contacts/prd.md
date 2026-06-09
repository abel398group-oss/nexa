# PRD — Contatos (CRM Leve)

## Visão geral

Contatos é o CRM leve da Nexa. Armazena leads e clientes com histórico de interações, pontuação de interesse, status e tags.

## Personas

- Vendedor: visualiza leads qualificados e histórico de conversas.
- Sistema: cria/atualiza contatos automaticamente ao receber mensagens inbound.

## Escopo

- Upsert automático ao receber mensagem (cria se não existe, atualiza se existe)
- Campos: phone (chave única por tenant), name, source, status, interestScore, tags
- Status: active | opted_out
- Tags: labels customizáveis (ex: `tms_cliente`, `quente`, `demo_agendada`)
- Histórico de interações vinculado
- Filtros na listagem: status, score, tags, busca textual

## Regra de opt-out (LGPD)

- Palavras: SAIR, PARAR, STOP, DESCADASTRAR → status = opted_out, score = 0
- Contato opted_out nunca recebe campanha ou mensagem automática
- Registro permanente em `optOutAt`

## Tag tms_cliente

Adicionada automaticamente quando:
1. Campanha tenta disparar para um número que está no banco do HiperTMS
2. Inbox detecta que o remetente é cliente TMS (futuro)

## Referências

- Service: `apps/backend/src/application/contacts/contacts.service.ts`
