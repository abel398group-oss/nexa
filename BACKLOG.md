# Nexa — Backlog de Tarefas

> Legenda: 🔴 Crítico · 🟡 Importante · 🟢 Melhoria · ⬜ Futuro

---

## 🚀 Em andamento / próximos

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| 1 | 🟡 | Configurar botão receptivo do site HiperTMS | Definir se é link WhatsApp (`wa.me`) ou formulário — ver seção Canais Receptivos abaixo |
| 2 | 🟡 | Preencher `.env` com credenciais reais | `EMAIL_SMTP_PASS`, `EMAIL_IMAP_PASS` para `lia@hipertms.com.br` |
| 3 | 🟡 | Testar envio de e-mail real (SMTP Hostgator) | `mail.hipertms.com.br:465` SSL/TLS — validar com campanha pequena |

---

## 📱 Canais Receptivos (inbound)

| Canal | Status | O que falta |
|---|---|---|
| WhatsApp (WAHA) | ✅ Funcionando | — |
| E-mail (IMAP + Mailgun) | ✅ Implementado | Configurar `.env` com senha real |
| Site (botão de contato) | ⚠️ A definir | Se for `wa.me` → já funciona. Se for formulário → criar endpoint `POST /webhooks/site` |
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

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| TMS-1 | 🟡 | Uelder criar endpoint `GET /api/companies/by-phone` no TMS | Nexa chama para enriquecer lead com dados do cliente TMS |
| TMS-2 | 🟡 | Preencher `TMS_API_BASE_URL`, `TMS_SERVICE_TOKEN`, `TMS_TENANT_ID` no `.env` | Só após TMS-1/TMS-5 |
| TMS-3 | 🟢 | Handoff Modalidade B — Uelder chamar endpoint do Nexa ao abrir chamado | `POST /api/handoff/from-tms` já implementado no Nexa |
| TMS-4 | 🟢 | Handoff Modalidade A — Uelder adicionar botão "Abrir no Nexa" no painel TMS | HTML simples apontando para o Nexa |
| TMS-5 | 🔴 | Uelder criar endpoint `GET /api/plans` no TMS | **Nexa pronto** (`getPlans()` chama ao vivo c/ fallback p/ catálogo). Faz a Lia vender sempre o preço atual do TMS |
| TMS-6 | 🟢 | Uelder criar endpoint `GET /api/health` no TMS | **Nexa pronto** (`healthCheck()` faz ping real). Saúde do conector reflete conexão real |

### Contrato esperado pelo Nexa (lado consumidor JÁ pronto)

Todos com header `x-internal-token: <TMS_SERVICE_TOKEN>`, timeout 5s. Se a chamada falhar, o Nexa cai no catálogo de fallback — nunca quebra a venda.

- **`GET /api/plans?tenantId=<id>`** → `{ "plans": [ { "code": "basico", "name": "Básico", "price": 89, "maxUsers": 1, "features": ["CT-e", "..."] } ] }` (aceita também o array direto, e os aliases `id/title/priceMonthly/userLimit`).
- **`GET /api/health`** → `200 OK` quando o TMS está no ar.
- **`GET /api/companies/by-phone?phone=<e164>&tenantId=<id>`** → `{ "found": bool, "company": { externalId, name, email, plan, status, createdAt } }`.

---

## 📊 Rastreabilidade de Campanhas

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| CAMP-1 | ✅ | Vincular conversa → campanha (sem migration) | A msg de campanha é carimbada com `campaignId` no `metadata`. Detalhe da campanha mostra a **conversão** (outcomes das conversas originadas). Vale só p/ disparos novos |
| CAMP-2 | ✅ | Engajamento de campanhas no Painel | Cards Enviados/Entregue/Lido/Respondeu + detalhe por destinatário (ack + resposta). Conversão *por campanha* (qual virou oportunidade) ainda depende do CAMP-1 |

---

## 🏗️ Infraestrutura / Deploy

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| INFRA-1 | 🔴 | Deploy DigitalOcean | Pendente — fazer após validação local |
| INFRA-2 | 🔴 | Hardening de segurança no deploy | HTTPS, variáveis de ambiente seguras, CORS, rate limit |
| INFRA-3 | 🟡 | Configurar domínio `lia@hipertms.com.br` no SPF/DKIM | Melhorar entregabilidade de e-mail |
| INFRA-4 | 🟡 | pgvector + embeddings (RAG avançado) | Fase 2 — busca semântica na base de conhecimento |
| INFRA-5 | 🔴 | **Monitorar o túnel Cloudflare** (temporário) | Quebra os links de PDF das campanhas quando muda/cai. Regra: sempre verificar. Solução definitiva = domínio fixo no deploy (INFRA-1) + `MEDIA_PUBLIC_BASE` |

---

## 🧠 IA / Agente Lia

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| IA-1 | 🟢 | Ajustar prompt da Lia para HiperTMS | Personalizar tom, produto, objeções comuns do setor de transporte |
| IA-2 | ⬜ | RAG com documentos do TMS | Lia responder com base em manual, tabela de preços, FAQ |
| IA-3 | ✅ | Escalada automática para vendedor humano | Score ≥ `HOT_LEAD_SCORE` (env, default 70), `meeting_request` ou `human` → `sellers.handoff` (round-robin + notifica). **Pendência:** hoje só dispara com autonomia LIGADA (a IA não classifica com o kill switch OFF) |

---

## ✅ Concluído

| Data | O que foi feito |
|---|---|
| 2026-06-09 | Sprints 1–13 — core do Nexa (NestJS + Prisma + React + Claude) |
| 2026-06-10 | ADR 021 — Canal de e-mail completo (SMTP/IMAP, campanhas, opt-out LGPD) |
| 2026-06-10 | Settings page — configuração de e-mail por tenant |
| 2026-06-10 | Campanhas de e-mail — modal redesenhado, upload de PDF, anti-spam |
| 2026-06-10 | Inbox — badge de canal (✉️ e-mail / 💬 WhatsApp) |
| 2026-06-10 | Botão "Falar com a Lia" na landing page do TMS — PR aberto em feat/botao-lia-whatsapp (aguarda merge do Uelder) |
