# Auditoria — Operação do time humano de Suporte (5 analistas) e escalonamento pra Dev

**Data:** 2026-08-06 · **Escopo:** distribuição/atribuição de chamados entre
analistas, notas internas, e escalonamento pra Engenharia (N3/bugs).
**Método:** leitura direta do código — schema Prisma, serviços de backend,
`InboxPage.tsx`. Tudo abaixo é conferido em código real, não hipótese.

> **Resumo de uma linha:** hoje o Inbox de suporte tem UMA fila
> compartilhada sem dono, sem nota interna, e sem nenhuma ponte com
> ferramenta de dev. Os três pontos pedidos são gaps reais, não recursos
> escondidos que faltou eu achar — confirmado por busca exaustiva, não por
> "não encontrei".

---

## 1. Distribuição e atribuição de chamados entre analistas

### Não existe — confirmado

`AiConversation` só tem atribuição pro lado de **vendas**:

```prisma
assignedSellerId String?   @map("assigned_seller_id")
assignedSeller   Seller?   @relation(fields: [assignedSellerId], references: [id])
assignedAt       DateTime? @map("assigned_at")
```
(`prisma/schema.prisma:240-242`)

Busca por `assign` no schema inteiro só retorna esses 3 campos + o
equivalente em `Opportunity`/`Seller` — nenhum campo `assignedToId`,
`operatorId`, `analystId` ou parecido para suporte existe.

`PATCH /conversations/:id/assign` (`conversations.controller.ts`) recebe
`{ sellerId: string | null }` — é literalmente o mesmo endpoint de vendas,
não dá pra usar pra "analista de suporte assume o chamado" sem mudar o
contrato.

Comparação: o lado de vendas tem um motor de atribuição de verdade
(`sellers.service.ts:116-254`) — round-robin real via SQL bruto
(`assigned_count`), checagem de "já atribuído", tudo. **Não existe
equivalente para suporte.** Nenhum diretório `application/support/` ou
`application/analysts/` com essa lógica.

### Fila no Inbox

`InboxPage.tsx` só distingue **vendas vs. suporte** (`scope: 'sales' |
'support'`) — dentro do suporte, todos os 5 analistas veem a **mesma fila
única**, filtrável só por status (`open`/`escalated`/etc.), nunca por quem
está com o chamado. O dropdown de "Todos os vendedores" existe só quando
`scope === 'sales'` — não tem equivalente "Todos os analistas" no suporte.

**Não existe** aba "Não atribuídos" / "Atribuídos a mim" / "Atribuídos a
outros".

### Trava de colisão

`humanTakeoverAt` — o único mecanismo relacionado — é um **timestamp único
por conversa, não uma trava por analista**: `DateTime?`, sem
`humanTakeoverByUserId` nem nada parecido. Ele só serve pra dizer "algum
humano já respondeu, então a Lia para de auto-enviar e passa a só
rascunhar" (`conversation-agent.service.ts:300-309`). É gravado na primeira
resposta humana (`conversations.service.ts:419-422`) e limpo no
fechamento/devolução — **não registra QUEM, não impede dois analistas
respondendo ao mesmo cliente ao mesmo tempo**, e não existe indicador visual
de "fulano está vendo esta conversa".

### Transferência

**Não existe.** A única transferência real no código é
`reassignSeller`/`assignSeller` (`InboxPage.tsx:25,431`) — troca de
vendedor, lado comercial. Zero código de "transferir chamado de suporte
entre analistas", nem botão nem endpoint.

---

## 2. Notas internas / comentários privados

### Não existe — confirmado pelo schema inteiro

`AiMessage` (schema completo, `prisma/schema.prisma:311-343`) só tem
`direction: MessageDirection` (`inbound`/`outbound`) como campo de
visibilidade. Sem `isInternal`, `visibility`, `role`, `isPrivate`, nada.
`metadata` é `Json` livre, mas **nenhum código grava flag de nota interna
nele** — busca por `isInternal`/`is_internal` no repo inteiro: zero
resultados.

Busca por "nota interna" / "internal note" / "private comment" /
"comentário interno" em todo o backend e frontend: **zero ocorrências nas 4
buscas**.

Toda mensagem hoje é, por design do schema, ou `inbound` (do cliente) ou
`outbound` (pro cliente) — não existe uma terceira categoria "só a equipe
vê".

---

## 3. Escalonamento para Engenharia (N3 / bugs)

### Integração com ferramenta de dev: não existe

Busca por `jira`, `clickup`, `trello`, `linear`, `github` (case-insensitive)
em todo `apps/backend/src`: **zero ocorrências**. Não existe
`application/integrations/` no repo (a pasta certa é `application/connectors/`,
que só tem KB do HiperTMS e o `ticket-sync.service.ts` — que sincroniza o
**resumo do ticket de volta pro TMS do cliente**, não é integração com
ferramenta de dev nenhuma).

### `waiting_internal` não é "esperando dev"

O comentário no próprio enum já desfaz a suposição:

```prisma
waiting_internal   // aguardando ação interna (vendedor, suporte)
```
(`schema.prisma:53`)

É genérico — "time interno precisa agir", usado tanto por vendas
(`proactive-detector.service.ts:135`, detector de lead sem resposta) quanto
por suporte. Não existe um status específico "esperando correção de bug".

### Vínculo de issue externa: não existe

Busca por `issue` no schema inteiro: zero. Não existe `devIssueUrl`,
`jiraIssueKey`, `linkedIssueId` nem nada parecido em nenhum model.

### O que a categoria `bug`/`erro_sistema` REALMENTE faz

Existe classificação (`case-classifier-agent.service.ts:16,36,59`) e
playbook (`support-playbooks.const.ts:117-128`, nome `bug-sistema`, orienta
coletar reprodução/navegador/erro e escalar). Mas o que acontece quando
escala é **idêntico ao de qualquer outra categoria** — o mesmo bloco
genérico em `support-agent.service.ts:170-185`:

```ts
if (needsHuman) {
  await this.notifications.create(tenantId, {
    type: 'escalation',
    title: '🔴 Escalonamento — atendimento humano necessário',
    body: escalationDecision.summary ?? `Categoria: ${classification.category} · ...`,
    link,
  });
  ...
}
```

Não existe `if (category === 'bug')` em lugar nenhum do fluxo de
escalonamento. Zero notificação a canal de dev, zero criação de issue
externa, zero prioridade diferenciada. **O escalonamento pra bug termina no
mesmo Inbox compartilhado, com o mesmo card, que qualquer outro chamado
escalado.** Não existe ponte com Engenharia no código hoje — o "N3" é hoje
só um conceito na cabeça do time, não uma feature.

---

## O que falta implementar, se o time de 5 analistas for rodar sem atrito

Ordem sugerida por dependência (cada item destrava o seguinte):

1. **Campo de atribuição pra suporte** — `assignedAnalystId` (ou reaproveitar
   um conceito de `User` já existente no sistema de auth) em
   `AiConversation`, espelhando o padrão que já existe pra
   `assignedSellerId`. Migration aditiva simples.
2. **Endpoint + UI de "assumir chamado"** — reaproveitar a forma do
   `PATCH /conversations/:id/assign`, mas com o analista logado, não um
   `sellerId` arbitrário vindo do body (senão qualquer analista atribui
   qualquer chamado a qualquer um, sem registrar quem realmente pegou).
3. **Filtro por atribuição no Inbox** — 3 abas (Fila geral / Meus chamados /
   De outros analistas), reaproveitando o padrão de filtro por `scope` que
   já existe.
4. **Trava de colisão** — mínimo viável: mostrar no card "Fulano está
   atendendo" quando `assignedAnalystId` estiver setado; não precisa de
   lock pessimista de verdade pra começar, só visibilidade evita a maior
   parte da colisão em equipe de 5 pessoas.
5. **Nota interna** — campo novo em `AiMessage` (`isInternal Boolean
   default false`) ou, mais simples ainda, um novo `direction` (`internal`)
   somado ao enum `MessageDirection` — decisão de design a validar antes de
   migrar, porque muda o significado de um enum usado em vários lugares
   (`support-agent.service.ts`, `conversation-janitor.service.ts`, contagem
   de mensagens, etc.).
6. **Ponte com ferramenta de dev** — o maior item, e o único que depende de
   decisão de produto (qual ferramenta? Linear, GitHub Issues, outra?).
   Sugestão de escopo mínimo: campo `linkedIssueUrl` em `AiConversation`
   (aditivo, sem integração ativa) pra já permitir colar o link manualmente
   e aparecer no card — separado de uma integração automática (criar issue
   via webhook), que é trabalho bem maior e só faz sentido depois de
   decidida a ferramenta.

Nenhum destes 6 itens foi implementado nesta auditoria — é raio-X, não
código. Fica pra você decidir prioridade e eu sigo a partir daí.

## Relacionados

- `docs/reviews/2026-08-06-relatorio-modulo-suporte.md` — fluxo geral do
  módulo (cadeia de agentes, tokens, escalonamento pro Inbox).
- `docs/reviews/2026-08-06-auditoria-kb-lia.md` — cobertura de KB/playbooks
  (achado da categoria `bug`/`erro_sistema` reconfirmado aqui em outro
  ângulo: ela tem playbook, mas nenhuma ação downstream específica).
- `apps/backend/prisma/schema.prisma` — `AiConversation` (linhas 224-288),
  `AiMessage` (311-343), `ConversationStatus` (49-56).
- `apps/backend/src/application/sellers/sellers.service.ts` — padrão de
  atribuição real (vendas), referência pro que falta em suporte.
