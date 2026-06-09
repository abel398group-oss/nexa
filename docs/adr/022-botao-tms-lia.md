# ADR 022 — Botão "Falar com a Lia" no Site/App do HiperTMS

**Status:** Proposto · **Data:** 2026-06

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
| **B — Link contextual assinado** | URL com token curto (`?ctx=abc123`) que a Lia decodifica para saber quem é o cliente | Baixo (endpoint Nexa) | ✅ Sprint seguinte |
| **C — Web Chat embutido** | Widget iframe/JS dentro do painel do TMS | Alto (novo canal) | 🔵 Phase 2 |

**MVP:** Modalidade A agora. Modalidade B na sequência. C no roadmap.

---

### Modalidade A — Link WhatsApp (MVP)

**Implementação no lado TMS (zero mudanças no Nexa):**

```html
<!-- Botão no painel do HiperTMS -->
<a
  href="https://wa.me/5511994327713?text=Olá,%20preciso%20de%20ajuda%20com%20o%20HiperTMS"
  target="_blank"
  rel="noopener"
  class="btn-suporte-lia"
>
  💬 Falar com a Lia
</a>
```

O número `5511994327713` é o número da Lia (WAHA).

**Mensagem pré-preenchida sugerida:**

> `Olá, sou cliente do HiperTMS e preciso de ajuda.`

O cliente envia a mensagem, o WhatsApp abre, a Lia já identifica o número via
`lookupCustomer()` e trata como suporte.

**Limitação:** sem contexto da página. A Lia pergunta o que o cliente precisa.

---

### Modalidade B — Link Contextual Assinado

**Fluxo:**

```
[Painel TMS] Usuário clica "Falar com a Lia"
  → TMS chama: POST https://nexa.hipervias.com.br/api/handoff/token
    body: { externalId, tenantId, page, userId }
    header: Authorization: Bearer TMS_SERVICE_TOKEN
  → Nexa retorna: { token: "abc123", expiresIn: 300 }
  → TMS monta URL: https://wa.me/55...?text=HANDOFF:abc123
  → Usuário envia a mensagem
  → Lia recebe "HANDOFF:abc123"
  → Nexa resolve o token → já sabe quem é o cliente, qual página
  → Lia responde personalizada: "Olá João! Vi que você estava na tela de CT-e. Como posso ajudar?"
```

**Endpoint Nexa novo:**
- `POST /api/handoff/token` — gera token curto (TTL 5 min, uso único)
- Payload: `{ externalId, tenantId, page?, errorCode? }`
- Autenticação: `TMS_SERVICE_TOKEN` (server-to-server, nunca exposto ao browser)

**Token resolve em:**
- `externalId` do cliente no TMS
- Página de origem (`page: "fiscal/cte"` → Lia já sabe o contexto)
- `errorCode` opcional (se a página mostrou um erro, Lia já recebe o código)

**Schema:**
```prisma
model HandoffToken {
  id         String   @id @default(uuid())
  token      String   @unique  // abc123 — curto e URL-safe
  tenantId   String   @map("tenant_id")
  externalId String   @map("external_id")
  page       String?
  errorCode  String?  @map("error_code")
  usedAt     DateTime? @map("used_at")
  expiresAt  DateTime  @map("expires_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  @@index([token])
  @@map("handoff_tokens")
}
```

---

### Modalidade C — Web Chat Embutido (Phase 2)

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
| A — Link simples | Via lookupCustomer (automático) | ❌ sem contexto | 1h | Agora |
| B — Link contextual | ✅ automático + rico | ✅ página + erro | 1 sprint | Pós-deploy |
| C — Web chat | ✅ total | ✅ total | 2-3 sprints | Roadmap |

---

## O que o TMS precisa fazer

Para a **Modalidade A** (MVP): apenas adicionar o botão HTML com o número da Lia.
Zero dependência de API — pode ser feito pelo time do TMS independentemente.

Para a **Modalidade B**: endpoint `POST /api/handoff/token` no Nexa deve estar pronto
e acessível. O TMS chama esse endpoint no backend (server-to-server, com o token).

---

## Consequências

**Positivas:**
- Canal de suporte integrado ao fluxo do TMS — reduz fricção do cliente
- Contextualização automática reduz tempo de diagnóstico
- Modalidade A pronta em 1h sem dependência de código

**Custos:**
- Modalidade B exige coordenação com o time do TMS (Uelder)
- Cuidado com segurança do `TMS_SERVICE_TOKEN` (server-side only, nunca no browser)

---

## Relacionados

ADR 015 (Suporte) · ADR 010 (Connector) · ADR 013 (Ambiente)
