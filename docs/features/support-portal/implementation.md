# Implementação — Portal de Suporte do Cliente (Nexa)

> Página de suporte **voltada ao cliente** do HiperTMS (o *portal*), separada da
> inbox interna do agente (`/support`, que já existe). No portal, o cliente vê os
> próprios chamados, abre um novo, acompanha status/histórico e conversa com a Lia.
>
> Mais à frente o HiperTMS terá **um único botão "Suporte"** que abre este portal
> com o cliente **já identificado** (sem novo login); o botão de WhatsApp atual
> deixa de ser separado e vira uma **opção dentro do portal**.
>
> Status: spec pronta para execução · Autor: Aria (Architect) · Data: 2026-06
> Base: ADR 015 (suporte), ADR 022 (handoff/token), ADR 026 (suporte é pós-venda),
> ADR 010 (connector), ADR 012 (action policy).

---

## Regras inegociáveis (valem para tudo abaixo)

1. **Escopo por identidade.** O cliente só enxerga os **próprios** chamados.
2. **Identidade vem do token assinado, nunca do que o cliente digita** (LGPD / anti-fraude).
3. **Reaproveitar o pipeline da Lia** (router → support → supervisor). Não criar um suporte novo.
4. **Dados operacionais do TMS via Connector/API, read-only.** **Nunca escrever no TMS.**
5. **Omnichannel:** o mesmo chamado pode vir de WhatsApp / e-mail / portal e aparece **unificado**.

---

## 1. Contexto

O Nexa já resolve o suporte conversacional pela Lia (pipeline da ADR 015) em cima
de `AiConversation`. Falta a **cara para o cliente**: hoje o cliente do HiperTMS só
fala com a Lia pelo WhatsApp (ADR 022, modalidades A/B). O portal é a evolução da
Modalidade C (web), porém como **página completa de autoatendimento**, não só um
widget de chat: lista de chamados, abertura, status/histórico e chat com a Lia.

Decisão já batida: construir só o **lado Nexa** agora. O HiperTMS apenas ganhará um
botão "Suporte" no fim — aqui definimos o **contrato** (§5), sem tocar no TMS.

Distinção importante:

| | Inbox interna `/support` (existe) | Portal `/portal` (este doc) |
|---|---|---|
| Público | agente/operador interno | **cliente final** do HiperTMS |
| Auth | JWT de usuário interno | **token assinado de cliente** (sessão separada) |
| Vê | todos os chamados do tenant | **só os do próprio cliente** |
| Objetivo | operar/triagem | autoatendimento + conversar com a Lia |

---

## 2. Estado atual (o que JÁ existe) ✅

- **Pipeline de suporte** (ADR 015): `support-agent`, `case-classifier-agent`,
  `diagnostic-agent`, `resolution-agent`, `escalation-agent`, orquestrados pelo
  `conversation-agent` + `router-agent`, com `supervisor-agent` auditando a saída.
- **`AiConversation` já é o "ticket".** Campos prontos: `status`, `ticketCategory`,
  `ticketPriority`, `rootCause`, `resolvedAt`, `autoCloseAt`, `outcome`,
  `sourceChannel`, `customerStage`, `correlationId`, `contactId`, `phone`.
  Enums: `ConversationStatus` (`open`, `waiting_customer`, `waiting_internal`,
  `escalated`, `opt_out`, `closed`) e `CustomerStage` (`lead`, `cliente_novo`,
  `cliente_ativo`).
- **Handoff token** (ADR 022 / modelo `HandoffToken`): `POST /api/handoff/token`
  (server-to-server, `Bearer TMS_SERVICE_TOKEN`) gera token nanoid 8, TTL 5 min,
  **uso único**, identidade = `externalId` + `name` (vem do token, nunca do
  WhatsApp). `HandoffService.create()` / `consume()` prontos.
- **Connector read-only** (ADR 010): `getContractStatus`, `getDocumentStatus`,
  `getRejectionInfo`, `lookupCustomer` — diagnóstico sem escrever no TMS.
- **WebSocket** já existe (`presentation/ws/conversations.gateway.ts`, Socket.IO).
- **Roteamento pós-venda** (ADR 026): cliente vai direto a suporte; prospect é
  orientado a se cadastrar (não entra no portal).

> Conclusão: a "máquina" de suporte existe. O portal é, sobretudo, **uma fachada
> de cliente com identidade própria** por cima do que já roda.

---

## 3. Mudanças por camada

### 3.1. Banco de dados (Prisma) — **requer migration (rodar: USER)**

1. **Novo canal** no enum `SourceChannel`:
   ```prisma
   enum SourceChannel { whatsapp telegram site instagram facebook email portal }
   ```
2. **Vincular conversa ao cliente do TMS** (chave do escopo omnichannel). Hoje a
   `AiConversation` não guarda `externalId`. Adicionar:
   ```prisma
   model AiConversation {
     // ...
     externalId String? @map("external_id") // id do cliente no TMS (quando identidade conhecida)
     @@index([tenantId, externalId])         // base da listagem do portal
   }
   ```
   Preencher `externalId` sempre que a identidade for conhecida: handoff (ADR 022),
   entrada pelo portal (token), ou `lookupCustomer` (ADR 026).
3. **Contato sem telefone (origem portal).** `Contact` é único por `(tenantId, phone)`
   e `phone` é obrigatório; um cliente que entra pelo portal pode não ter telefone.
   Decisão: adicionar `externalId` ao `Contact` e permitir upsert por `externalId`:
   ```prisma
   model Contact {
     // ...
     externalId String? @map("external_id")
     @@index([tenantId, externalId])
   }
   ```
   `AiConversation.contactId` continua obrigatório; o portal **upserta** um `Contact`
   por `(tenantId, externalId)` (nome vindo do token/connector) ao abrir o 1º chamado.
4. **Sessão do portal** é **stateless** (cookie JWT assinado — §4); **não** cria
   tabela de sessão. O **token de entrada** reutiliza `HandoffToken` (já existe).

> Migrations pequenas e aditivas (campos opcionais) — ver `docs/infra/prisma-migrations.md`.

### 3.2. Backend (NestJS)

Novo módulo `application/portal/` + `presentation/http/portal/`, **isolado** da
auth interna. Todas as rotas sob `/api/portal`, protegidas pelo `PortalSessionGuard`
(§4), com identidade derivada **só** da sessão.

**Endpoints (voltados ao cliente):**

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/portal/session` | Troca o **token de entrada** (do TMS) por um **cookie de sessão de portal** (HttpOnly). Body: `{ token }`. Resolve via `HandoffService.consume` → `{ externalId, tenantId, name }`. |
| `GET` | `/portal/me` | Perfil do cliente logado (nome do token) + dados read-only do Connector (`getContractStatus`: plano, status, limites). |
| `GET` | `/portal/tickets` | Lista os chamados **do cliente** (`where { tenantId, externalId }`). Filtros: `status`, `category`; busca; paginação (`PaginationQueryDto`). |
| `GET` | `/portal/tickets/:id` | Detalhe do chamado + mensagens. **Valida posse** (`conversation.externalId === sessão.externalId`), senão 404. |
| `POST` | `/portal/tickets` | Abre um chamado: cria `AiConversation` (`sourceChannel='portal'`, `customerStage='cliente_ativo'`, `externalId` da sessão) e injeta a 1ª mensagem no pipeline da Lia. |
| `POST` | `/portal/tickets/:id/messages` | Cliente envia mensagem → entra no **mesmo pipeline** (router→support→supervisor). Resposta da Lia volta pelo WS. |
| `POST` | `/portal/session/logout` | Limpa o cookie de sessão. |
| `WS` | `/ws/portal` | Tempo real **escopado à sessão** (só conversas com o `externalId` do cliente). |

**Reaproveitamento (não reimplementar):**

- Ingestão de mensagem: chamar o **mesmo ponto de entrada do `conversation-agent`**
  usado pelo WhatsApp/e-mail, mudando só `sourceChannel='portal'` e a **origem de
  identidade** (sessão do portal em vez de `lookupCustomer`). O pipeline (router →
  support → diagnostic/resolution/escalation → supervisor) é idêntico.
- Diagnóstico lê o TMS **via Connector** (read-only). Resolução que precise de ação
  passa pela **Action Policy** (ADR 012) — a IA solicita, o backend decide.
- Guardrails do `supervisor-agent` valem (anti-alucinação; **fiscal/financeiro com
  baixa confiança → escala humano, não responde** — ADR 015 D6).
- Fechamento: usa `resolvedAt`/`autoCloseAt` + Janitor de suporte (48h) já previstos
  na ADR 015 D5.

**Guard novo:** `PortalSessionGuard` (em `shared/auth/`), análogo ao JWT interno,
mas com **segredo e audience próprios** (§4). Popula `req.portalCustomer =
{ externalId, tenantId, name, productCode }`. Rate limiting (throttler) nas rotas do portal.

### 3.3. Frontend (React)

Nova área **pública** (fora do `Layout` interno e do `Outlet` protegido por JWT),
rota `/portal` em `App.tsx`. Reaproveita o design system (`components/ui/`).

- **Entrada `/portal`**: lê o token de entrada da URL (`?t=` / hash), chama
  `POST /portal/session`, **remove o token da URL** e guarda só o cookie. Sem token
  válido → tela "abra o suporte pelo seu painel HiperTMS" (sem login manual).
- **Lista de chamados**: tabela/cards com status (badge), categoria, última
  atividade; filtros por status/categoria; paginação (padrão `CampaignsPage`);
  botão **"Abrir chamado"**. Componentes de conversa já existem
  (`components/conversation/`: `ConversationStatusBadge`, `TicketCategoryBadge`,
  `ConversationTimeline`).
- **Detalhe do chamado**: histórico unificado (badge do canal: WhatsApp/e-mail/
  portal) + **chat com a Lia** em tempo real (WS `/ws/portal`), status e timeline.
- **Omnichannel:** a lista mostra **todos** os chamados do cliente, de qualquer
  canal (escopo por `externalId`). Dentro do chamado, botão **"Continuar no
  WhatsApp"** (gera `wa.me` com marcador de handoff) — substitui o botão separado.
- **Identidade visível**: nome do cliente (do token), plano/status (de `/portal/me`).
  Nunca pedir/confiar em identidade digitada.

---

## 4. Identidade & Segurança

**Duas credenciais distintas — nunca se cruzam:**

| | Token de **entrada** | Sessão de **portal** |
|---|---|---|
| O que é | `HandoffToken` (nanoid 8, opaco) | cookie **JWT** HttpOnly |
| Origem | gerado pelo TMS (server-to-server) | emitido pelo Nexa ao trocar o token |
| TTL / uso | 5 min, **uso único** | curta (ex. 30–60 min), renovável |
| Vai na URL? | sim (`?t=`), descartado após troca | **não** (só cookie HttpOnly/Secure/SameSite) |
| Segredo | — | `PORTAL_JWT_SECRET` (≠ `JWT_SECRET` interno), `aud: "portal"` |

Regras:

- **Identidade só do token/sessão.** `externalId`, `tenantId`, `name` vêm do token
  assinado; o que o cliente digita **nunca** define identidade (LGPD / anti-fraude).
- **Isolamento total da auth interna.** Segredo e `audience` próprios → um token de
  portal **não** acessa rotas internas e o JWT interno **não** acessa o portal.
  `PortalSessionGuard` só aceita `aud: "portal"`.
- **Escopo em toda query:** `where { tenantId, externalId }` derivado da sessão;
  ownership conferido no detalhe/mensagem (404 se não for do cliente).
- **Connector read-only** para qualquer dado do TMS; **zero escrita no TMS**.
- **Guardrails da Lia** continuam (supervisor): anti-alucinação e
  **fiscal/financeiro incerto → escala humano**.
- **Cookie**: `HttpOnly`, `Secure`, `SameSite` adequado ao embed (se o portal for
  aberto em iframe no TMS, definir `SameSite=None; Secure` + `frame-ancestors` do
  domínio do TMS no CSP). CORS restrito ao domínio do portal/TMS.
- **Rate limit** nas rotas do portal; tokens expirados/reusados → 401 + log de aviso
  (não falhar em silêncio).
- **`validateEnv`** passa a exigir `PORTAL_JWT_SECRET` em produção (ver
  `docs/security/secrets-management.md`).

---

## 5. Contrato de integração com o TMS (diferido — só implementar no TMS no fim)

Nada muda no HiperTMS agora. Quando formos plugar, o botão **"Suporte"** fará:

**Passo 1 — TMS gera o token (servidor, nunca no browser):**
```
POST https://nexa.hipervias.com.br/api/handoff/token
Authorization: Bearer <TMS_SERVICE_TOKEN>
Content-Type: application/json

{ "externalId": "<id do cliente no TMS>",
  "tenantId":   "<tenant>",
  "name":       "<nome do usuário logado>",
  "page":       "fiscal/cte",      // opcional — contexto
  "errorCode":  "562" }            // opcional — erro na tela
```
Resposta: `{ "token": "abc12345", "expiresIn": 300 }`

**Passo 2 — TMS abre o portal com o token (uso único, some da URL):**
```
https://nexa.hipervias.com.br/portal?t=abc12345
```

**Passo 3 — Nexa troca o token pela sessão** (`POST /portal/session`), seta o cookie
e o cliente já cai logado no portal, vendo os próprios chamados.

Definições do contrato:
- **Identidade autoritativa:** `externalId` do token (precedência absoluta, igual à
  regra D5 da ADR 022). O telefone, se houver, é só canal de contato.
- **Token opaco na URL** (não-JWT) → não vaza claims em histórico/log; os claims
  vivem no registro `HandoffToken` no servidor.
- **Reuso:** mesmo endpoint/segurança do handoff já existente (`TMS_SERVICE_TOKEN`
  fora do repo e fora do browser).
- **WhatsApp vira opção interna:** o botão separado de WhatsApp do TMS é aposentado;
  dentro do portal há "Continuar no WhatsApp" (gera `wa.me` com marcador `[via-painel-tms]`/handoff).
- **Responsável TMS:** Uelder (só no fim). Coordenar `TMS_SERVICE_TOKEN` e o domínio
  do portal (CORS/iframe) antes de ligar.

---

## 6. Ordem de implementação (sprints + dependências)

| Sprint | Entrega | Depende de |
|---|---|---|
| **S1 — Identidade & banco** | Migration (`portal` no enum, `externalId` em `AiConversation` e `Contact`, índices); `PortalSessionGuard` (`PORTAL_JWT_SECRET`/`aud`); `POST /portal/session` (troca token→cookie via `HandoffService.consume`); `GET /portal/me` (token + `getContractStatus`). | `HandoffToken`/`HandoffService` (já existe) |
| **S2 — Leitura de chamados** | `GET /portal/tickets` (escopo `externalId`, filtros status/categoria, paginação) + `GET /portal/tickets/:id` (detalhe+mensagens, ownership). | S1 |
| **S3 — Conversa/abertura** | `POST /portal/tickets` (abre via pipeline), `POST /portal/tickets/:id/messages` (ingestão no `conversation-agent`, `sourceChannel='portal'`), `WS /ws/portal` escopado. | S2 + pipeline ADR 015 |
| **S4 — Frontend do portal** | Rota pública `/portal`: entrada por token, lista, abrir, detalhe/chat em tempo real, status/timeline. | S1–S3 |
| **S5 — Omnichannel & fechamento** | Unificação por `externalId` (WhatsApp/e-mail/portal na mesma lista), "Continuar no WhatsApp", Janitor de suporte (48h, `autoCloseAt`), filtros. | S3 |
| **Diferido — TMS** | Botão "Suporte": chama `/handoff/token` e abre `/portal?t=`. Aposenta o botão de WhatsApp separado. | S1–S4 + Uelder |

---

## 7. Critérios de aceite

- [ ] Cliente entra no portal **sem login manual**, só com o token de entrada válido;
      token expirado/usado → bloqueia com mensagem clara (não loga ninguém).
- [ ] A lista mostra **apenas** os chamados do `externalId` da sessão; tentar acessar
      `/portal/tickets/:id` de outro cliente → **404** (nunca vaza).
- [ ] Identidade (nome/plano) vem do token + Connector; **nada** que o cliente digita
      muda quem ele é.
- [ ] Abrir chamado e mandar mensagem caem no **mesmo pipeline da Lia** (router →
      support → supervisor); resposta chega em tempo real pelo WS.
- [ ] Diagnóstico lê o TMS via Connector; **nenhuma** escrita no TMS em nenhum fluxo.
- [ ] Tema fiscal/financeiro com baixa confiança **escala humano** (não responde).
- [ ] Um chamado iniciado no WhatsApp aparece no portal do mesmo cliente (omnichannel),
      com o canal de cada mensagem identificado.
- [ ] Sessão do portal **não** acessa rotas internas e vice-versa (segredos/audience separados).
- [ ] Cookie HttpOnly/Secure; token de entrada some da URL após a troca.
- [ ] `validateEnv` aborta o boot em produção sem `PORTAL_JWT_SECRET`.

---

## 8. Casos de borda / risco

- **Cliente sem telefone (origem portal):** `AiConversation.contactId` é obrigatório.
  Mitigação: upsert de `Contact` por `(tenantId, externalId)` com `phone` opcional
  (requer relaxar o unique de phone ou usar phone sintético) — decidir na S1.
- **Múltiplos telefones/contatos para o mesmo cliente:** escopar por `externalId`
  (não por phone) evita fragmentar os chamados do cliente.
- **`externalId` ausente em conversas antigas:** as criadas antes do campo não
  aparecem no portal; rodar backfill (via `lookupCustomer` por phone) se necessário.
- **`TMS_DB_URL`/Connector indisponível:** `/portal/me` degrada (mostra nome do
  token, oculta plano) e o diagnóstico cai no fallback — **sem** quebrar o portal.
- **Token de entrada reusado/expirado:** uso único + TTL 5 min; 401 + log de aviso.
- **Embed em iframe (Modalidade C):** exige `SameSite=None; Secure` e
  `frame-ancestors` do domínio do TMS; sem isso o cookie não sobe no iframe.
- **Prospect tentando entrar no portal:** portal é **pós-venda** (ADR 026); sem
  `externalId` válido não há sessão — orientar cadastro, não atender.
- **LGPD / exclusão:** chamados são dado pessoal; herdam retenção/anonimização da
  ADR 005 (mensagens 24m). Exportação/exclusão do cliente deve cobrir o portal.
- **Confiança no `name` do token:** o nome é exibido; validar/sanitizar para não
  refletir conteúdo malicioso na UI (XSS) — escapar no frontend.

---

## 9. Referência

- ADR 015 — Arquitetura do Módulo de Suporte (pipeline, D5 fechamento, D6 escalonamento)
- ADR 022 — Botão "Falar com a Lia" / handoff token (identidade, `HandoffToken`)
- ADR 026 — Suporte é pós-venda (roteamento cliente × prospect)
- ADR 010 — Connector (leitura read-only do TMS) · ADR 012 — Action Policy
- Código: `application/agents/*` (pipeline) · `application/handoff/*` ·
  `presentation/ws/conversations.gateway.ts` · `prisma/schema.prisma` (`AiConversation`, `HandoffToken`)
- `docs/security/security-overview.md` · `docs/security/secrets-management.md`
- Formato e padrões: `docs/features/platform-admin/implementation.md` ·
  `docs/SPEC-LISTAS-FILTROS-CRUD.md`
