# Nexa — Backlog de Tarefas

> Legenda: 🔴 Crítico · 🟡 Importante · 🟢 Melhoria · ⬜ Futuro

---

## 🚀 Em andamento / próximos

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| 1 | 🔴 | Configurar `TMS_BASE_URL` no Nexa em produção (TMS-2) | Apontar para a URL pública do TMS (`http://hipertms.com.br/api`). `TMS_SERVICE_TOKEN` já está correto em ambos os lados |
| 2 | 🔴 | Configurar `NEXA_SERVICE_TOKEN` no HiperTMS em produção | Deve ser igual ao `TMS_SERVICE_TOKEN` do Nexa (`hipertms-nexa-secret-2026`) |
| 3 | 🟡 | Testar envio de e-mail real (SMTP Hostgator) | Portas já abertas no DO. Configurar `.env` e disparar campanha teste |

---

## 📱 Canais Receptivos (inbound)

| Canal | Status | O que falta |
|---|---|---|
| WhatsApp (WAHA) | ✅ Funcionando | — |
| E-mail (IMAP + SMTP) | ✅ Implementado | Testar disparo real com `.env` configurado |
| Site (botão de contato) | ✅ Funcionando | Botão já aponta para WhatsApp (`wa.me`) |
| Instagram DM | ❌ Não implementado | Criar módulo Instagram (Meta API) — ver tarefa abaixo |
| Facebook Messenger | ❌ Não implementado | Criar módulo Facebook (Meta API) — ver tarefa abaixo |
| Telegram | ❌ Não implementado | Futuro |

---

## 📸 Instagram / Facebook (Meta API)

> Quando for implementar, seguir esta sequência:

| # | Tarefa |
|---|---|
| IG-1 | Criar app no Meta for Developers + configurar webhook de DMs |
| IG-2 | Criar `InstagramService` (análogo ao `WhatsappService`) — processa DMs inbound |
| IG-3 | Criar endpoint `POST /webhooks/instagram` com verificação de token Meta |
| IG-4 | Mapear `sourceChannel: 'instagram'` nas conversas (enum já existe no schema) |
| IG-5 | Criar `InstagramReplyService` — envia DM de volta via Graph API |
| IG-6 | Monitorar inbox do Instagram no Nexa (igual ao WAHA faz para WhatsApp) |
| FB-1 | Repetir IG-1 a IG-6 para Facebook Messenger (`sourceChannel: 'facebook'`) |

---

## 🔗 Integração TMS (HiperTMS v12)

### Regra de negócio — Lia Vendas vs Lia Suporte

Toda mensagem inbound passa pelo seguinte fluxo de roteamento:

```
WhatsApp/E-mail recebido
        │
        ▼
GET /api/companies/by-phone?phone=<número>
        │
   ┌────┴────┐
   │         │
 found     not found
   │         │
   ▼         ▼
Lia       Lia
Suporte   Vendas
   │
   └── se Lia Suporte for acionada mas o telefone
       não estiver cadastrado → responde com link
       de cadastro no HiperTMS
```

**Regra completa:**
- Telefone **cadastrado no TMS** → Lia Suporte (atende cliente existente)
- Telefone **não cadastrado** → Lia Vendas (trata como lead)
- Lia Suporte acionada mas telefone não encontrado → mensagem automática com link de cadastro no TMS

### Endpoints necessários no HiperTMS

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| TMS-1 | ✅ | `GET /api/nexa/customers/by-phone` no HiperTMS | Implementado em `nexa-external.controller.ts`. Router Nexa já usa via `TmsLookupService` (DB direto) |
| TMS-2 | 🔴 | Configurar `TMS_BASE_URL` no Nexa em produção + `NEXA_SERVICE_TOKEN` no TMS | Localmente já funciona. Em prod: apontar para URL pública do TMS |
| TMS-3 | 🟢 | Handoff Modalidade B — chamar endpoint do Nexa ao abrir chamado | `POST /api/handoff/from-tms` já implementado no Nexa |
| TMS-4 | 🟢 | Handoff Modalidade A — botão "Abrir no Nexa" no painel TMS | HTML simples apontando para o Nexa |
| TMS-5 | ✅ | `GET /api/nexa/plans` no HiperTMS | Implementado em `nexa-external.controller.ts`. Auth: `Authorization: Bearer` via `ServiceTokenGuard` |
| TMS-6 | 🟢 | Criar `GET /api/health` no HiperTMS | **Nexa pronto** (`healthCheck()` faz ping real) |

### Contrato esperado pelo Nexa (consumidor JÁ implementado)

Todos com header `x-internal-token: <TMS_SERVICE_TOKEN>`, timeout 5s. Se a chamada falhar, Nexa usa fallback — nunca quebra a venda.

- **`GET /api/plans?tenantId=<id>`** → `{ "plans": [ { "code": "basico", "name": "Básico", "price": 89, "maxUsers": 1, "features": ["CT-e", "..."] } ] }`
- **`GET /api/health`** → `200 OK`
- **`GET /api/companies/by-phone?phone=<e164>&tenantId=<id>`** → `{ "found": bool, "company": { externalId, name, email, plan, status, createdAt } }`

### Ordem de implementação recomendada

1. ✅ **TMS-5** — `GET /api/nexa/plans` (implementado)
2. ✅ **TMS-1** — `GET /api/nexa/customers/by-phone` (implementado)
3. ✅ **Router Nexa** — roteamento por telefone via `TmsLookupService` (já implementado)
4. 🔴 **TMS-2** — configurar em PRODUÇÃO: `TMS_BASE_URL` no Nexa + `NEXA_SERVICE_TOKEN` no TMS
5. **Testar** — conversa de teste com número cadastrado e não cadastrado no TMS

---

## 📊 Rastreabilidade de Campanhas

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| CAMP-1 | ✅ | Vincular conversa → campanha | `campaignId` carimbado no `metadata`. Conversão visível no detalhe da campanha |
| CAMP-2 | ✅ | Engajamento de campanhas no Painel | Cards Enviados/Entregue/Lido/Respondeu + detalhe por destinatário |

---

## 🏗️ Infraestrutura / Deploy

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| INFRA-1 | ✅ | Deploy DigitalOcean | Em produção há meses no droplet hiperTMS |
| INFRA-2 | ✅ | Hardening de segurança | HTTPS, variáveis de ambiente seguras, CORS, rate limit — já aplicados |
| INFRA-3 | 🟡 | Configurar domínio `lia@hipertms.com.br` no SPF/DKIM | Melhorar entregabilidade de e-mail |
| INFRA-4 | 🟡 | pgvector + embeddings (RAG avançado) | Fase 2 — busca semântica na base de conhecimento |
| INFRA-5 | 🟡 | Monitorar túnel Cloudflare | Temporário — links de PDF quebram se o túnel mudar. Solução = domínio fixo + `MEDIA_PUBLIC_BASE` |

---

## 🧠 IA / Agente Lia

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| IA-1 | 🟢 | Ajustar prompt da Lia para HiperTMS | Personalizar tom, produto, objeções comuns do setor de transporte |
| IA-2 | ⬜ | RAG com documentos do TMS | Lia responder com base em manual, tabela de preços, FAQ |
| IA-3 | ✅ | Escalada automática para vendedor humano | Score ≥ `HOT_LEAD_SCORE`, `meeting_request` ou `human` → round-robin + notifica |

---

## ✅ Concluído

| Data | O que foi feito |
|---|---|
| 2026-06-09 | Sprints 1–13 — core do Nexa (NestJS + Prisma + React + Claude) |
| 2026-06-10 | ADR 021 — Canal de e-mail completo (SMTP/IMAP, campanhas, opt-out LGPD) |
| 2026-06-10 | Settings page — configuração de e-mail por tenant |
| 2026-06-10 | Campanhas de e-mail — modal redesenhado, upload de PDF, anti-spam |
| 2026-06-10 | Inbox — badge de canal (✉️ e-mail / 💬 WhatsApp) |
| 2026-06-10 | Botão "Falar com a Lia" na landing page do TMS |
| 2026-07-03 | Padronização frontend: Layout, DataTable, StandardListPage, StandardFormPage |
| 2026-07-03 | Migração para sonner (toast) |
| 2026-07-03 | Migração para Tailwind CSS v4 |
