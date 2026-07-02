# Fluxo WhatsApp — Documentação de Preservação

**Status:** Funcionando em produção (WAHA)  
**Data:** 2026-07-02  
**Objetivo:** Registrar o fluxo atual para que qualquer migração futura (Meta Cloud API) não quebre o que está funcionando.

---

## Visão geral

```
RECEBIMENTO (inbound)
  WhatsApp → WAHA → POST /api/webhooks/waha → WhatsappController
    → WhatsappService.process() → normalize() / resolveLidToPhone()
    → upsert Contact → upsert/create AiConversation
    → ConversationAgentService → Router → agente especialista
    → SenderService / waha.sendText() → WhatsApp

ENVIO PROATIVO (outbound)
  SenderService.tick() (a cada 15s) → waha.sendText() → WhatsApp
  ConsolidationService (resumo diário) → WahaNotificationChannel.send() → waha.sendText() → WhatsApp
  MonitorService.sendAlertsToAdmins() → waha.sendText() → WhatsApp
```

---

## Peças do fluxo e onde estão no código

### 1. WAHA — cliente HTTP (`WahaClientService`)

**Arquivo:** `apps/backend/src/shared/waha/waha-client.service.ts`

Único ponto de saída para o WhatsApp. Todos os envios passam por aqui.

**Env vars necessárias:**
| Variável | Descrição |
|---|---|
| `WAHA_API_URL` | URL do container WAHA (ex: `http://localhost:3018`) |
| `WAHA_API_KEY` | Chave de autenticação do WAHA |
| `WAHA_SESSION` | Nome da sessão (default: `default`) |
| `WAHA_SEND_ALLOWLIST` | Números autorizados em teste (vazio = libera todos) |
| `WAHA_SENDER_PHONE` | Número do remetente (para SenderService) |

**Métodos:**
- `sendText(phone, text)` — envia texto simples. Usado em TUDO.
- `sendFile(phone, fileUrl, filename, caption?)` — envia PDF/imagem por URL.
- `sendStatusText(text)` — publica no Status/Story do WhatsApp.
- `sendStatusImage(fileUrl, caption?)` — publica imagem no Status.

**Formato do `phone`:** string sem `@`, ex: `5511917747429`. O serviço adiciona `@c.us` internamente.

**Anti-spam (allowlist):** se `WAHA_SEND_ALLOWLIST` estiver setado (ex: `5511999999999,5511888888888`), só esses números recebem — útil em staging/dev para não disparar para clientes reais.

---

### 2. Bootstrap automático do webhook (`WahaBootstrapService`)

**Arquivo:** `apps/backend/src/application/whatsapp/waha-bootstrap.service.ts`

Ao subir o backend (`OnApplicationBootstrap`), registra automaticamente o webhook no WAHA via `PUT /api/sessions/{session}`. Resolve o problema de webhook sumir após `docker compose recreate`.

**Env vars necessárias:**
| Variável | Descrição |
|---|---|
| `WAHA_WEBHOOK_TOKEN` | Token secreto que o WAHA envia no header/query |
| `NEXA_PUBLIC_URL` | URL pública do backend (usada para montar a URL do webhook) |

**URL do webhook registrada:** `{NEXA_PUBLIC_URL}/api/webhooks/waha?token={WAHA_WEBHOOK_TOKEN}`

**Eventos registrados:** `message`, `message.ack`, `session.status`

**Idempotente:** verifica se já está registrado antes de re-registrar. Remove webhooks antigos do mesmo path para evitar duplicação ao mudar URL.

---

### 3. Recebimento de mensagens (`WhatsappController`)

**Arquivo:** `apps/backend/src/presentation/http/whatsapp/whatsapp.controller.ts`

Rota: `POST /api/webhooks/waha` — **pública, sem JWT**, protegida por token.

**Autenticação:** `WAHA_WEBHOOK_TOKEN` obrigatório. Aceita via:
- Header `X-Waha-Token` (preferido)
- Query string `?token=` (fallback legado)

**Eventos tratados:**
| Evento WAHA | Handler |
|---|---|
| `message` | `WhatsappService.process()` — mensagem nova do cliente |
| `message.ack` | `WhatsappService.handleAck()` — recibo de entrega/leitura (✓✓) |
| `session.status` | `WahaHealthService.handleStatusEvent()` — WAHA conectou/caiu |
| outros | ignorado (`{ ignored: true }`) |

---

### 4. Processamento de mensagem (`WhatsappService`)

**Arquivo:** `apps/backend/src/application/whatsapp/whatsapp.service.ts`

Ponto de entrada para mensagem inbound. Responsabilidades:
- `normalize(phone)` — normaliza o número (remove `@c.us`, `@lid`, adiciona DDI 55)
- `resolveLidToPhone(lid)` — resolve LID do WhatsApp para número real via `GET /api/contacts?session=default&contactId={lid}`. **Campo correto: `data.id` (não `data.number`).**
- Upsert do contato (`ContactsService`)
- Upsert/criação da conversa (`ConversationsService`)
- Enfileira para o agente (`ConversationAgentService`)

**Regras críticas:**
- LID (`@lid`) chega no `payload.from` — NÃO é o número real
- `data.number` no retorno do WAHA é o user do LID, inválido como telefone
- `data.id` contém `5512988073788@c.us` → pegar antes do `@`
- Todo early-return DEVE ter `this.logger.warn()` — silently drop é proibido

---

### 5. Resposta da IA (`ConversationAgentService` → `SenderService`)

**Arquivo:** `apps/backend/src/application/agents/conversation-agent.service.ts`

Fluxo interno:
1. Router decide qual agente especialista responde
2. Agente gera a resposta em texto
3. `SenderService` (ou direto no agent) chama `waha.sendText(phone, resposta)`
4. Mensagem gravada em `AiMessage` com `direction: 'outbound'`

---

### 6. Campanhas de disparo em massa (`SenderService`)

**Arquivo:** `apps/backend/src/application/sender/sender.service.ts`

Worker com `@Interval(15000)` — processa um alvo por tick.

**Anti-ban implementado:**
- Delay aleatório 30–90s entre envios (configurável via env)
- Limite diário por número com warmup (stages: 10, 15, 20, 30 por dia)
- Limite horário
- Estado do anti-ban via Redis (compartilhado entre réplicas) com fallback em memória
- Janela de horário comercial (7h–19h BRT, configurável por tenant)
- CLAIM atômico no banco para evitar duplo envio em cluster

**Env vars de configuração:**
| Variável | Default | Descrição |
|---|---|---|
| `SENDER_BUSINESS_START` | 7 | Início da janela de envio (hora BRT) |
| `SENDER_BUSINESS_END` | 19 | Fim da janela de envio (hora BRT) |
| `SENDER_DELAY_MIN_MS` | 30000 | Delay mínimo entre envios |
| `SENDER_DELAY_MAX_MS` | 90000 | Delay máximo entre envios |

**LGPD:** opted_out nunca recebe. Footer opt-out automático (`LGPD_OPT_OUT_FOOTER=false` para desativar).

**Tipo `status`:** campanhas de WhatsApp Status (Stories) — sem targets individuais, broadcast único via `waha.sendStatusText()` / `waha.sendStatusImage()`.

---

### 7. Notificações do Monitor Proativo (`WahaNotificationChannel`)

**Arquivo:** `apps/backend/src/application/monitor/waha-notification-channel.ts`

Usado pelo `MonitorNotificationService` para resumos diários e alertas críticos.

**Resolução do telefone destino (prioridade):**
1. `TenantNotificationConfig.notificationPhone` (configurado na tela do Nexa)
2. `ALERT_ADMIN_PHONE` env var (fallback global)
3. Primeiro seller ativo do tenant

**Normalização:** `normalizePhone()` adiciona DDI 55. Filtra números com menos de 12 dígitos.

---

## Pontos de atenção ao migrar para Meta Cloud API

Ao migrar no futuro, **só mudar `WahaClientService`**. O restante do fluxo não muda.

| O que muda | O que NÃO muda |
|---|---|
| `WahaClientService.sendText()` — chama Graph API em vez de WAHA | `WhatsappController` — mesmo webhook, mesma rota |
| `WahaClientService.sendFile()` — usa `type: document` da Graph API | `WhatsappService.process()` — mesma lógica de normalização |
| `WahaBootstrapService` — configura webhook na Meta em vez do WAHA | `SenderService` — mesma lógica de anti-ban e disparo |
| Templates obrigatórios para mensagens proativas (Meta exige) | `WahaNotificationChannel` — mesma resolução de phone |
| `WAHA_API_URL`, `WAHA_API_KEY` → `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Todos os models do Prisma |

**Estratégia de migração sem downtime:**
```typescript
// Em WahaClientService.sendText() — future-proof com feature flag
if (process.env.WHATSAPP_PROVIDER === 'meta') {
  return this.sendViaMetaGraphApi(phone, text);
}
return this.sendViaWaha(phone, text); // comportamento atual
```

---

## Checklist de saúde do fluxo atual

Para verificar se tudo está funcionando em produção:

```bash
# Logs do backend (produção via DO Console)
docker compose -f docker-compose.production.yml logs backend --tail=100 | grep -E "WahaBootstrap|WahaWebhook|WahaClient|Sender"

# Deve aparecer:
# WahaBootstrap: webhook já registrado — https://...
# [webhook] evento recebido: message
# Disparo p/ 55... (campanha ...)

# Status do WAHA
curl -H "X-Api-Key: $WAHA_API_KEY" http://localhost:3018/api/sessions/default
# Espera: "status":"WORKING"
```
