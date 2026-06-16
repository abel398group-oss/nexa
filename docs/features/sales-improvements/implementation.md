# Implementação — Melhorias do front de Vendas

> Backlog priorizado de melhorias no fluxo comercial (Inbox de Vendas, Contatos,
> Disparo, Vendedores, Dashboard), derivado de auditoria do frontend. Foco em
> aumentar a eficiência de quem opera vendas no dia a dia.
>
> Status: spec pronta para execução · Base: estado atual do `apps/frontend` e
> `apps/backend` (jun/2026). Sem nada quebrado hoje — isto é evolução.

---

## Princípios

1. **Fazer por fatia**, uma de cada vez, com validação no dev server entre elas.
2. **Reaproveitar o que existe** (campos/endpoints) antes de criar novo.
3. **Multi-tenant sempre**: `tenantId` derivado do contexto autenticado, nunca do body.
4. Não quebrar o disparo nem o inbox que já funcionam.

---

## Estado atual relevante (o que JÁ existe)

- `AiConversation.assignedSellerId` (atribuição de vendedor) — usado no round-robin.
- `Contact.notes` (String?) — campo livre, **já existe** (base para notas internas).
- Paginação no backend: `PaginationQueryDto` (`limit/offset/search`) → `{ items, total }`.
- Campanhas (`sender.controller.ts`): criar, start, pause, delete, archive/unarchive,
  bulk-delete — **não há editar nem clonar**.
- Conversas (`conversations.controller.ts`): só `PATCH :id/outcome` — **sem reatribuir**.
- Follow-up: módulo `application/followup` no backend (sem tela dedicada no front).

---

## P1 — Maior valor (fazer primeiro)

### 1.1. Reatribuir lead a outro vendedor
**Problema:** se um vendedor sai/é desativado, os leads dele ficam órfãos; não há reatribuição manual.

- **Backend (novo):** `PATCH /conversations/:id/assign` body `{ sellerId: string | null }` →
  atualiza `assignedSellerId` + `assignedAt`; audita. Validar que o seller é do tenant.
  Em massa: `POST /conversations/assign` `{ ids: string[], sellerId }` (DTO class-validator,
  por causa do `whitelist` do ValidationPipe).
- **Frontend:** dropdown de vendedor no header da conversa (`InboxPage.tsx`, junto ao
  bloco de status/outcome). Opcional: ação em massa em Contatos (selecionar + reatribuir).
- **Esforço:** médio.

### 1.2. Editar / Clonar campanha
**Problema:** só dá pra criar nova; não edita nem duplica.

- **Editar (backend novo):** `PATCH /campaigns/:id` — permitido **apenas** em rascunho/
  agendada (status que ainda não disparou); bloquear edição de campanha em andamento/done.
- **Clonar (frontend):** botão "Clonar" no card → lê `GET /campaigns/:id` e pré-preenche
  o form de Nova campanha (mesma mecânica do "reenviar falhados" que já existe em
  `CampaignsPage.tsx`). Não precisa de backend novo.
- **Frontend:** botões "Editar" e "Clonar" no card da campanha.
- **Esforço:** médio (editar) / baixo (clonar).

### 1.3. Notas internas do lead
**Problema:** a equipe não tem onde registrar contexto compartilhado sobre o lead.

- **Reaproveitar `Contact.notes`** (já existe). Garantir que `updateContact` aceita `notes`
  (DTO + service). MVP = nota única por contato (texto livre).
- **Frontend:** painel/área de "Notas" no header da conversa (`InboxPage.tsx`) e/ou no
  modal de editar contato (`ContactsPage.tsx`). Salvar com debounce/botão.
- **Esforço:** baixo–médio.

---

## P2 — Eficiência da operação

### 2.1. Filtrar Inbox por vendedor (carteira)
- Hoje a lista de conversas não filtra por vendedor (admin/gestor veem tudo).
- **Frontend:** chip/seletor de vendedor na sidebar do `ConversationInbox` (já temos
  `assignedSeller` em cada conversa) — filtro client-side; ou `?sellerId=` no backend.
- **Esforço:** baixo (client-side).

### 2.2. Paginação em Contatos
- Hoje carrega `limit: 100` sem aviso; acima disso some silenciosamente.
- **Frontend:** usar o componente `Pagination` (já existe) + `offset` na query (backend
  já suporta). Resetar página ao mudar busca/tag.
- **Cuidado:** o filtro de situação (todos/ativos/opt-out) é client-side hoje — para
  paginar correto, mover esse filtro para o backend (`status` no query) ou paginar só
  dentro do filtro aplicado. Decidir na implementação.
- **Esforço:** médio.

### 2.3. Preview da mensagem da campanha
- Mostrar a mensagem com as variáveis (`{{nome}}`, `{{saudacao}}`) já expandidas, antes
  de disparar (WhatsApp e e-mail).
- **Frontend:** botão "Pré-visualizar" perto do template em `CampaignsPage.tsx`; render
  com um contato exemplo (o 1º selecionado, ou um fake).
- **Esforço:** baixo–médio.

### 2.4. Follow-up visível
- O backend tem `followup`; falta expor na UI (listar follow-ups previstos por conversa
  e/ou um indicador no inbox). Confirmar endpoints do módulo antes.
- **Esforço:** médio (depende do que o módulo expõe).

---

## P3 — Melhorias rápidas (baixo esforço)

- **Avisar quando o limite de envio < total selecionado** na campanha ("Você selecionou
  150, mas o limite é 30"). `CampaignsPage.tsx`, na validação Zod já existente.
- **Validação de e-mail de verdade** (regex) no disparo por e-mail (hoje só checa `@`).
- **Ordenar a lista de Contatos** por coluna (nome/empresa/origem) — `SortableTH` já
  existe no design system.
- **KPIs de vendedor com comparativo** vs período anterior (Sellers/Dashboard).
- **Distinguir Lia × vendedor** no histórico do chat (cor/ícone na bolha outbound).

---

## Ordem sugerida

| Fatia | Entrega | Depende de |
|---|---|---|
| 1 | Reatribuir lead (backend `assign` + dropdown no inbox) | — |
| 2 | Editar/Clonar campanha (PATCH + clonar no front) | — |
| 3 | Notas internas (reusar `Contact.notes` + UI) | — |
| 4 | Filtrar inbox por vendedor | (1) ajuda |
| 5 | Paginação Contatos + ordenação | — |
| 6 | Preview da campanha + avisos de limite/e-mail (P3) | — |
| 7 | Follow-up na UI | módulo followup |

---

## Critérios de aceite (por fatia)

- [ ] **Reatribuir:** trocar o vendedor de uma conversa reflete na hora e na carteira; só
      aceita seller do tenant; ação auditada.
- [ ] **Editar/Clonar:** editar só em rascunho/agendada; clonar abre o form preenchido.
- [ ] **Notas:** nota salva persiste no contato e aparece pra toda a equipe.
- [ ] **Filtro por vendedor:** mostra só as conversas do vendedor escolhido.
- [ ] **Paginação:** navega além de 100 contatos; filtro de situação coerente com a página.
- [ ] **Preview:** mostra a mensagem final com variáveis trocadas, antes de disparar.
- [ ] **Avisos:** alerta quando limite < selecionados; e-mail inválido é barrado.

---

## Referência

- Frontend: `pages/InboxPage.tsx` (ConversationInbox) · `pages/ContactsPage.tsx` ·
  `pages/CampaignsPage.tsx` · `pages/SellersPage.tsx` · `pages/DashboardPage.tsx` ·
  `features/contact/*`
- Backend: `presentation/http/conversations/conversations.controller.ts` ·
  `presentation/http/sender/sender.controller.ts` (campanhas) ·
  `application/followup/*` · `prisma/schema.prisma` (`AiConversation.assignedSellerId`,
  `Contact.notes`)
- Padrões: `docs/SPEC-LISTAS-FILTROS-CRUD.md` · `docs/api/api-standards.md`

---

## Status de implementação (jun/2026)

- [x] **Fatia 1 — Reatribuir lead** · backend `PATCH /conversations/:id/assign` + dropdown
  "Vendedor" no header da conversa (Inbox de Vendas).
- [x] **Fatia 2 — Editar / Clonar campanha** · backend `PATCH /campaigns/:id` (rascunho) +
  botões "Editar" (modal compacto, só rascunho) e "Clonar" (pré-preenche o form) no card.
- [x] **Fatia 3 — Notas internas** · campo "Notas internas" no form de contato (usa
  `Contact.notes`, que o backend já aceitava).
- [x] **Fatia 4 — Filtrar Inbox por vendedor** · seletor de vendedor na sidebar do Inbox
  de Vendas (inclui "Sem vendedor").
- [x] **Fatia 5 — Paginação em Contatos** · filtro de situação movido pro backend
  (`?status=`) + paginação por página (50/pág) com Anterior/Próxima. (Ordenação por
  coluna ficou de fora — opcional, client-side.)
- [x] **Fatia 6 (parcial) — Validação de e-mail** no disparo (regex real no lugar de só `@`).
- [x] **Fatia 7 — Follow-up na UI** · indicador "Follow-up <data>" no header da conversa
  (read-only, via `GET /followups`).
- [ ] **Fatia 6 (resto) — aviso "limite < selecionados"** na campanha — pendente (único
  item menor que sobra; só dá pra calcular no público manual).

> Backend novo a subir: `PATCH /conversations/:id/assign`, `PATCH /campaigns/:id` e o
> `?status=` no `GET /contacts` (reiniciar o backend). Sem migration nesta entrega.

## Checklist de validação (pós-deploy)

**Pré:** reiniciar o backend (endpoints novos). Sem migration.

- [ ] **Reatribuir lead:** Inbox de Vendas → abrir conversa → trocar "Vendedor" no header →
  nome muda no card e persiste no F5; "Sem vendedor" desatribui.
- [ ] **Filtro por vendedor:** Inbox de Vendas → seletor na sidebar → escolher um vendedor
  mostra só a carteira dele; "Sem vendedor" mostra os não atribuídos.
- [ ] **Editar campanha:** criar campanha e NÃO iniciar → botão "Editar" → muda nome/mensagem
  → salva; campanha já iniciada NÃO mostra "Editar"; tentar editar iniciada (via API) dá erro.
- [ ] **Clonar campanha:** "Clonar" em qualquer campanha → abre o form com "Cópia de …" e a
  mensagem preenchida → cria nova normalmente.
- [ ] **Notas internas:** editar um contato → escrever em "Notas internas" → salvar → reabrir
  e a nota continua lá.
- [ ] **Validação de e-mail:** campanha por e-mail com uma linha "texto inválido" e uma
  "valido@dominio.com" → só a válida conta como destinatário; se nenhuma válida, bloqueia.
- [ ] **Paginação Contatos:** com +50 contatos, navega Anterior/Próxima; trocar o filtro
  de situação (todos/ativos/descadastrados) refaz a contagem e volta pra página 1.
- [ ] **Follow-up:** numa conversa com follow-up agendado, o header mostra o chip
  "Follow-up <data>".
