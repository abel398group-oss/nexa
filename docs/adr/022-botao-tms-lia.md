# ADR 022 — Botão "Falar com a Lia" no Site/App do HiperTMS

**Status:** Proposto · **Data:** 2026-06
**Revisão:** 2026-06-09 — adicionada regra de precedência de identidade (token B tem
prioridade sobre lookupCustomer), aproveitamento do ?text= como marcador na Modalidade A,
texto alinhado entre exemplo HTML e mensagem sugerida.

---

## Contexto

Hoje um cliente do HiperTMS que tem dúvida precisa sair do sistema e abrir o WhatsApp
manualmente — sem contexto, sem identificação automática, sem rastreio.

O objetivo é colocar um botão no site/painel do HiperTMS que leve o usuário **diretamente
para a Lia**, já identificado, com contexto da sessão (qual página, qual problema).

---

## Decisão

### D1 — Três modalidades (do mais simples ao mais completo)

| Modalidade | Como funciona | Esforço | Recomendação |
|---|---|---|---|
| **A — Link WhatsApp** | Botão abre `wa.me/55...?text=...` com mensagem pré-preenchida | Mínimo (HTML puro) | ✅ MVP imediato |
| **B — Link contextual assinado** | Mensagem inclui token curto que a Lia decodifica para saber quem é o cliente | Baixo (endpoint Nexa) | ✅ Sprint seguinte |
| **C — Web Chat embutido** | Widget iframe/JS dentro do painel do TMS | Alto (novo canal) | 🔵 Phase 2 |

**MVP:** Modalidade A agora. Modalidade B na sequência. C no roadmap.

---

### Modalidade A — Link WhatsApp (MVP)

**Implementação no lado TMS (zero mudanças no Nexa):**

```html
<!-- Botão no painel do HiperTMS -->
<a
  href="https://wa.me/5511994327713?text=Olá%2C%20sou%20cliente%20do%20HiperTMS%20e%20preciso%20de%20ajuda.%20%5Bvia-painel-tms%5D"
  target="_blank"
  rel="noopener"
  class="btn-suporte-lia"
>
  💬 Falar com a Lia
</a>
```

O número `5511994327713` é o número da Lia (WAHA).

**Mensagem pré-preenchida:**

> `Olá, sou cliente do HiperTMS e preciso de ajuda. [via-painel-tms]`

O marcador `[via-painel-tms]` é intencionalmente visível. A Lia detecta esse marcador
e **vai direto para o pipeline de suporte**, sem passar pelo lookup de vendas — mesmo
que `lookupCustomer()` ainda não tenha retornado. Benefício: elimina a pergunta
"você é cliente?" e agiliza o atendimento.

A Lia remove o marcador antes de responder (nunca aparece na resposta ao cliente).

**Limitação:** sem contexto da página. A Lia pergunta o que o cliente precisa.

---

### Modalidade B — Link Contextual Assinado

**Fluxo:**

```
[Painel TMS] Usuário clica "Falar com a Lia"
  → TMS chama (servidor): POST https://nexa.hipervias.com.br/api/handoff/token
    body: { externalId, tenantId, page, errorCode? }
    header: Authorization: Bearer TMS_SERVICE_TOKEN
  → Nexa retorna: { token: "abc123", expiresIn: 300 }
  → TMS monta link: https://wa.me/55...?text=HANDOFF:abc123
  → Usuário clica e envia a mensagem no WhatsApp
  → Lia recebe "HANDOFF:abc123"
  → Nexa resolve o token → sabe quem é o cliente, qual página, qual erro
  → Lia responde: "Olá João! Vi que você estava na tela de CT-e. O que aconteceu?"
```

**Endpoint Nexa novo:**
- `POST /api/handoff/token` — gera token curto (TTL 5 min, uso único)
- Payload: `{ externalId, tenantId, page?, errorCode? }`
- Autenticação: `TMS_SERVICE_TOKEN` (server-to-server — **nunca exposto ao browser**)

**Token resolve em:**
- `externalId` do cliente no TMS
- Página de origem (`page: "fiscal/cte"` → Lia já sabe o contexto)
- `errorCode` opcional (se a página mostrou um erro, Lia já recebe o código)

### D5 — Regra de identidade (crítica — Modalidade B)

Quando a Lia recebe uma mensagem com token HANDOFF, há dois sinais de identidade:
1. O `externalId` do token (gerado pelo TMS, autenticado server-to-server)
2. O telefone do WhatsApp remetente (que pode não estar cadastrado no TMS)

**Regra:** o `externalId` do token tem **prioridade absoluta**. O `lookupCustomer(phone)`
**não é chamado** quando o token é válido e não-expirado. O telefone é apenas registrado
como canal de contato.

Motivo: o telefone pode ser de um usuário diferente do cadastrado no TMS (funcionário
usando o celular pessoal, por exemplo). O token é a fonte de verdade de identidade nesse
caso.

**Schema:**
```prisma
model HandoffToken {
  id         String    @id @default(uuid())
  token      String    @unique  // curto e URL-safe (nanoid 8 chars)
  tenantId   String    @map("tenant_id")
  externalId String    @map("external_id")
  page       String?
  errorCode  String?   @map("error_code")
  usedAt     DateTime? @map("used_at")      // uso único: nulo até ser consumido
  expiresAt  DateTime  @map("expires_at")   // TTL 5 minutos
  createdAt  DateTime  @default(now()) @map("created_at")

  @@index([token])
  @@map("handoff_tokens")
}
```

---

### Modalidade C — Web Chat Embutido (Phase 2)

> **Status (2026-06): em implementação.** O detalhamento da Modalidade C foi
> promovido para a **ADR 027 — Web Chat de Suporte embutido** (canal `web_chat`,
> transporte Socket.IO, autenticação do widget, fallback de WhatsApp). PRD em
> `docs/features/support-web-chat/prd.md`.

Widget JavaScript embutido no painel do HiperTMS que abre um chat sem sair da tela.

```
[Painel TMS]
  → Script: <script src="https://nexa.hipervias.com.br/widget.js" data-token="..."></script>
  → Abre chat flutuante (iframe seguro)
  → Mensagens via WebSocket (Socket.IO — já existe no backend)
  → Canal: SourceChannel.web_chat
```

Requer: novo `SourceChannel.web_chat`, widget frontend, autenticação por iframe.
**Não entra antes do DigitalOcean deploy.**

---

## Comparativo de valor

| Modalidade | Identifica cliente | Tem contexto | Esforço | Quando |
|---|---|---|---|---|
| A — Link + marcador `[via-painel-tms]` | Via lookupCustomer + roteamento direto | ❌ sem página/erro | 1h | **Agora** |
| B — Token contextual assinado | ✅ token tem precedência sobre lookup | ✅ página + código de erro | 1 sprint | Pós-deploy |
| C — Web chat embutido | ✅ total | ✅ total | 2-3 sprints | **Em implementação (ADR 027)** |

---

## O que o TMS precisa fazer

**Modalidade A:** apenas adicionar o botão HTML com o link montado acima.
Zero API, zero dependência do Nexa. O time do TMS (Uelder) faz sozinho.

**Modalidade B:** coordenação com Uelder:
1. Nexa expõe `POST /api/handoff/token`
2. TMS chama o endpoint no servidor (nunca no frontend)
3. `TMS_SERVICE_TOKEN` compartilhado de forma segura (nunca em código-fonte)

---

## Consequências

**Positivas:**
- Modalidade A em 1h: cliente do TMS chega direto no suporte sem fricção.
- Marcador `[via-painel-tms]` resolve o roteamento sem custo de lookup.
- Modalidade B elimina a pergunta de identificação completamente.

**Custos:**
- Modalidade B exige coordenação com Uelder + `TMS_SERVICE_TOKEN` seguro.
- Regra de identidade (D5) precisa ser implementada no `ConversationAgentService`.
- Tokens expirados/reutilizados devem logar warning (não falhar silenciosamente).

---

## Relacionados

ADR 015 (Suporte) · ADR 010 (Connector) · ADR 012 (Segurança) · ADR 013 (Ambiente)

---

## Nota — Responsabilidade do botão (Uelder / time TMS)

**Data:** 2026-06-10

| Modalidade | Quem implementa | Dependência externa |
|---|---|---|
| **A — Link WhatsApp (MVP)** | **Time TMS (Uelder)** — zero dependência do Nexa | Nenhuma. HTML puro com o número da Lia e o marcador `[via-painel-tms]` no `?text=`. |
| **B — Token contextual** | **Nexa** expõe o endpoint · **Uelder** chama no servidor | Endpoint `POST /api/handoff/token` no Nexa deve estar pronto antes. Coordenar a entrega dos dois lados. `TMS_SERVICE_TOKEN` compartilhado de forma segura (fora do repo, fora do browser). |
| **C — Web Chat** | Nexa (widget + backend) | Não entra antes do DigitalOcean deploy. |

**Ação imediata para Uelder (Modalidade A):**

Adicionar no painel do HiperTMS o botão:

```html
<a
  href="https://wa.me/5511994327713?text=Ol%C3%A1%2C%20sou%20cliente%20do%20HiperTMS%20e%20preciso%20de%20ajuda.%20%5Bvia-painel-tms%5D"
  target="_blank"
  rel="noopener"
>
  💬 Falar com a Lia
</a>
```

O `[via-painel-tms]` garante que a Lia vá direto para o suporte sem perguntar
se o cliente já usa o sistema.

---

## Adendo (08/08/2026) — Modalidades A e B SUPERADAS

Decisão de produto: **suporte é exclusivo do chat embutido no HiperTMS e da
abertura de chamado.** O WhatsApp passa a ser canal exclusivamente comercial.

Consequência para esta ADR:

- **Modalidade A** (botão abrindo `wa.me` com o marcador `[via-painel-tms]`) e
  **Modalidade B** (`wa.me` com `HANDOFF:<token>`) estão **superadas**. A
  Modalidade C — widget embutido, detalhada na ADR 027 — é o único caminho de
  suporte.
- O frontend do TMS já não usava nenhuma das duas: o endpoint `POST /lia-handoff`
  (`lia-support.controller.ts`) existe mas nenhum componente o chama. Ou seja, o
  TMS já se comportava assim; o Nexa é que continuava aceitando.
- No Nexa, o marcador e o token **só são honrados em canal de suporte**
  (`web_chat`, `portal`) — ver `conversation-track.ts`. Chegando pelo WhatsApp,
  ficam registrados em log e a rota permanece comercial. O token nem é consumido:
  ele é de uso único, e queimá-lo aqui invalidaria a sessão que o cliente abriria
  no widget em seguida.
- Cliente do HiperTMS que pede suporte pelo WhatsApp é **direcionado** ao chat do
  sistema (`SCRIPTS.suporteCanalComercial`). A Lia não diagnostica, não abre
  chamado e não escala por lá.
- Quem **não** é cliente e pede suporte pelo WhatsApp continua recebendo a
  orientação comercial (`SCRIPTS.supportSemCadastro`) — não tem acesso ao chat do
  HiperTMS, então mandá-lo para lá seria um beco sem saída.

O endpoint `POST /lia-handoff` do TMS não foi removido: mexer no repo do TMS exige
combinar com o Abel (REGRA 8). Ele está inerte — nada o chama, e o Nexa ignora o
resultado dele em canal comercial.
