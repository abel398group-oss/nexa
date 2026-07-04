# Roadmap — Nexa

**Última atualização:** 2026-07

---

## Fase 0 — MVP funcional ✅ (concluído)

- [x] Inbound com IA (classificação + resposta)
- [x] Base de conhecimento dinâmica
- [x] Histórico de conversa (contexto 24h)
- [x] Outbound com personalização e horário comercial
- [x] Follow-up automático (24h/72h)
- [x] Round robin de vendedores
- [x] Opt-out automático
- [x] IA Supervisora (auditoria de qualidade)
- [x] Monitoramento interno de reclamações
- [x] Tratamento de mídia, @lid, ofensas, saudação por horário
- [x] Number pool (saúde dos números, limite diário)

---

## Fase 1 — Hardening para produção ✅ (concluído)

- [x] API keys → variáveis de ambiente
- [x] Senha do WAHA → variável de ambiente
- [x] HTTPS no webhook (domínio + SSL)
- [x] Firewall (bloquear portas internas)
- [x] Backup automático do PostgreSQL (banco gerenciado DO)
- [x] Delay outbound configurável

---

## Fase 2 — Backend + API ✅ (concluído)

- [x] API REST (NestJS + Prisma) sobre PostgreSQL gerenciado DO
- [x] Autenticação JWT cookie HttpOnly
- [x] Endpoints: contatos, conversas, campanhas, oportunidades, dashboard
- [x] Eventos em tempo real via WebSocket (Socket.io)
- [x] Multi-tenant com EffectiveTenantInterceptor
- [x] RBAC + platform-admin guard (ADR 005/025)

---

## Fase 3 — Frontend MVP ✅ (concluído)

- [x] Login / Auth
- [x] Dashboard (métricas + gráficos)
- [x] Importar contatos (CSV/Excel)
- [x] Lista de contatos / CRM
- [x] Campanhas (criar + acompanhar)
- [x] Saúde dos números (NumberHealth + polling 10s)
- [x] Inbox de conversas (estilo WhatsApp Web, socket real-time)
- [x] Design system próprio (~30 componentes, dark mode — ADR 002/014)

---

## Fase 4 — Produção + Suporte TMS ✅ (no ar)

- [x] Deploy DigitalOcean (Docker Compose, CI/CD GitHub Actions)
- [x] Canal de e-mail (SMTP/IMAP — ADR 021)
- [x] Suporte TMS via IA (agentes diagnostic/resolution/escalation)
- [x] Base de conhecimento de suporte (ADR 018)
- [x] Playbooks de diagnóstico (ADR 017)
- [x] Escalação em níveis (ADR 015/016)
- [x] Portal do cliente (sessão + chamados — ADR 026)
- [x] Web chat embutido no TMS (ADR 027)
- [x] Pipeline de vendas / oportunidades
- [x] Conector HiperTMS (enriquecimento de contato — ADR 020)
- [x] Proactive engine (SLA, follow-up, alertas antecipados)

---

## Fase 5 — Escala (backlog)

- [ ] Testes de frontend (Vitest + Playwright)
- [ ] Rotacionar segredos expostos (ANTHROPIC_API_KEY)
- [ ] Fail-closed do tenant em admin.controller
- [ ] InboxPage — paginação (socket real-time)
- [ ] DateRange wiring — Campaigns / Opportunities / SupportDashboard
- [ ] Lint bloqueante no CI
- [ ] Reconhecimento de áudio (Whisper)
- [ ] Agendamento de reuniões (Google Calendar)
- [ ] NPS pós-venda
- [ ] Multi-tenant SaaS (outros conectores além do HiperTMS)
- [ ] Avaliar migração para API oficial da Meta
