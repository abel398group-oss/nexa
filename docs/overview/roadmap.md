# Roadmap — Hipervias Leads

**Última atualização:** 2026-06

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

## Fase 1 — Hardening para produção ⏳ (antes do Digital Ocean)

- [ ] API keys → variáveis de ambiente (revogar key Anthropic exposta)
- [ ] Senha do WAHA → variável de ambiente
- [ ] HTTPS no webhook (domínio + SSL)
- [ ] Autenticação no painel n8n
- [ ] Firewall (bloquear portas internas)
- [ ] Backup automático do PostgreSQL
- [ ] Agendar Follow-up (10h) e Supervisor (22h) via UI do n8n
- [ ] Delay outbound para 30-90s
- [ ] Atualizar n8n (1.123 → 2.x) com planejamento

---

## Fase 2 — Backend + API (base do frontend)

- [ ] API REST (NestJS + Prisma) sobre o PostgreSQL existente
- [ ] Autenticação (JWT cookie HttpOnly)
- [ ] Endpoints: contatos, conversas, campanhas, oportunidades, dashboard
- [ ] Eventos em tempo real (mensagens novas)

---

## Fase 3 — Frontend MVP (padrão TMS)

- [ ] Login / Auth
- [ ] Dashboard (queries já prontas → cards/gráficos)
- [ ] Importar contatos (CSV/Excel)
- [ ] Lista de contatos / CRM
- [ ] Campanhas (criar + acompanhar)
- [ ] Saúde dos números
- [ ] Inbox de conversas (estilo WhatsApp Web)

---

## Fase 4 — Suporte TMS (atendimento de clientes)

- [ ] Workflow de suporte (IA com base de conhecimento técnica do TMS)
- [ ] Ler documentação do HiperTMS → popular base de conhecimento
- [ ] Escalação em níveis (normal / humano / crítico)
- [ ] Integração com Chatwoot (handoff humano)

---

## Fase 5 — Escala

- [ ] Pool de múltiplos números WhatsApp
- [ ] Aquecimento automático por fase
- [ ] Reconhecimento de áudio (Whisper)
- [ ] Agendamento de reuniões (Google Calendar)
- [ ] NPS pós-venda
- [ ] Multi-tenant (virar SaaS)
- [ ] Avaliar migração para API oficial da Meta
