# Implementação — Suporte do Cliente NATIVO dentro do HiperTMS

> O cliente do TMS abre uma **tela nativa de suporte dentro do próprio HiperTMS**
> (React no `apps/web` do TMS), que consome **a API do Portal do Nexa** por trás.
> O cliente **nunca sai do TMS** nem vê o domínio do Nexa.
>
> Escopo: especifica os dois lados. O **Nexa** (este repo) já expõe a API do portal;
> o **HiperTMS** (`hipertms_v12`) é **read-only/spec** — só muda **com aprovação
> explícita do dono**. **Sem código agora.** · Status: pronto para revisão · 2026-06
> Base: ADR 022 (handoff), ADR 015 (suporte), `docs/features/support-portal/`.

## 1. Contexto

Hoje, no TMS, o botão **"Falar com a Lia (Suporte)"** (`apps/web/.../ChatList.tsx`
→ `application/lia-support/lia-support.service.ts`) gera um **handoff token** no Nexa
(`POST /api/handoff/token`) e **abre a página do portal no domínio do Nexa**
(`/portal?t=<token>`). O cliente sai do TMS.

**Mudança:** trocar o "abrir página externa" por uma **tela nativa** `/suporte` dentro
do TMS, que consome a API do portal do Nexa. Mesma esteira da Lia (resolve → escala →
humano), mas embutida — sem trocar de domínio.

## 2. Estado atual (o que JÁ existe)

**Nexa (pronto):** API do portal completa, sessão escopada por `(tenantId, externalId)`,
cookie `portal_session` (`httpOnly`, `secure`, `sameSite=none` em prod, `path=/api/portal`),
e `POST /api/handoff/token` (server-to-server, `Bearer TMS_SERVICE_TOKEN`).

**TMS (atual):** `LiaSupportService.buildHandoffLink()` retorna `{ url, mode }` — uma
**URL** (página do portal do Nexa, ou WhatsApp no fallback). O `ChatList.tsx` abre essa URL.

## 3. Contrato da API do Portal (Nexa) que a tela nativa consome

Todos sob `/api/portal`, **escopados por `(tenantId, externalId)` da sessão** — o
cliente só vê os **próprios** chamados.

| Método | Rota | Body / Retorno |
|---|---|---|
| `POST` | `/api/portal/session` | `{ token }` (handoff) → estabelece sessão; retorna `{ customer }` |
| `GET` | `/api/portal/me` | perfil do cliente (identidade + contrato read-only do TMS) |
| `GET` | `/api/portal/tickets` | lista os chamados do cliente (filtros/paginação) |
| `GET` | `/api/portal/tickets/:id` | detalhe + mensagens (404 se não for do cliente) |
| `POST` | `/api/portal/tickets` | `{ message }` → abre chamado (entra no pipeline da Lia) |
| `POST` | `/api/portal/tickets/:id/replies` | `{ body }` → responde no chamado |
| `DELETE` | `/api/portal/session` | encerra a sessão (204) |

> Identidade vem **sempre** do token/sessão, nunca do que o cliente digita (LGPD).
> Detalhes do backend: `docs/features/support-portal/implementation.md`.

## 4. Autenticação cross-subdomínio (decisão importante)

A tela nativa roda em `www.hipertms.com.br` e chama a API em `nexa.hipertms.com.br`.
Como ambos são **`hipertms.com.br`** (mesmo *registrable domain* = **same-site**), há
duas formas de carregar a sessão:

### Opção A — Cookie de sessão (o que já existe)
- O cookie `portal_session` é `sameSite=none; secure; path=/api/portal`. Por serem
  **same-site** (subdomínios do mesmo domínio), o browser **envia** o cookie nas
  chamadas de `www` → `nexa` desde que:
  - o frontend do TMS chame com **`withCredentials: true`** (axios) / `credentials: 'include'` (fetch);
  - o **CORS do Nexa** (`CORS_ORIGINS`) inclua `https://www.hipertms.com.br` **e**
    `credentials: true` (e não use `origin: *` junto com credenciais).
- **Prós:** zero gestão de token no browser; já implementado.
- **Contras:** depende de política de cookies do browser (SameSite=None exige HTTPS;
  endurecimentos futuros de cookies de terceiros podem incomodar mesmo same-site);
  quebra se um dia os domínios **não** forem same-site.

### Opção B — Bearer token (alternativa de robustez) — **recomendada para o embed**
- `POST /api/portal/session` retorna o **JWT da sessão no corpo**:
  `{ jwt: "<token>", expiresAt: "<iso>", name: "<nome>" }`. A tela nativa guarda o JWT
  **em memória** (não em `localStorage`) e envia `Authorization: Bearer <jwt>` em cada chamada.
- O `PortalSessionGuard` aceita os dois: o cookie `portal_session` **ou**
  o header `Authorization: Bearer` (mesma verificação, `aud:portal`).
- **Prós:** imune a quirks de cookie cross-site/ITP; funciona mesmo se os domínios
  deixarem de ser same-site; explícito e previsível para um embed.
- **Contras:** o frontend gerencia o token (curto, em memória; renovar ao expirar).

### Recomendação
Para a **tela nativa embutida**, usar **Bearer (Opção B)** como caminho principal —
mais robusto e independente de política de cookies. Manter o **cookie (Opção A)** para
o **portal standalone** (`/portal`, ADR 027/portal). O guard já aceita ambos.

## 5. Ajuste no TMS backend (`LiaSupportService`)

Hoje devolve `{ url, mode }`. Para o fluxo nativo, **expor o token/sessão** ao
frontend do TMS (sem navegar para fora). Dois desenhos:

- **Desenho 1 (recomendado) — devolver o handoff token:**
  novo endpoint (ex.: `POST /lia-support/session`) retorna
  `{ token, expiresIn }` (o handoff token já gerado server-to-server) **+**
  `{ whatsappUrl }` como fallback. O **frontend do TMS** então chama
  `POST nexa/api/portal/session { token }` e recebe a sessão (Bearer, Opção B).
  - Vantagem: o `TMS_SERVICE_TOKEN` continua **só no backend do TMS**; o browser só
    vê o handoff token (curto, uso único) e o Bearer da sessão.
- **Desenho 2 — estabelecer a sessão server-side:**
  o backend do TMS chama `nexa/api/portal/session` ele mesmo e devolve a sessão pronta
  ao frontend. Mais saltos server-to-server; geralmente desnecessário.

> Manter o **fallback de WhatsApp** (Modalidade A) caso o Nexa não responda — o botão
> nunca pode ficar sem saída (igual hoje).

## 6. TMS frontend — tela nativa de suporte

- Nova rota/página, ex.: **`/suporte`** no `apps/web` do TMS.
- Componentes (reaproveitando o visual/design system do widget de chat já existente):
  - **Lista de chamados** (`GET /api/portal/tickets`) — status, categoria, última atividade.
  - **Abrir chamado** (`POST /api/portal/tickets { message }`).
  - **Detalhe + mensagens** (`GET /api/portal/tickets/:id`) e **responder**
    (`POST /api/portal/tickets/:id/messages { message }`).
  - **Tempo real** (opcional, fase 2): conectar no WS do Nexa para receber respostas
    da Lia ao vivo (ver ADR 027 — web chat). No MVP, *polling* do detalhe já resolve.
- Fluxo de entrada: ao abrir `/suporte`, o TMS obtém o token (via seu backend, §5),
  troca por sessão no Nexa (§4 Opção B) e renderiza a tela. Erro/Nexa fora → CTA de
  WhatsApp (fallback).
- O botão **"Falar com a Lia (Suporte)"** (`ChatList.tsx`) passa a **navegar para
  `/suporte`** (rota interna) em vez de abrir a URL do portal do Nexa.

## 7. Variáveis de ambiente

| Lado | Variável | Papel |
|---|---|---|
| **TMS** | `NEXA_API_URL` | Base da API do Nexa (ex.: `https://nexa.hipertms.com.br`). |
| **TMS** | `TMS_SERVICE_TOKEN` | Segredo server-to-server p/ gerar o handoff — **só no backend**. |
| **TMS** | `LIA_WHATSAPP_NUMBER` | Fallback de WhatsApp (já existe). |
| **Nexa** | `CORS_ORIGINS` | Deve incluir `https://www.hipertms.com.br` (origem da tela nativa). |
| **Nexa** | `TMS_SERVICE_TOKEN` | **Igual** ao do TMS (valida o handoff server-to-server). |

> `TMS_SERVICE_TOKEN` precisa ser **idêntico** nos dois lados. Nunca no browser, nunca
> no repositório (ver `docs/security/secrets-management.md`).

## 8. Segurança

- Identidade do cliente vem do **handoff token** (`externalId`, gerado server-to-server),
  nunca do input do cliente (ADR 022 D5).
- Escopo `(tenantId, externalId)` em toda chamada — cliente só vê os próprios chamados.
- API do portal é **read/own-only**; leitura de dado do TMS é via Connector read-only;
  **nunca** escreve no TMS.
- Bearer da sessão: curto, em memória, renovar ao expirar; cookie: `secure`+`sameSite=none`.

## 9. Critérios de aceite

- [ ] Cliente abre `/suporte` **dentro do TMS** e vê seus chamados — sem trocar de domínio.
- [ ] Abrir/responder chamado funciona via API do portal; respostas da Lia aparecem.
- [ ] Cliente **só** vê os próprios chamados (escopo por `externalId`); acesso a `:id`
      de outro cliente → 404.
- [ ] Auth funciona cross-subdomínio (Bearer recomendado; cookie como alternativa same-site).
- [ ] `TMS_SERVICE_TOKEN` nunca chega ao browser; CORS do Nexa libera o domínio do TMS.
- [ ] Nexa indisponível → fallback de WhatsApp (botão nunca quebra).

## 10. Casos de borda / dependências

- **Handoff token expirado/uso único:** a tela troca por sessão **imediatamente** ao
  abrir; se expirar, regenerar (novo clique).
- **Sessão expira durante o uso:** tratar 401 → re-obter token/sessão transparente.
- **Cliente sem `externalId` válido (prospect):** suporte é pós-venda (ADR 026) —
  orientar cadastro; não abrir tela de chamados.
- **Mudança no TMS exige aprovação do dono** (`hipertms_v12`): este doc **especifica**;
  a implementação no TMS vem depois, com permissão.

## 11. Relacionados

- `docs/features/support-portal/implementation.md` (API/portal e sessão)
- ADR 022 — Handoff · ADR 027 — Web chat embutido · ADR 015 — Suporte · ADR 026 — pós-venda
- TMS (spec): `apps/web/.../ChatList.tsx`, `application/lia-support/lia-support.service.ts`
- `docs/security/secrets-management.md` · `docs/infra/deploy-env-production.md`
