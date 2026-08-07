# Guia de Integração para Parceiros

> Para integradores que querem conectar sistemas externos ao Nexa.
> Versão: 1.0 | Junho 2026

---

## 1. Casos de Uso de Integração

| Caso de Uso | Mecanismo |
|-------------|-----------|
| Sistema externo inicia conversa no WhatsApp via Lia | Handoff Token |
| Sistema externo recebe evento quando lead é qualificado | Webhook *(pendente)* |
| Sistema externo importa contatos para campanha | API REST `/contacts/import` |
| Cliente final interage com portal de suporte | Portal Session Token |
| Sistema externo consulta métricas do Nexa | API REST `/metrics` |

---

## 2. Autenticação Server-to-Server

Para chamadas de sistema externo (ex: HiperTMS → Nexa), use o **Service Token**:

```bash
# Header obrigatório em todas as chamadas server-to-server
X-Service-Token: <TMS_SERVICE_TOKEN>
X-Tenant-Id: <tenant_uuid>
```

O token é configurado no `.env` do Nexa e deve ser compartilhado de forma segura com o sistema parceiro.

---

## 3. Handoff Token — Iniciar conversa da IA via link

O HiperTMS usa este mecanismo para o botão "Falar com a Lia" (ADR 022).

### Fluxo

```
1. TMS faz POST /api/handoff/token (server-to-server)
2. Nexa retorna { token: "abc12345", expiresAt: "..." }  (TTL 5 min)
3. TMS monta URL: https://wa.me/<numero>?text=NEXA:<token>
4. Usuário TMS clica no link → abre WhatsApp → envia mensagem
5. Nexa recebe mensagem, valida token, cria conversa já com contexto
```

### Requisição

```bash
POST /api/handoff/token
Content-Type: application/json
Authorization: Bearer <TMS_SERVICE_TOKEN>

{
  "externalId":  "cliente-123",              // ID do cliente no TMS — OBRIGATÓRIO
  "tenantId":    "tenant-abc",               // tenant no TMS — OBRIGATÓRIO
  "name":        "João Silva",               // nome do usuário logado no TMS
  "companyName": "Transportes Hipervias LTDA", // razão social (contexto da Lia)
  "cnpj":        "12345678000199",           // CNPJ (só contexto — nunca perguntado ao cliente)
  "page":        "fiscal/cte",               // tela de origem (para contexto da Lia)
  "errorCode":   "CT-0120",                  // código de erro visível
  "isManager":   false                       // true = gestor (vê chamados da empresa)
}
```

`externalId` aceita o alias `userId` (é o campo que o TMS envia hoje). Todos os
demais, exceto `tenantId`, são opcionais.

### Resposta

```json
{
  "token": "abc12345",
  "expiresIn": 300
}
```

`expiresIn` vem em **segundos** (300 = 5 min no handoff, 900 = 15 min no web chat).
O Nexa não monta a URL do WhatsApp — quem monta é o TMS, com
`https://wa.me/<numero>?text=NEXA:<token>`.

> ⚠️ **O corpo é validado com `forbidNonWhitelisted`.** Qualquer campo não
> declarado no `CreateHandoffDto` derruba a request inteira com
> `400 { "message": ["property X should not exist"] }`, antes mesmo da
> autenticação. Campo novo no payload exige mudança no Nexa **antes** do deploy do
> TMS. Já derrubou o suporte duas vezes — ver `REGRAS-SQUAD.md`, REGRA 1.

---

## 4. Importação de Contatos

```bash
POST /api/contacts/import
Content-Type: application/json
Cookie: <access_token>    # ou X-Service-Token para server-to-server

{
  "contacts": [
    {
      "phone": "5511994327713",
      "name": "Maria Costa",
      "company": "Transportes Rápidos Ltda",
      "email": "maria@transportes.com",
      "tags": ["cliente-tms", "frota-grande"]
    }
  ]
}
```

Resposta: `{ "imported": 42 }`

Regras:
- Telefone é obrigatório e deve incluir DDI (55 para Brasil)
- Se o contato já existe (mesmo `tenantId + phone`), os dados são **atualizados**
- Contatos com `status = 'opted_out'` não são reativados por importação

---

## 5. Webhook de Eventos (⚠️ Pendente de Implementação)

> **Para equipe:** O sistema de webhooks outbound ainda não foi implementado.
> Os DomainEvents existem internamente mas não são publicados para URLs externas.

### Eventos planejados

| Evento | Payload | Quando disparar |
|--------|---------|----------------|
| `lead.qualified` | `{ conversationId, contactId, score, intent }` | Score ≥ 70 pela Lia |
| `lead.opted_out` | `{ contactId, phone, optOutAt }` | Contato pede descadastro |
| `ticket.escalated` | `{ conversationId, category, priority }` | Ticket escalado para humano |
| `ticket.resolved` | `{ conversationId, resolvedAt, category }` | Ticket resolvido pela IA |
| `campaign.completed` | `{ campaignId, sent, failed }` | Campanha termina |

### Implementação necessária

```typescript
// Para equipe: criar WebhookService que:
// 1. Receba os DomainEvents já publicados internamente
// 2. Consulte WebhookSubscription (tabela a criar) do tenant
// 3. Faça POST para a URL cadastrada com HMAC-SHA256 no header X-Nexa-Signature
// 4. Implemente retry com backoff exponencial (3 tentativas)
```

---

## 6. Portal de Suporte (Clientes TMS)

O portal permite ao cliente final do TMS abrir e acompanhar tickets sem WhatsApp.

### Iniciar sessão de portal

```bash
POST /api/portal/sessions
X-Service-Token: <TOKEN>
X-Tenant-Id: <TENANT_ID>

{
  "externalId": "cliente-456",   // ID do cliente no TMS
  "name": "Empresa Transportes",
  "email": "suporte@transportes.com"
}
```

Resposta: `{ "sessionToken": "...", "expiresAt": "..." }`

O `sessionToken` é usado pelo frontend do portal para autenticar as chamadas subsequentes (header `X-Portal-Token`).

---

## 7. Consultar Métricas via API

```bash
# Overview geral
GET /api/metrics/overview?from=2026-06-01&to=2026-06-30
Cookie: <access_token>

# Série temporal (gráfico de atividade)
GET /api/metrics/timeseries?from=2026-06-01&to=2026-06-30

# KPIs de suporte
GET /api/metrics/support?from=2026-06-01&to=2026-06-30
```

---

## 8. Rate Limits

| Endpoint | Limite | Janela |
|----------|--------|--------|
| `POST /api/auth/login` | 10 tentativas | 15 minutos |
| E-mails recebidos | 10 mensagens | 1 hora por remetente |
| Campanha (disparos) | 30 mensagens/dia | Por número WhatsApp |
| API geral | 100 req | 1 minuto por IP |

---

## 9. Segurança das Integrações

- Sempre use HTTPS
- Valide o header `X-Nexa-Signature` nos webhooks recebidos (HMAC-SHA256)
- O `TMS_SERVICE_TOKEN` nunca deve ser exposto no frontend
- Tokens de handoff expiram em 5 minutos — gere sob demanda, não armazene
- Monitore erros 401/403 — podem indicar token expirado ou rotacionado
