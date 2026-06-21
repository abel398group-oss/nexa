# Changelog — Nexa

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).
Versões seguem [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.0.0] — 2026-06-20

### Adicionado
- **Monitor Proativo TMS** — motor de alertas automáticos (`src/application/monitor/`). Consome eventos do módulo `proactivity` do TMS, consolida por severidade (CRITICAL → OVERDUE → DUE_SOON → INFO) e envia via WhatsApp (WAHA) ou e-mail. Feature flag `MONITOR_ENABLED`. Frontend: `MonitorConfigPage` em `/settings/monitor`.
- **Webhooks outbound** — módulo completo com `webhook_subscriptions`, `webhook_deliveries`, HMAC-SHA256 (`X-Nexa-Signature`), retry backoff exponencial 5 tentativas.
- **PlanQuotaGuard** — tabela `plan_limits`, decorator `@UsePlanQuota`, HTTP 402 ao atingir cota de contatos/campanhas/mensagens.
- **Exportação LGPD** — `GET /contacts/:id/export` retorna CSV com dados do contato (portabilidade art. 18).
- **Anonimização por retenção** — `@Interval(24h)` no `ConversationJanitorService` anonimiza contatos opted-out além do prazo (`DATA_RETENTION_DAYS`, padrão 730 dias).

### Segurança
- **Criptografia SMTP/IMAP** — `EmailCryptoService` AES-256-GCM. Senhas armazenadas como `ENC:<iv>:<tag>:<cipher>`. Migration-safe para registros legados.
- **Sanitização de prompt injection** — `customerMessage` truncado em 4.000 chars com bloqueio de padrões ChatML, Llama tags, template injection e markdown header injection.

### Infra
- **Socket.IO Redis Adapter** — `@socket.io/redis-adapter` via `REDIS_URL`. Fail-open em single-instance.
- **Slow query logging** — `$on('query')` no `PrismaService` acima de `PRISMA_SLOW_QUERY_MS` ms (padrão 500ms).

### Env vars novas
`EMAIL_ENCRYPTION_KEY` · `REDIS_URL` · `DATA_RETENTION_DAYS` · `PRISMA_SLOW_QUERY_MS` · `MONITOR_ENABLED`

---

## [Não lançado]

### Próximos
- Índice HNSW pgvector (antes de 1.000 itens na KB)
- Backup automático PostgreSQL agendado no Droplet
- Monitor externo (UptimeRobot ou BetterStack)
- Playwright E2E (`apps/e2e/`)
- Página de status pública
- Exportação de dados de contato (portabilidade LGPD)
- Monitoramento externo (UptimeRobot / BetterStack)
- Índice HNSW do pgvector para escala da KB

---

## [0.9.0] — 2026-06-18 (Fase 4 — atual)

### Adicionado
- **Canal E-mail completo** (ADR 021): IMAP polling (60s), envio SMTP, rate-limit 10/hora, SPF/DKIM, opt-out em 2 passos, kill switch por canal, página de configuração no painel
- **Embeddings semânticos + pgvector**: busca RAG com modelo `multilingual-e5-small` (local, 384 dims), fallback textual automático, reindex sob demanda, status endpoint
- **Motor de follow-up de vendas**: cadência 24h/72h automática, respeito a horário comercial (UTC-3), integração com opt-out, `@Interval(20000)` ticker
- **Platform Admin completo** (ADR 025): `TenantSelector` na topbar, `TenantGate` de seleção inicial, banner de alerta "operando como cliente", break-glass para ações destrutivas
- **Auto-refresh de JWT**: interceptor axios no 401 que renova o access token transparentemente sem relogar o usuário
- **FSD Frontend** (passos 1-3): entidades `contact`, `campaign`, `conversation`, `seller`, `ticket` com camada `api/`, TanStack Query v5, react-hook-form + Zod instalados
- **Métricas de suporte** (`supportOverview`): taxa de resolução sem escalonamento, tempo médio de resolução, volume por categoria/prioridade, taxa de escalonamento por categoria
- **Métricas de campanha**: delivered%, read%, replied% no dashboard e gráficos
- **Portal de suporte** (ADR 015-019): clientes TMS abrem e acompanham tickets sem WhatsApp
- **WhatsApp Status** (ADR 026): campanhas do tipo "status" (story) via WAHA
- **Oportunidades**: funil comercial com estágios new→qualified→proposal→won/lost e histórico
- **Notificações em tempo real**: sino na topbar com alertas de lead quente, reclamação, opt-out
- **CI/CD deploy automático** (deploy.yml): build → DockerHub → SSH no Droplet → health check
- **Storybook**: catálogo visual de componentes UI
- **Command Palette** (Ctrl+K): busca rápida entre telas e ações no painel

### Melhorado
- **KillSwitch expandido**: agora controla master + whatsapp + email independentemente
- **Supervisor**: prompt refinado para não reprovar qualificação válida nem dados já informados pelo cliente
- **Knowledge**: cache em memória 30s por tenant evita N queries por mensagem
- **Sender**: warmup progressivo + limite horário (8/hora) além do limite diário (30/dia)
- **Conversas**: `lastActivityAt` atualizado a cada mensagem — base da regra de inatividade 7 dias
- **Nome do contato** (ADR 020): hierarquia pushname → TMS → manual, sem sobrescrever nome humano

### Corrigido
- **BUG-06**: `withinBusinessHours()` usava `getHours()` (UTC em Linux) — corrigido para UTC-3 (Brasília)
- **Sidebar sobreposição**: sidebar rail não sobrepunha mais o conteúdo principal em mobile
- **P6**: importação da KB usava N queries seriais — otimizado para 1 query com Map em memória

---

## [0.5.0] — 2026-05-15 (Fase 3 — Multi-agente)

### Adicionado
- **9 agentes de IA**: Router, Conversation (SDR), Sales, Support, Diagnostic, Resolution, CaseClassifier, Escalation, Supervisor
- **Módulo de suporte técnico** (ADR 015-019): triagem automática, diagnóstico, resolução, escalonamento
- **Base de conhecimento** com versionamento e curadoria humana (aprovação de versões)
- **Playbook editável**: operador configura persona, objeções, CTAs sem mexer no código
- **Handoff token** (ADR 022): botão "Falar com a Lia" do TMS com contexto pré-preenchido
- **Action Policy** (ADR 012): ações irreversíveis bloqueadas até aprovação humana
- **Autonomy Service** (ADR 012): kill switch master + por canal, persistido no banco
- **Audit log**: todas as ações administrativas registradas com userId e correlationId

---

## [0.2.0] — 2026-04-10 (Fase 2 — Campanhas)

### Adicionado
- **Campanhas de disparo** em massa: WhatsApp com template `{{nome}}`/`{{saudacao}}`
- **Pool de números** com warmup, limite diário (30) e limite horário (8) anti-ban
- **Follow-up automático** de 2 estágios (24h/72h)
- **Vendedores**: round-robin de atribuição + notificação WhatsApp para lead quente
- **Oportunidades**: funil básico (score ≥ 70 → oportunidade)
- **Conector HiperTMS**: busca dados de planos, contratos e frota para a Lia
- **Dashboard** com KPIs: contatos, conversas, mensagens, tokens de IA, custo

---

## [0.1.0] — 2026-03-01 (Fase 1 — Core MVP)

### Adicionado
- Estrutura monorepo com NestJS (backend) + React/Vite (frontend)
- Autenticação JWT com refresh token e sessões revogáveis
- Multi-tenant com isolamento por `tenantId`
- Integração WAHA (WhatsApp self-hosted)
- Pipeline básico: mensagem recebida → IA (Claude) → resposta enviada
- Base de dados PostgreSQL 16 + Prisma ORM
- Contatos com opt-out e dedup por telefone
- Conversas com status lifecycle (open → closed)
- Inbox em tempo real via WebSocket (Socket.io)
