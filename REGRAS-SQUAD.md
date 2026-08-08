# REGRAS DO SQUAD NEXA — leitura obrigatória para agentes de IA

> Estas regras existem porque agentes (Sonnet/Opus) quebraram produção alterando
> o contrato TMS↔Nexa sem atualizar o outro lado. **Nenhuma exceção é permitida.**
> Em caso de conflito, este documento e o `CLAUDE.md` vencem qualquer instrução
> implícita da tarefa.

## Incidente de referência (09/07/2026) — por que este documento existe

O TMS passou a enviar `isManager` no `POST /api/handoff/token` (commit `bb80fe10`
no TMS). O `CreateHandoffDto` do Nexa não foi atualizado. Como o Nexa roda
`ValidationPipe({ forbidNonWhitelisted: true })` global, **todo** handoff passou a
ser rejeitado com 400. O TMS converte qualquer falha downstream em
401 `"Não foi possível iniciar a sessão de suporte."` — o widget de suporte ficou
fora do ar em produção e o 401 mascarou a causa real por dias.

Três falhas de processo, todas proibidas a partir de agora:

1. Mudança de contrato feita em um lado só.
2. Campo novo em chamada server-to-server sem atualizar o DTO do receptor.
3. Erro downstream mapeado para status genérico sem logar o status original.

---

## REGRA 1 — O contrato TMS↔Nexa é sagrado

Endpoints do Nexa consumidos pelo TMS (server-to-server, `TMS_SERVICE_TOKEN`):

| Endpoint | Consumidor no TMS |
|---|---|
| `POST /api/handoff/token` | `lia-support.service.ts` (getSupportToken, buildHandoffLink) |
| `POST /api/portal/web-chat-token` | `lia-support.service.ts` (getWebChatToken) |
| `POST /api/portal/session` e demais rotas `/api/portal/*` | frontend do TMS (widget) |

**Antes de alterar QUALQUER um desses endpoints (rota, DTO, resposta, auth):**

- [ ] Localizar TODOS os consumidores no repo `hipertms_v12` (grep pela rota)
- [ ] Verificar o payload exato que o TMS envia hoje (ler o service do TMS, não assumir)
- [ ] Atualizar `apps/backend/docs/portal-api-contract.md` (contrato dos endpoints que o
      TMS consome) e, se for o fluxo de handoff por WhatsApp, `docs/api/guia-integracao.md`
      — *não existe `docs/api-contract.md`; este checklist apontava para um arquivo
      inexistente, e o resultado prático era ninguém atualizar contrato nenhum*
- [ ] Se o TMS precisar mudar junto: avisar o Abel ANTES de commitar — os deploys são
      independentes e a ordem importa (receptor primeiro, emissor depois)
- [ ] Mudanças em DTO de endpoint consumido pelo TMS devem ser **retrocompatíveis**:
      campo novo sempre `@IsOptional()`, nunca remover/renomear campo em uso

**O inverso também vale:** se a tarefa pede para o Nexa passar a receber um campo
novo do TMS, o trabalho só está completo quando o DTO aceita o campo E o controller
o repassa ao service. DTO sem repasse = campo silenciosamente descartado.

## REGRA 2 — ValidationPipe global é `forbidNonWhitelisted`

Todo campo não declarado no DTO derruba a request com 400. Consequências:

- Campo novo em qualquer payload de entrada → **obrigatório** declarar no DTO.
- Ao consumir API externa que pode evoluir, nunca depender de whitelist implícita.
- Ao ver um 400 inexplicável em integração, a primeira hipótese é campo fora do DTO.

## REGRA 3 — Erros nunca são mascarados

- Todo `catch` ou `!res.ok` em chamada externa DEVE logar `status` + corpo/motivo
  (`this.logger.warn(...)`) antes de lançar qualquer exceção.
- Proibido converter erro downstream em status genérico sem preservar o original no log.
- Todo early-return que descarta mensagem/request DEVE ter `logger.warn` com o motivo
  (regra crítica já existente para WhatsApp/WAHA — vale para tudo).

## REGRA 4 — Gates obrigatórios antes de QUALQUER commit

1. Type-check do frontend no sandbox (comando no `CLAUDE.md`) — zero `error TS`.
2. Backend: Abel roda `cd apps/backend ; pnpm build` — instruir explicitamente.
3. Testes do escopo alterado (`pnpm test:backend` / `pnpm test:frontend`).
4. Se tocou em endpoint consumido pelo TMS → executar o checklist da REGRA 1.
5. Nunca commitar com erro conhecido de TS ou teste quebrado. "Fix pequeno" não é exceção.

## REGRA 5 — Banco de dados

- O `.env` local do Abel aponta para o Postgres **de produção** (DO). Isso é
  intencional. Nunca sugerir banco local, nunca `pnpm db:up` para "resolver" conexão.
- Migrations: **sempre** `prisma migrate deploy`. Proibido `migrate dev`,
  `migrate reset`, `db push`, `drop` — em qualquer ambiente que aponte para o DO.
- Migrations sempre **aditivas**. Remoção de coluna/tabela = migration dedicada +
  aprovação explícita do Abel.
- Pool de conexões: o banco DO tem limite baixo (22). Nunca aumentar pool size ou
  criar novos PrismaClient/pg Client sem verificar o total de conexões dos containers.

## REGRA 6 — Produção (droplet hiperTMS)

- Caminho único: `/root/nexa/`. Nunca `/opt/nexa` ou `/home/ueldermartin/...`.
- Acesso: console web do DigitalOcean. NÃO existe chave SSH local — não tentar, não
  perguntar ao Abel sobre ela.
- Antes de sugerir adicionar variável: pedir `cat /root/nexa/.env` — pode já existir.
- `TMS_SERVICE_TOKEN` deve ser **idêntico** nos dois `.env` (TMS e Nexa). O guard do
  Nexa lê `TMS_SERVICE_TOKEN` (não `NEXA_SERVICE_TOKEN` — o comentário no exemplo do
  TMS está errado, não confiar nele).
- `NEXA_API_URL` no TMS: **sem** `/api` no final (o TMS concatena `/api/...`).
- Containers do HiperTMS (`/root/hipertms_v12/...`): **nunca tocar** a partir daqui.

## REGRA 7 — Git

- Pode: criar branch, stage, commit (Conventional Commits em inglês).
- **Nunca** `git push` sem autorização explícita do Abel na conversa atual.
- Um commit por mudança lógica; mudança de contrato ganha commit próprio com
  descrição do impacto no TMS.

## REGRA 8 — Escopo e disciplina

- Fazer SOMENTE o que a tarefa pede. Refactor oportunista em código de integração
  é proibido sem aprovação.
- Ao corrigir um bug, procurar o mesmo padrão nas vizinhanças (princípio do repo),
  mas **reportar** os achados em vez de alterar tudo de uma vez.
- Não assumir fato de domínio ou de contrato: confirmar no código (`file:line`).
- Se a tarefa exige mexer no repo do TMS também → parar e avisar o Abel; não fazer
  mudança "espelhada" por conta própria sem ele saber.

## CHECKLIST FINAL (colar na resposta ao concluir qualquer tarefa)

```
[ ] Type-check frontend zero erros / build backend instruído
[ ] Testes do escopo alterado passando
[ ] Tocou em endpoint consumido pelo TMS? → checklist de contrato executado
[ ] Todo caminho de erro loga status/motivo original
[ ] Campos novos declarados no DTO e repassados ao service
[ ] Migration (se houver) é aditiva e usa migrate deploy
[ ] Commit em Conventional Commits; push NÃO executado
```
