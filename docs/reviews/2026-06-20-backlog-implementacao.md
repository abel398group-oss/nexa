# Backlog de Implementação — Nexa

> **Origem:** Auditoria de código 2026-06-20  
> **Referência completa:** `docs/reviews/2026-06-20-auditoria-implementacao-nexa.md`  
> **Fora deste backlog:** Módulo Monitor Proativo (ver `docs/monitor/`)

---

## 🔴 Alta prioridade

### NEXA-01 — Redis Adapter no Socket.IO
**Arquivo:** `src/presentation/ws/conversations.gateway.ts`  
**Problema:** sem adapter Redis, WebSocket não funciona com múltiplas réplicas.  
**Ação:** instalar `@socket.io/redis-adapter`, inicializar no gateway com a conexão Redis já existente.

---

### NEXA-02 — Criptografia de senhas SMTP/IMAP
**Arquivo:** `src/application/email/email-channel.service.ts`  
**Problema:** `smtpPass` e `imapPass` salvas em texto plano no banco.  
**Ação:** encrypt com `crypto.createCipheriv` (AES-256-GCM) antes de salvar; decrypt ao ler. Chave via env `EMAIL_ENCRYPTION_KEY`.

---

### NEXA-03 — Sanitização de input no Supervisor
**Arquivo:** `src/application/agents/supervisor-agent.service.ts`  
**Problema:** `customerMessage` passa direto para o prompt sem validação — risco de prompt injection.  
**Ação:** sanitizar/truncar `customerMessage` antes de montar o prompt. Bloquear padrões conhecidos de injection (`ignore previous instructions`, `system:`, etc).

---

## 🟡 Média prioridade

### NEXA-04 — Exportação CSV de contatos (LGPD art. 18)
**Arquivo:** `src/presentation/http/contacts/contacts.controller.ts`  
**Problema:** não existe endpoint de portabilidade de dados.  
**Ação:** criar `GET /contacts/:id/export` que retorna CSV com dados do contato + histórico de conversas. Restrito ao próprio tenant.

---

### NEXA-05 — Cron de purge/anonimização por retenção (LGPD)
**Arquivo:** `src/application/conversations/conversation-janitor.service.ts`  
**Problema:** `ConversationJanitorService` fecha conversas inativas mas não exclui dados pessoais após prazo.  
**Ação:** adicionar job que anonimiza (ou deleta) contatos inativos após prazo definido por plano. Prazo padrão sugerido: 2 anos.

---

### NEXA-06 — Webhooks outbound para parceiros
**Problema:** só existe webhook inbound (WAHA e Mailgun). Parceiros não recebem eventos do Nexa.  
**Ação:** criar tabela `webhook_subscriptions`, `WebhookService` com fila Redis, HMAC-SHA256 na assinatura, retry com backoff exponencial (3 tentativas: 1min, 5min, 30min).

---

### NEXA-07 — Enforcement de limites por plano
**Problema:** não existe tabela de planos nem guard que bloqueie ao atingir cota.  
**Ação:** criar tabela `plan_limits` (contatos, mensagens, sellers por plano), guard `PlanQuotaGuard` nos endpoints críticos, sincronizar plano ativo com billing do TMS.

---

## 🟢 Baixa prioridade

### NEXA-08 — Log de queries lentas no Prisma
**Arquivo:** `src/infra/prisma/prisma.service.ts`  
**Problema:** pool configurado no env mas sem log programático para diagnóstico.  
**Ação:** adicionar `log: [{ emit: 'event', level: 'query' }]` no `PrismaClient` e logar queries acima de 500ms.
