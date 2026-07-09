# Prompts para o Squad `/orquestra-nexa` — Correções da Auditoria 2026-07-08

> Referência: [`AUDITORIA_2026-07-08.md`](./AUDITORIA_2026-07-08.md)
> Cada agente começa **sem contexto** — os prompts embutem arquivo:linha e o problema. Copiar e colar.
> ⚠️ Nenhum agente roda `db:migrate`/`db:seed`/`db:studio` — só o Abel.

---

## 🎯 Mestre — Planejamento (`/orquestra-nexa:planejar`)

```
/orquestra-nexa:planejar
A auditoria em docs/auditoria/AUDITORIA_2026-07-08.md apontou 3 bloqueadores e 6 altos no backend NestJS.
Monte um plano de execução (ordem, branches, validação build/lint) para corrigir, sem rodar migrations/seed.

BLOQUEADORES:
1. anthropic.service.ts:54 e :90 — fetch à Anthropic sem timeout/retry → trava o pipeline da Lia.
2. app.module.ts:48 (ThrottlerGuard global 100/min) + whatsapp.controller.ts — webhook WAHA sofre rate-limit e descarta mensagens.
3. sender.service.ts:307 e :360 — filtro metadata:{path:['campaignId']} em ai_messages sem índice GIN → full scan.

ALTOS: tenantId String sem FK; ProcessedMessage/Session sem expurgo; ConversationAgentService God Service; disparo serial global (sender.service.ts:487); .chk/ versionado; sem cap de custo por tenant.

Só planejar. Não implementar ainda.
```

---

## 🔴 Bloqueadores — `/orquestra-nexa:dev`

### C1 — Timeout na IA
```
/orquestra-nexa:dev
Em apps/backend/src/shared/ai/anthropic.service.ts, os fetch de complete() (linha ~54) e completeWithUsage() (~90) não têm timeout nem retry — diferente de resolveLidToPhone/transcription que já usam AbortSignal.timeout.
Adicione signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS ?? 20000)) nos dois, com 1 retry de backoff para status 429/5xx. Valide com build + lint. Não altere os prompts.
```

### C2 — SkipThrottle nos webhooks públicos
```
/orquestra-nexa:dev
O ThrottlerGuard é global (app.module.ts:48). Aplique @SkipThrottle() nos endpoints públicos server-to-server que já têm token próprio: WhatsappController (presentation/http/whatsapp/whatsapp.controller.ts, protegido por WAHA_WEBHOOK_TOKEN), IntegrationsController e EmailController. Mantenha o throttle nas rotas de usuário e confirme que /auth/login segue protegido.
```

### C3 — Índice para campaignId
```
/orquestra-nexa:dev
sender.service.ts (linhas ~307 e ~360) filtra ai_messages por metadata:{path:['campaignId']} sem índice → full scan. Proponha a migration (índice GIN em metadata OU coluna campaignId dedicada + backfill) e o ajuste no código. Escreva o SQL/migration mas NÃO rode (db:migrate é só do Abel).
```

---

## 🟠 Altos

### A2 — Expurgo de tabelas (`/orquestra-nexa:dev`)
```
/orquestra-nexa:dev
ProcessedMessage e Session crescem sem limpeza (nenhum deleteMany no código). Adicione um @Interval no ConversationJanitorService que apague ProcessedMessage com createdAt < now-48h e Session expiradas/revogadas há >30 dias. Batch com take para não travar o banco. Testes inclusos.
```

### A3 — Quebrar o God Service (`/orquestra-nexa:dev`)
```
/orquestra-nexa:dev
conversation-agent.service.ts tem 540 linhas e 12 dependências — handle() faz roteamento, handoff, escalonamento, auto-envio, oportunidade, notificação, reclamação e métrica. Refatore extraindo colaboradores (HandoffOrchestrator, EscalationPolicy, AutoSendPolicy) sem mudar comportamento. Cubra com testes.
```

### A4 — Filas de disparo (`/orquestra-nexa:dev`)
```
/orquestra-nexa:dev
sender.service.ts:487 usa @Interval(15000) com findFirst de campanha entre todos os tenants — 1 envio por tick global, sem fairness. Proponha e implemente filas por tenant/número (round-robin) para paralelizar o disparo mantendo os limites anti-ban por número. Comece pelo desenho antes de codar.
```

### A5 — Remover .chk (`/orquestra-nexa:deploy`)
```
/orquestra-nexa:deploy
apps/backend/.chk/ tem 131 arquivos .ts de código duplicado versionados no git. Confirme que nada em src importa de .chk, remova do controle de versão (git rm -r) e adicione ao .gitignore.
```

### A6 — Cap de custo por tenant (`/orquestra-nexa:dev`)
```
/orquestra-nexa:dev
Não há teto de gasto com IA por tenant. O custo já é gravado em ai_messages.estimatedCostUsd e PlanLimit.maxMessagesMonth existe mas não é aplicado. Implemente contador mensal de mensagens/custo por tenant que corte o auto-envio da Lia ao atingir o limite do PlanLimit, com alerta. Não bloqueie opt-out/transacional.
```

---

## 🔒 Segurança — `/orquestra-nexa:revisar`

```
/orquestra-nexa:revisar
Revise segurança destes pontos da auditoria:
- email.controller.ts:87 e :123 — ${ctx.email}/${result.email} interpolados no HTML sem escape (HTML injection via header From spoofável).
- whatsapp.controller.ts:29 — comparação de token com !== (não constant-time) e fallback ?token= aparecendo em logs.
- whatsapp.service.ts — logs [webhook]/[ack] gravando corpo de mensagem (PII) em nível 'log'.
Proponha correções por gravidade.
```

---

## 🟡 Médios / Infra — `/orquestra-nexa:deploy`

```
/orquestra-nexa:deploy
Ajustes de infra da auditoria:
- docker-compose.production.yml:82 — WAHA fixado em :latest; troque por tag/digest fixo.
- docker-compose.production.yml:40 — mem_limit 900m com @xenova/transformers + whisper locais; avalie risco de OOM e ajuste/externalize.
- Backup: scripts/backup.ps1 roda só no Windows Task Scheduler; o droplet é Linux. Confirme backup automático do Postgres gerenciado DO ou configure cron no droplet.
```

---

## Ordem sugerida de execução

1. C1 + C2 (juntos, ~3 h — fecham 2 bloqueadores) → `/orquestra-nexa:dev`
2. A5 + M3 (quick wins, ~45 min) → `/deploy` + `/dev`
3. C3 (índice) → `/dev` (migration escrita, Abel roda)
4. A2 + M1 → `/dev` + `/revisar`
5. A6, A4, A1, A3 → conforme plano do `/planejar`
