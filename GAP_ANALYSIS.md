# Análise de Lacunas — Nexa vs n8n vs Documentação

> ✅ ESCOPO LOCAL CONCLUÍDO (2026-06-06): toda a paridade comportamental com o n8n + polimento (G1-G10, F1)
> está feita e validada. Resta: features de evolução (F2-F8), produção/deploy (⏸️ parado — fica local) e qualidade (Q1-Q5).


> Cruzamento entre o que está **documentado** (docs/), o que o **n8n MVP** faz, e o que o **Nexa** já implementa.
> Gerado em 2026-06-06 (após Blocos A-D). Checklist vivo — ticar conforme implementar.

---

## ✅ JÁ TEM PARIDADE (Nexa = n8n)

- [x] Inbound IA (classificação de intenção) — Router
- [x] Base de conhecimento dinâmica — KB + curadoria
- [x] Histórico de conversa — conversations/messages
- [x] Outbound com personalização ({{nome}}) — Sender
- [x] Horário comercial 7h-19h — Sender/Follow-up
- [x] Follow-up 24h/72h (máx 2, para ao responder) — Bloco D
- [x] Round robin de vendedores + dedup — Bloco A
- [x] Opt-out automático (palavras-gatilho, status opted_out) — WhatsApp/Sender
- [x] IA Supervisora (auditoria antes de enviar) — Supervisor
- [x] Number pool (limite diário 30, reset diário, delay anti-ban) — Bloco C
- [x] @lid / telefone BR / mídia (skip) — normalize()
- [x] Conector WhatsApp WAHA (in + out) + allowlist de segurança

PLUS (Nexa tem e n8n não): Inbox visual, Dashboard, CRM, Kill Switch runtime, governança ADR 012, tokens/custo.

---

## 🔴 GAPS DE PARIDADE (n8n faz, Nexa AINDA não) — comportamentais

- [x] **G1 · Rodapé opt-out "responda SAIR"** nas campanhas/follow-up ✅ (LGPD — auto-anexado se faltar). VALIDADO.
- [x] **G2 · Rate-limit anti-resposta-dupla (12s)** ✅ (Map em memória por telefone; guarda msg mas não reprocessa IA). VALIDADO.
- [x] **G3 · Saudação por horário** ✅ (placeholder {{saudacao}} → Bom dia/tarde/noite). VALIDADO ("Boa noite, Abel").
- [x] **G4 · Monitoramento interno de reclamações** ✅ (tabela complaints; router detecta isComplaint+topic; só registra; card no dashboard). VALIDADO (topic=atendimento).
- [x] **G5 · Humanização (delay 3-6s)** ✅ (pausa antes do auto-envio; só na autonomia ON, não no botão ✨). VALIDADO (9.1s c/ delay).
- [x] **G6 · Limite POR HORA** por número ✅ (hourlyLimit 8/h + sentThisHour + reset horário; gate no worker). VALIDADO (hora=0/8).
- [x] **G7 · warmup_stage** ✅ (aquecimento: stage 0→10/dia, 1→15, 2→20, 3→30; effectiveDailyLimit). VALIDADO (warmup=0→cap 10).
- [x] **G8 · Tratamento de ofensas** ✅ (router detecta isAggressive → human_needed → handoff; supervisora impede revidar). VALIDADO.
- [x] **G9 · Score mínimo por intenção** ✅ (meeting_request≥80, interested≥60 — clamp no router). VALIDADO (demo→85).
- [x] **G10 · Captura de contato** ✅ (Lia pede e-mail/WhatsApp do lead interessado, sem insistir). VALIDADO.
- [x] **G3+ · Saudação também nas RESPOSTAS da Lia** ✅ (sales+support recebem saudação do horário no prompt). VALIDADO ("Boa noite!").

---

## 🟠 FUNCIONALIDADES DOCUMENTADAS NÃO IMPLEMENTADAS (Nexa)

- [x] **F1 · Importar contatos CSV na UI** ✅ (botão "↑ Importar" no CRM; cola telefone,nome,empresa → /contacts/import). VALIDADO (botão renderiza).
- [ ] **F2 · Tela "Saúde dos números"** dedicada (hoje só um resumo no Disparo) (roadmap Fase 3).
- [ ] **F3 · Onboarding pós-pagamento** (welcome flow após billing confirmado) (ANALISE lacuna 13).
- [ ] **F4 · Busca semântica (embeddings/pgvector)** na KB (hoje retrieval textual) (Sprint 10/roadmap).
- [ ] **F5 · Escalação em níveis** suporte (normal/humano/crítico) + Chatwoot handoff (roadmap Fase 4).
- [ ] **F6 · Oportunidades** (opportunities/opportunity_stage_history) — funil de vendas formal (schema antigo tinha).
- [ ] **F7 · Reconhecimento de áudio (Whisper)** — hoje mídia é ignorada (roadmap Fase 5).
- [ ] **F8 · Agendamento de reuniões (Google Calendar)** (roadmap Fase 5).

---

## 🔒 PRODUÇÃO / HARDENING — ⏸️ PARADO (decisão do Abel: fica LOCAL por enquanto, DO depois)

- [ ] **P1 · Limpar allowlist do WAHA** (hoje só envia p/ 5512988073788) — quando for pra clientes reais.
- [ ] **P2 · Desligar webhook do n8n** no WAHA (Nexa assume sozinho) — após validar.
- [ ] **P3 · Secrets/JWT fortes** (JWT_SECRET ainda é placeholder "trocar-por...").
- [ ] **P4 · HTTPS no webhook** (domínio + SSL) — hoje http local.
- [ ] **P5 · Validação de assinatura no webhook WAHA** (hoje token opcional via query).
- [ ] **P6 · Backup automático do PostgreSQL** + teste de restore.
- [ ] **P7 · Deploy DigitalOcean** (ficar 24/7 — hoje roda no PC do Abel).
- [ ] **P8 · Rotacionar a ANTHROPIC_API_KEY** depois dos testes (foi colada no chat).
- [ ] **P9 · Rate limit / quota de uso** (ai_usage_limits — enforcement) (ANALISE lacuna 14).

---

## 🧪 QUALIDADE / OPERAÇÃO

- [ ] **Q1 · Testes automatizados** (unit/e2e) — hoje 0 (ANALISE Parte E).
- [ ] **Q2 · CI/CD** (build/test/deploy) (ANALISE lacuna 7).
- [ ] **Q3 · Runbook de incidentes** (o que fazer se Claude/WAHA/Asaas cair) (ANALISE lacuna 10).
- [ ] **Q4 · LGPD — documento legal/termos** (técnico ok; falta política formal) (ANALISE lacuna 11).
- [ ] **Q5 · Métricas por período** no dashboard (hoje só total).

---

## 🏗️ PADRÕES DE ENGENHARIA — comparação com HiperTMS v12 (mesma stack, em produção)

> O TMS v12 (apps/api+web, NestJS+Prisma+React) é o projeto-referência maduro. Lacunas transversais do Nexa:

### Alta prioridade
- [x] **E1 · Segurança HTTP** ✅ — helmet (CSP/HSTS/X-Frame/nosniff) + @nestjs/throttler (100/min global). VALIDADO (headers presentes, login ok).
- [ ] **E2 · Observabilidade** — TMS: JsonLogger + correlationId (AsyncLocalStorage) + Sentry + x-request-id. Nexa: pino básico, sem Sentry. (médio)
- [ ] **E3 · CI/CD** — TMS: .github/workflows (lint/build/test/migrate/deploy). Nexa: nenhum. (grande)

### Média
- [ ] **E4 · Testes** — TMS: ~46 unit (Jest) + Playwright e2e. Nexa: 0 (Vitest instalado, sem testes). (grande)
- [x] **E5 · RBAC completo** ✅ — login admin (acesso total) + usuários com PERMISSÕES por área (toggles
      habilitar/desabilitar: dashboard/inbox/contacts/knowledge/sellers/campaigns/ai_control/users).
      Tela "Usuários & Acessos" (admin cria login + marca áreas). PermissionsGuard no backend (403 sem permissão).
      Nav/topbar do frontend filtra por permissão. Vendedor mantém carteira isolada. VALIDADO (Carla: campaigns 200, sellers/users 403).
- [x] **E6 · Health detalhado** ✅ — /health/live (liveness) + /health/ready (readiness, 503 se DB cair). VALIDADO.
- [x] **E7 · Swagger/OpenAPI** ✅ — @nestjs/swagger em /api/docs (38 rotas) + /api/docs-json. VALIDADO.

### Baixa
- [ ] **E8 · React Query + Feature-Sliced Design** no front (TMS usa @tanstack/react-query+react-table+react-hook-form+zod+Storybook). Nexa: axios+context. (grande)
- [ ] **E9 · Rotas/layouts avançados** (ProtectedRoute/PermissionRoute, lazy loading) (médio)
- [x] **E10 · Cópia fiel do visual TMS** ✅ — SHELL: sidebar LARGA (240px) midnight #2a2738 com ícone+TEXTO,
      item ativo com barra azul + seção "MENU" + usuário no rodapé; TOPBAR branca (título + IA + sair);
      densidade zoom 0.8; fonte Inter. COMPONENTES: btn azul h-9 rounded-md, card rounded-xl, input h-9, badge,
      tabela compacta (classes .btn-primary/.card/.input/.badge no padrão shadcn do TMS). VALIDADO (screenshots).
- [x] **E12 · PaginationQueryDto/Paginated<T>** ✅ já padronizado e usado em todas as listagens.
- [ ] **E11 · docker-compose staging/prod** + **E13 · CONVENCOES.md** (rápido) — parado (local)

### ✅ Top 5 recomendados (valem mesmo local): E1 segurança, E7 Swagger, E6 health, E2 logging, E12 paginação padrão.

## 🔧 Melhorias pós-uso
- [x] **Auto-refresh de login** ✅ — interceptor axios renova o token no 401 (fila p/ 1 refresh, repete a request; se falhar → /login). Backend /auth/refresh já existia (rotação). VALIDADO.
- [x] **Backup do banco** ✅ — scripts/backup.ps1 (pg_dump via docker, data/hora, retém 14, restauração documentada). VALIDADO (110KB, 26 tabelas).
- [x] **Dedup inbound (processed_message_ids)** ✅ — evita Nexa processar/responder a mesma msg WAHA 2x (reentrega). VALIDADO (2ª vez → "duplicada").
- [x] Backup agendado ✅ — tarefa Windows "NexaBackupDiario" 02:00 (validado: LastTaskResult=0).
- [x] **JWT secrets fortes** ✅ — JWT_SECRET/JWT_REFRESH_SECRET trocados de placeholder por chaves aleatórias (P0 do GPT). VALIDADO (login ok).
- [x] **Delay sender 30-90s aleatório** ✅ (era 30s fixo) — anti-ban reforçado.
- [x] **Idempotência de campanha** ✅ — claim atômico do alvo (queued→sending via updateMany; count===0 → outro tick pegou). Evita "mesma campanha 2x". seller_notifications (unique conversa) e followup (unique+stage) já eram idempotentes. VALIDADO.
- [ ] Fixar versão do WAHA (infra do container de PRODUÇÃO; repinar reinicia sessão → fazer manual com cuidado) + onError já coberto no Nexa (try/catch Claude/WAHA).

## 🎯 PRIORIZAÇÃO SUGERIDA (ordem de ataque)

1. **G1 (rodapé SAIR)** — LGPD, trivial, faço já.
2. **G3 saudação horário + G2 rate-limit + G4 reclamações + G8 ofensas** — comportamento da Lia (lote).
3. **F1 import CSV + F2 saúde números** — operação diária do usuário.
4. **G6/G7 (hora/warmup) + G9 score mínimo + G10 captura** — refinamento anti-ban e qualificação.
5. **P3-P6, P8 hardening** + **P7 deploy DO** — antes do disparo real.
6. **F3 onboarding, F4 embeddings, F5 suporte níveis, F6 oportunidades** — evolução.
7. **Q1-Q5** — maturidade.

> Itens P1/P2 dependem de DECISÃO do Abel (validar Nexa antes). Resto é implementação.
