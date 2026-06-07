# Relatório Técnico — Plataforma Nexa (para avaliação externa)

> Data: 2026-06-07. Plataforma comercial de IA (Lia) para venda do HiperTMS a transportadoras.
> Rodando 100% LOCAL (decisão atual; deploy adiado). Construída a partir de um MVP em n8n, hoje com paridade total + extras.

---

## 1. Visão geral
Sistema que recebe leads no WhatsApp, a IA (Claude) classifica/roteia/responde, qualifica, dispara campanhas
e distribui leads quentes para vendedores — com governança, métricas e controle de acesso.
Arquitetura: **plataforma independente**, com o TMS como 1º "conector" (plugável).

## 2. Stack
- **Backend:** NestJS 10 (modular: application/presentation/infra/shared), Prisma 5 + PostgreSQL 16 (pgvector), Node 24.
- **Frontend:** React 18 + Vite + Tailwind 3 (identidade visual clonada do HiperTMS), axios, react-router, socket.io-client.
- **IA:** Claude Haiku (`claude-haiku-4-5-20251001`) via fetch nativo; RAG textual sobre base de conhecimento.
- **Infra local:** Docker (Postgres :5433, Redis :6380); WAHA (gateway WhatsApp, container existente) :3018.
- **Realtime:** WebSocket (socket.io) no inbox.

## 3. Módulos do backend (NestJS)
auth (JWT cookie HttpOnly + refresh com rotação + revogação de sessão), users (RBAC + permissões),
contacts (CRM + import), conversations (+ WebSocket), agents (router/sales/support/supervisor/orchestrator),
knowledge (KB + curadoria/versionamento), sellers (handoff/round-robin), sender (campanhas + worker),
followup (cadência), whatsapp (webhook inbound WAHA), billing (Asaas stub), connectors (HiperTMS stub),
metrics (dashboard + KPI vendedor), admin (kill switch), events (outbox/DLQ), audit, governance (autonomia),
shared: ai (Anthropic), waha (envio), permissions guard, throttler, helmet.

## 4. Telas do frontend
Login · Painel (KPIs gerais) · Inbox (conversas tempo real + ✨Lia + Ganhou/Perdeu) · Contatos (CRM + import CSV) ·
Conhecimento (KB) · Vendedores (cadastro + login + KPIs de desempenho) · Disparo (campanhas: link, anexo, quantidade) ·
Usuários & Acessos (RBAC com toggles por área). Ajuda contextual + demo animada por tela + tour guiado.

## 5. Funcionalidades (o que faz hoje)
### IA / Atendimento
- Router classifica intenção + leadScore (0-100) + detecta reclamação e ofensa.
- Roteia para: Sales / Support / Human (handoff) / Opt-out.
- Sales agent: consultivo, usa catálogo de planos + KB, pede e-mail do lead, sugere próximo passo (ACTION).
- Support agent: RAG sobre KB; escala humano se não souber (não alucina).
- **Supervisora IA:** audita o rascunho antes de enviar (alucinação, preço inventado, promessa, tom). Hard-blocks por regex.
- Saudação por horário; rate-limit anti-resposta-dupla (12s); humanização (delay 3-6s no auto-envio).
### Governança (ADR 012)
- Kill switch (autonomia ON/OFF) em runtime, com audit log. IA recomenda; humano/back-end executa.
- Auto-envio só com: autonomia ON + confiança alta + sem handoff + supervisora aprovou.
### Disparo (Sender) + anti-ban (number_pool)
- Campanhas com template ({{nome}}, {{saudacao}}), LINK e ANEXO (PDF/Word via WAHA sendFile).
- Quantidade configurável (todos / só N).
- Anti-ban: horário comercial (7h-19h), limite diário + por hora, aquecimento (warmup), delay entre envios.
- Pula opt-out e quem já respondeu; rodapé "responda SAIR" automático (LGPD).
### Follow-up
- Cadência 24h/72h (máx 2), para ao responder/opt-out.
### Vendedores / Comercial
- Cadastro com login próprio; leads quentes (score≥70) distribuídos por round-robin + notificação no WhatsApp (dedup).
- Vendedor vê só a carteira dele (conversas + dashboard escopados).
- **KPI por vendedor:** leads, em andamento, ganhos, perdidos, % conversão (marcação manual Ganhou/Perdeu no inbox).
### Acesso / Segurança
- **RBAC:** admin (acesso total) + usuários com permissões por área (toggles habilitar/desabilitar).
- PermissionsGuard no backend (403 sem permissão) + nav do frontend filtra por permissão.
- helmet (CSP/HSTS/X-Frame), rate limit (100/min), JWT cookie HttpOnly, ValidationPipe whitelist.
### Observabilidade
- Dashboard: contatos, conversas, mensagens, % IA autônoma, tokens + custo IA (US$), reclamações, DLQ.
- Logs estruturados (pino) + correlationId. Health: /health, /health/live, /health/ready (503 se DB cair).
- Swagger/OpenAPI em /api/docs.
### Integração WhatsApp
- Webhook WAHA→Nexa (inbound, normalização validada: @lid, telefone BR, mídia, opt-out).
- Nexa→WAHA (sendText + sendFile) com allowlist de segurança (hoje só 1 número de teste).
- WAHA configurado com 2 webhooks em paralelo (n8n + Nexa), sem quebrar o MVP antigo.

## 6. Banco (Prisma) — entidades principais
User, Session, AuditLog, Contact, AiConversation (+outcome/assignedSeller), AiMessage (tokens/custo),
AiKnowledgeBase/Version, Seller, SellerNotification, Campaign (+link/media/sendLimit), CampaignTarget,
SenderNumber (limite/warmup), FollowUp, Complaint, DomainEvent, EventDlq, Product/Credential,
AiBillingRequest/BillingEvent/PaymentStatusSync.

## 7. O que NÃO está pronto (consciente)
- **Decisões do dono:** limpar allowlist (enviar a clientes reais), desligar webhook do n8n, conexão real TMS/Asaas (com o parceiro Uelder).
- **Qualidade:** sem testes automatizados, sem CI/CD, sem runbook de incidentes.
- **Auth UX:** access token 15min SEM auto-refresh no frontend (usuário precisa relogar) — melhoria pendente.
- **Evolução:** embeddings/pgvector (retrieval é textual), onboarding pós-pagamento, oportunidades (funil formal),
  áudio (Whisper), agendamento (Calendar), multi-tenant (hoje tenant único 'default').
- **Produção:** deploy (DigitalOcean), HTTPS, backup automático, rotação de secrets, assinatura do webhook WAHA.

## 8. Decisões de arquitetura travadas
Plataforma independente (TMS=conector) · Redis (não Kafka) · Source of Truth por dado (ADR 011) ·
Action Policy + Kill Switch (ADR 012) · IA recomenda/back-end executa · congelamento de escopo por sprint.

---

## 9. PERGUNTAS PARA O GPT AVALIAR
1. Para um produto que **roda local agora** mas vai cobrar de clientes depois, qual a ordem ideal entre: testes automatizados, auto-refresh de auth, backup, e deploy?
2. O **auto-refresh de token** (hoje ausente) é bloqueador para uso diário por vendedores? Como implementar com cookie HttpOnly + rotação sem expor o refresh?
3. Faltou alguma **proteção de segurança** relevante para um sistema que dispara WhatsApp e guarda dados de leads (LGPD)? (já temos helmet, rate limit, RBAC, opt-out, kill switch, audit parcial).
4. A estratégia **anti-ban** (horário 7-19h, limite diário+hora, warmup, delay 30s, rodapé SAIR, pula opt-out) é suficiente para WhatsApp não-oficial (WAHA), ou há risco alto de bloqueio? O que reforçaria?
5. O **RBAC por permissões em string[]** (admin bypassa, guard por rota) é adequado, ou vale migrar para CASL/abilities agora?
6. O **retrieval textual** da base de conhecimento é aceitável para o volume atual, ou embeddings/pgvector já se justificam?
7. Algum **risco de inconsistência** rodando Nexa + n8n em paralelo no mesmo WAHA (resposta dobrada, etc.) que não tratamos?
8. Para os **KPIs de vendas** com marcação manual (Ganhou/Perdeu), o que falta para virar um funil/CRM de verdade (estágios, motivo de perda, valor)?
9. Algo no **modelo de dados** (seção 6) que deveria existir e não existe, pensando em escala?
10. Para **1 desenvolvedor**, qual a próxima entrega de maior impacto: hardening, testes, ou as features de evolução?

> Observação ao avaliador: este sistema é a plataforma COMERCIAL (vende o TMS), não o TMS em si.
> Sugestões devem respeitar isso (não reimplementar features de transporte/CT-e aqui).
