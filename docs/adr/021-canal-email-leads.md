# ADR 021 — Canal de Leads via E-mail

**Status:** Proposto · **Data:** 2026-06
**Revisão:** 2026-06-09 — corrigida dedup phone×email (expectativa de união automática
era excessiva), adicionado opt-out LGPD obrigatório, adicionada validação SPF/DKIM
e referência ao ADR 012 (prompt-injection), corrigido índice unique de email (NULL).

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
  → Validar SPF/DKIM + rate-limit (ver D8)   ← segurança, antes do pipeline
  → Normalize Email Message
  → Upsert Contact (email como chave, phone = null)
  → Create Interaction (sourceChannel = "email")
  → ConversationAgentService (mesmo pipeline)
  → Send Reply por e-mail (não WhatsApp)
  → [lead qualificado] Convite para WhatsApp (D6)
```

### D2 — Identificação do contato (dedup realista)

| Situação | Comportamento |
|---|---|
| E-mail nunca visto, sem telefone | Cria contato novo com `phone = null` |
| E-mail já associado a contato existente | Reaproveita o contato |
| E-mail + telefone enviado na mensagem | Une no contato do telefone (operador confirma) |
| Mesmo e-mail com contato WhatsApp ativo | **Não une automaticamente** — alerta o operador para fazer a unificação manual |

**Regra importante:** a união automática de phone×email só ocorre quando o próprio lead
fornece os dois identificadores explicitamente na mesma conversa. Não inferir por
`externalContactId` sem um dos dois identificadores primários em comum — risco de
unir contatos de pessoas diferentes da mesma empresa.

### D3 — Provider de e-mail (opções)

| Provider | Prós | Contras | Recomendação |
|---|---|---|---|
| **Mailgun Inbound Routes** | Webhook HTTP simples; SPF/DKIM verificados pelo provider | Pago após 100/dia | ✅ Recomendado |
| **SendGrid Inbound Parse** | Mesma simplicidade | Pago | ✅ Alternativa |
| **Gmail/IMAP polling** | Grátis, domínio próprio | Polling (delay 1-5min), sem SPF/DKIM automático | 🟡 Fallback |
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
- **Body:** Texto plain (sem HTML para MVP) + assinatura + **link de descadastro** (obrigatório — ver D9)
- **Assinatura:** `Lia · Assistente HiperTMS | hipervias.com.br`
- **Reply-to:** endereço de e-mail da empresa (não o endereço de envio do sistema)

### D6 — Conversão WhatsApp

Quando a Lia identificar um lead qualificado via e-mail (score ≥ 40), ela inclui na
resposta um convite para continuar via WhatsApp:

> *"Para agilizar seu atendimento, você pode também nos chamar no WhatsApp: [link wa.me]"*

Se o lead responder com um número de telefone, o operador une os contatos manualmente
ou o sistema une na próxima mensagem WhatsApp do mesmo número (via upsert normal).

### D7 — O que NÃO entra no MVP

- Parsing de anexos (PDFs, planilhas)
- Thread tracking multi-turno complexo (conversas longas por e-mail)
- HTML e-mail no envio (plain text apenas)
- Interface de caixa de entrada separada (conversas de e-mail aparecem na inbox normal)
- União automática de contatos phone×email sem confirmação

### D8 — Segurança (obrigatório antes do go-live)

O corpo de um e-mail é uma superfície de prompt-injection: qualquer pessoa pode enviar
um e-mail com texto malicioso para disparar o Claude com custo e risco.

**Controles obrigatórios:**

1. **Validação SPF/DKIM:** rejeitar e-mails que falham na verificação (Mailgun faz
   automaticamente; IMAP polling precisa verificar manualmente via biblioteca).
2. **Rate-limit por endereço de e-mail:** máximo 10 e-mails/hora por remetente.
3. **Sanitização de conteúdo:** aplicar as mesmas regras do ADR 012 (prompt-injection):
   corpo do e-mail é tratado como dado, não como instrução. A Lia nunca executa
   comandos presentes no corpo do e-mail.
4. **Allowlist de domínios (opcional, fase 2):** ignorar e-mails de domínios de
   e-mail temporário (mailinator, guerrillamail, etc.).

### D9 — Opt-out de e-mail (obrigatório — LGPD + anti-spam)

Todo e-mail enviado pela Lia deve incluir link de descadastro na assinatura:

```
Para não receber mais mensagens: [link de opt-out]
```

O link aponta para `GET /api/email/optout?token=<jwt_assinado>` — que marca
`contact.status = 'opted_out'` e `contact.optOutAt = now`.

Após opt-out:
- Contato não recebe mais respostas por e-mail
- `enrichContact()` não roda mais para esse contato (ADR 020 D6)
- Tratamento idêntico ao opt-out WhatsApp (SAIR/STOP)

---

## Schema changes

```prisma
// AiConversation — sourceChannel: adicionar "email" ao enum

// Contact — índice único por email (com cuidado para NULL):
// Postgres permite múltiplos NULL em índice UNIQUE — correto.
// IMPORTANTE: nunca salvar email como "" (string vazia) — sempre NULL se ausente.
model Contact {
  ...
  email    String?  // armazenar NULL quando ausente, NUNCA string vazia
  @@unique([tenantId, email])  // Postgres trata múltiplos NULL corretamente
}
```

Novo modelo para configuração do canal:

```prisma
model EmailChannel {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  provider    String   // mailgun | sendgrid | imap
  inboxEmail  String   @map("inbox_email")
  apiKey      String?  @map("api_key")      // criptografado em repouso (nunca plain text)
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([tenantId])
  @@map("email_channels")
}
```

---

## Consequências

**Positivas:**
- Captura leads de um canal que hoje é ponto cego.
- Mesmo pipeline de qualificação → métricas comparáveis entre canais.
- Respostas automáticas de campanhas de e-mail entram no funil sem intervenção.

**Custos:**
- Provider de e-mail externo (Mailgun) — custo operacional.
- Validação SPF/DKIM e rate-limit obrigatórios antes de abrir o canal.
- Link de opt-out em toda mensagem saída — requisito legal.
- Deduplicação phone×email é parcialmente manual (operador confirma a união).

---

## Relacionados

ADR 009 (Leads como plataforma) · ADR 010 (Connector) · ADR 012 (Segurança / Prompt-injection)
