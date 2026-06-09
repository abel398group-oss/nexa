# ADR 021 — Canal de Leads via E-mail

**Status:** Proposto · **Data:** 2026-06

---

## Contexto

Hoje o Nexa captura leads exclusivamente via WhatsApp (WAHA). O HiperTMS também recebe
interesse de clientes por e-mail — formulários do site, e-mails diretos para
`contato@hipervias.com.br`, respostas de campanhas de e-mail marketing.

Esses leads chegam fora do funil da Lia, são atendidos manualmente e perdem o benefício
da qualificação automática, follow-up e notificação ao vendedor.

---

## Decisão

### D1 — Modelo de integração

O canal de e-mail **não substitui** o WhatsApp — é um canal paralelo. A Lia processa
a mensagem, qualifica o lead e o fluxo comercial continua **idêntico** ao WhatsApp.
Diferença: a resposta vai por e-mail (não WhatsApp) até que o lead forneça um número.

```
E-mail recebido
  → Webhook (provider: Mailgun / SendGrid / IMAP polling)
  → Normalize Email Message
  → Upsert Contact (email como chave alternativa, phone = null)
  → Create Interaction (sourceChannel = "email")
  → ConversationAgentService (mesmo pipeline)
  → Send Reply por e-mail (não WhatsApp)
  → [opcional] Capturar telefone → migrar para WhatsApp
```

### D2 — Identificação do contato

| Chave de identificação | Prioridade |
|---|---|
| Phone (já existe) | 1ª — contato já conhecido via WhatsApp |
| Email | 2ª — novo contato via e-mail |

Se o mesmo e-mail já tem uma conversa WhatsApp aberta: **une no mesmo contato**
(`externalContactId` como elo), não cria duplicado.

Novo campo no schema: `email` em `contacts` (já existe) passa a ser chave de busca
alternativa no `upsert`.

### D3 — Provider de e-mail (opções)

| Provider | Prós | Contras | Recomendação |
|---|---|---|---|
| **Mailgun Inbound Routes** | Webhook HTTP simples, sem infraestrutura | Pago após 100/dia | ✅ Recomendado |
| **SendGrid Inbound Parse** | Mesma simplicidade | Pago | ✅ Alternativa |
| **Gmail/IMAP polling** | Grátis, domínio próprio | Polling (delay 1-5min), complexidade | 🟡 Fallback |
| **Cloudflare Email Workers** | Grátis, no Edge | Curva de aprendizado | 🟡 Avançado |

**Decisão:** Mailgun Inbound Routes como primeiro provider. Interface é um `EmailGateway`
(análogo ao WAHA), podendo trocar sem mudar o pipeline.

### D4 — Novo enum `SourceChannel`

```typescript
// Adição ao enum existente
enum SourceChannel {
  whatsapp   // já existe
  email      // novo
  web_chat   // futuro (ADR 022)
}
```

### D5 — Fluxo de resposta por e-mail

A Lia responde para o e-mail de origem. Formato:

- **Subject:** `Re: [assunto original]` ou `"Sobre o HiperTMS — Lia responde"`
- **Body:** Texto plain (sem HTML para primeiro MVP) + assinatura padrão
- **Assinatura:** `Lia · Assistente HiperTMS | hipervias.com.br`
- **Reply-to:** endereço de e-mail da empresa (não o e-mail de envio do sistema)

### D6 — Conversão WhatsApp

Quando a Lia identificar um lead qualificado via e-mail (score ≥ 40), ela inclui na
resposta um convite para continuar via WhatsApp:

> *"Para agilizar seu atendimento, você pode também nos chamar no WhatsApp: [link wa.me]"*

Se o lead responder com um número de telefone, o contato é unificado e a conversa
continua via WhatsApp.

### D7 — O que NÃO entra no MVP

- Parsing de anexos (PDFs, planilhas)
- Thread tracking multi-turno complexo (conversas longas por e-mail)
- HTML e-mail no envio (plain text apenas)
- Interface de caixa de entrada no frontend (conversas de e-mail aparecem na inbox normal)

---

## Schema changes

```prisma
// AiConversation — sourceChannel já tem o enum, só adicionar "email"
// Contact — já tem campo email, adicionar índice único por (tenantId, email)

model Contact {
  ...
  @@unique([tenantId, email])  // novo índice (além do existente [tenantId, phone])
}
```

Novo modelo para configuração do canal:

```prisma
model EmailChannel {
  id          String  @id @default(uuid())
  tenantId    String  @map("tenant_id")
  provider    String  // mailgun | sendgrid | imap
  inboxEmail  String  @map("inbox_email")  // e-mail que recebe
  apiKey      String? @map("api_key")      // nunca em texto claro — criptografar
  isActive    Boolean @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([tenantId])
  @@map("email_channels")
}
```

---

## Consequências

**Positivas:**
- Captura leads de um canal que hoje é ponto cego
- Mesmo pipeline de qualificação → dados comparáveis entre canais
- Possibilidade de campanhas de e-mail → qualificação automática de respostas

**Custos:**
- Novo provider externo (Mailgun ou similar) — custo operacional
- Lógica de deduplicação contato phone×email
- Tratamento de spam/bounce

---

## Relacionados

ADR 010 (Connector) · ADR 009 (Leads como plataforma) · ADR 022 (Web Chat — futuro)
