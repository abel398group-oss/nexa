# Auditoria de Implementação — Nexa

> **Data:** 2026-06-20  
> **Realizada por:** Orquestra Nexa (leitura direta do código)  
> **Objetivo:** Confirmar o que está realmente implementado vs. documentado como pendente

---

## Resultado por item

| # | Item | Status | Arquivo |
|---|------|--------|---------|
| 1 | Socket.io Redis Adapter | 🔴 Pendente | `src/presentation/ws/conversations.gateway.ts` |
| 2 | Prisma connection pool | 🟡 Parcial | `src/infra/prisma/` + `.env` |
| 3 | Swagger / OpenAPI | ✅ Implementado | `src/main.ts` linhas 6, 32–39 |
| 4 | Criptografia senhas SMTP/IMAP | 🔴 Pendente | `src/application/email/email-channel.service.ts` |
| 5 | Supervisor: validação de input | 🔴 Pendente | `src/application/agents/supervisor-agent.service.ts` |
| 6 | Exportação CSV de contatos (LGPD) | 🔴 Pendente | `src/presentation/http/contacts/contacts.controller.ts` |
| 7 | Cron de exclusão por retenção (LGPD) | 🔴 Pendente | `src/application/conversations/conversation-janitor.service.ts` |
| 8 | Webhooks outbound para parceiros | 🔴 Pendente | `src/application/whatsapp/`, `src/presentation/http/whatsapp/` |
| 9 | Enforcement de limites por plano | 🔴 Pendente | Não existe tabela de planos nem guard |

**Resumo: 1 implementado · 1 parcial · 7 pendentes**

---

## Detalhes por item

### ✅ 3. Swagger — Implementado
`SwaggerModule.setup('api/docs', app, doc)` presente em `main.ts`.
Nenhuma ação necessária.

---

### 🟡 2. Prisma connection pool — Parcial
`connection_limit=20&pool_timeout=10` configurados na `DATABASE_URL` do `.env`.
O `PrismaService` não configura `datasources` explícitos nem log de queries lentas.
Funciona sob carga normal, mas sem controle programático para diagnóstico.

**Ação recomendada:** adicionar log de queries lentas no `PrismaService`:
```typescript
new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})
```

---

### 🔴 1. Socket.io Redis Adapter — Pendente
`conversations.gateway.ts` usa Socket.IO sem adapter Redis.
Com múltiplas réplicas, eventos de uma instância não chegam aos clientes conectados em outra.
**Bloqueia escala horizontal.**

**Ação:** instalar `@socket.io/redis-adapter` e configurar no gateway.

---

### 🔴 4. Criptografia senhas SMTP/IMAP — Pendente
`smtpPass` e `imapPass` salvas e lidas em texto plano em `email-channel.service.ts`.
Nenhuma chamada a `crypto.createCipheriv` ou similar.

**Ação:** encrypt-at-rest com chave de aplicação antes de salvar; decrypt ao ler.

---

### 🔴 5. Supervisor: validação de input — Pendente
`supervisor-agent.service.ts` audita apenas a *resposta* da IA (output).
Não há `sanitize`, `stripTags` ou validação de `customerMessage` antes de enviar ao prompt.
Risco de prompt injection via mensagem do cliente.

**Ação:** adicionar validação/sanitização de `customerMessage` antes do pipeline de agentes.

---

### 🔴 6. Exportação CSV de contatos — Pendente
`contacts.controller.ts` tem `GET /:id`, `GET /tags`, `POST /bulk-delete`, `POST /import`.
Sem endpoint `GET /:id/export` ou `GET /export`.
Exigido pela LGPD art. 18 (direito à portabilidade).

**Ação:** criar endpoint que gera CSV com dados do contato e suas conversas.

---

### 🔴 7. Cron de exclusão por retenção — Pendente
`ConversationJanitorService` fecha conversas inativas (7d leads / 48h suporte),
mas não exclui dados pessoais após prazo de retenção.
LGPD exige exclusão ou anonimização após fim da finalidade.

**Ação:** adicionar job que purga/anonimiza dados de contatos inativos após prazo por plano.

---

### 🔴 8. Webhooks outbound — Pendente
Só existe webhook *inbound* (WAHA e Mailgun).
Não há `WebhookService`, tabela `webhook_subscriptions` nem endpoint para parceiros receberem eventos.

**Ação:** criar tabela, serviço com HMAC-SHA256 e retry com backoff exponencial.

---

### 🔴 9. Enforcement de limites por plano — Pendente
Nenhum `planLimit`, `contactLimit`, `quota` ou guard que bloqueie ao atingir limite.
Não existe tabela de planos nem verificação por tenant.

**Ação:** criar tabela `plan_limits`, guard que bloqueia CRUD ao atingir cota,
integração com billing do TMS para sincronizar plano ativo.
