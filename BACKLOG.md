# Nexa — Backlog de Tarefas

> Legenda: 🔴 Crítico · 🟡 Importante · 🟢 Melhoria · ⬜ Futuro

---

## 🚀 Em andamento / próximos

| # | Prioridade | Tarefa | Notas |
|---|---|---|---|
| 1 | 🔴 | Implementar `GET /api/plans` no HiperTMS (TMS-5) | Nexa já consome — falta o endpoint no TMS. Ver seção TMS abaixo |
| 2 | 🔴 | Implementar `GET /api/companies/by-phone` no HiperTMS (TMS-1) | Habilita roteamento automático Lia Vendas ↔ Lia Suporte |
| 3 | 🔴 | Atualizar Router do Nexa para usar lookup de telefone | Lógica: cadastrado no TMS → Lia Suporte / não cadastrado → Lia Vendas |
| 4 | 🟡 | Testar envio de e-mail real (SMTP Hostgator) | Portas já abertas no DO. Configurar `.env` e disparar campanha teste |

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
| TMS-1 | 🔴 | Criar `GET /api/companies/by-phone` no HiperTMS | Nexa chama para rotear Lia Vendas vs Lia Suporte |
| TMS-2 | 🟡 | Preencher `TMS_API_BASE_URL`, `TMS_SERVICE_TOKEN`, `TMS_TENANT_ID` no `.env` | Após TMS-1 e TMS-5 estarem prontos |
| TMS-3 | 🟢 | Handoff Modalidade B — chamar endpoint do Nexa ao abrir chamado | `POST /api/handoff/from-tms` já implementado no Nexa |
| TMS-4 | 🟢 | Handoff Modalidade A — botão "Abrir no Nexa" no painel TMS | HTML simples apontando para o Nexa |
| TMS-5 | 🔴 | Criar `GET /api/plans` no HiperTMS | **Nexa pronto** (`getPlans()` com fallback p/ catálogo). Lia vende preço real |
| TMS-6 | 🟢 | Criar `GET /api/health` no HiperTMS | **Nexa pronto** (`healthCheck()` faz ping real) |

### Contrato esperado pelo Nexa (consumidor JÁ implementado)

Todos com header `x-internal-token: <TMS_SERVICE_TOKEN>`, timeout 5s. Se a chamada falhar, Nexa usa fallback — nunca quebra a venda.

- **`GET /api/plans?tenantId=<id>`** → `{ "plans": [ { "code": "basico", "name": "Básico", "price": 89, "maxUsers": 1, "features": ["CT-e", "..."] } ] }`
- **`GET /api/health`** → `200 OK`
- **`GET /api/companies/by-phone?phone=<e164>&tenantId=<id>`** → `{ "found": bool, "company": { externalId, name, email, plan, status, createdAt } }`

### Ordem de implementação recomendada

1. **TMS-5** — `GET /api/plans` no HiperTMS (simples, retorna o catálogo existente)
2. **TMS-1** — `GET /api/companies/by-phone` no HiperTMS (busca empresa por telefone)
3. **Router Nexa** — atualizar lógica de roteamento para usar o lookup (TMS-1)
4. **TMS-2** — configurar variáveis de ambiente (`.env`) com URLs e tokens reais
5. **Testar** — conversa de teste com número cadastrado e não cadastrado

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
