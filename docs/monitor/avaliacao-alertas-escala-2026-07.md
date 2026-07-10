# Avaliação — Monitor Proativo / Alertas WhatsApp (jul/2026)

Análise do mecanismo de alertas frente a três requisitos do Abel: **(R1) muitos
clientes no TMS**, **(R2) vários admins recebendo por setor**, **(R3) migração
próxima para a API oficial do WhatsApp**. Verificado no código dos dois repos.

## 1. Como funciona hoje (correto e verificado)

1. **TMS detecta** (`application/proactivity/` — 17 rotinas: fiscal, logística,
   frota, financeiro) e envia eventos ao Nexa via `POST /api/monitor/ingest`
   (server-to-server, timeout 5s).
2. **Config é fonte única no Nexa** (`TenantNotificationConfig`, campo JSON
   `sectorConfig`): por setor → 1 telefone, 1 e-mail opcional, horário e dias.
   A tela do TMS (Automação → Alertas WhatsApp) é um **proxy** dessa config
   (`alert-config.service.ts`) — bom desenho, sem duplicação.
3. **Nexa consolida e envia** (`consolidation.service.ts`, @Interval 5min):
   itera todos os tenants com config, e no horário do setor envia o digest por
   WhatsApp (WAHA) e/ou e-mail. Log de cada envio em `notificationLog`.
4. Existe abstração de canal (`NotificationChannel` — "Fase 1: WAHA, Fase 2:
   Z-API/Twilio") e alerta MON-006/MON-007 de saúde do janitor.

**Pontos fortes a preservar:** config única com proxy; digest consolidado por
setor (não metralhadora de alertas soltos); canal dual WhatsApp+e-mail; log de
envio; separação detecção (TMS) × entrega (Nexa).

## 2. Veredito

A base é boa e o desenho está certo. Mas do jeito que está, **não atende os 3
requisitos**: o envio per-sector está acoplado ao WAHA por fora da abstração,
só existe 1 destinatário por setor, e o loop de envio é sequencial sem fila —
com centenas de tenants configurados no mesmo horário (todo mundo gosta de 8h
e 15h30), o tick de 5 minutos estoura e alertas atrasam ou se perdem.

## 3. Gaps (ordem de prioridade)

### G1 — Um único destinatário por setor (bloqueia R2)
`sectorConfig` = `{ phone?: string; email?: string }`. Um telefone, um e-mail.
O conceito `recipients[]` (lista com canal por destinatário) já existe no modo
legado global, mas não no per-sector. **Fix:** evoluir o shape do JSON para
`recipients: [{ label, contact, channel }]` por setor, mantendo `phone`/`email`
como retrocompat (leitura aceita ambos). Sem migration — é JSON.

### G2 — `notifyPhone` bypassa a abstração de canal (bloqueia R3)
A rota per-sector (a principal!) chama `waha.sendText()` direto em
`monitor-notification.service.ts#notifyPhone`, ignorando o `NotificationChannel`.
A migração pra API oficial exigiria caçar chamadas espalhadas. **Fix:** ampliar a
interface (`send(tenantId, phone, message, opts?)`) e fazer TODO envio passar
por ela. Com isso, trocar WAHA → Cloud API = trocar UM provider.

### G3 — API oficial exige TEMPLATE (decisão de design, R3)
Na Meta Cloud API, mensagem iniciada pelo negócio (o digest é sempre) só sai
com **template pré-aprovado (HSM)** e tem **custo por mensagem**. O digest
atual é texto livre — não passa. **Decisões a tomar antes de codar:**
- Template com variáveis (ex: "Seu resumo {setor}: {n} alertas — veja: {link}")
  apontando para o painel, em vez do texto completo no WhatsApp;
- Número compartilhado da plataforma vs número por tenant (comercial);
- E-mail/painel como canal de conteúdo completo, WhatsApp como "toque".
O esqueleto `WhatsAppCloudChannel` pode nascer já com essa forma.

### G4 — Envio sequencial sem fila/retry/rate-limit (bloqueia R1)
`consolidation` itera tenants e envia um a um no próprio tick; falha = só log,
sem retry; sem rate-limit (a Cloud API tem limite por número; o WAHA banível).
**Fix:** enfileirar (BullMQ — Redis já existe no stack) com retry/backoff,
concorrência controlada e jitter de horário; o tick só agenda.

### G5 — Dois nomes de env para o mesmo segredo (incidente latente)
`alert-config.service.ts` (TMS) manda `Bearer NEXA_SERVICE_TOKEN`, mas o guard
do Nexa (`ServiceTokenGuard`) valida `TMS_SERVICE_TOKEN`. Funciona hoje porque
os DOIS valores são iguais em produção — se alguém rotacionar um sem o outro,
a tela de Automação quebra silenciosamente. **Fix:** padronizar em
`TMS_SERVICE_TOKEN` nos dois lados (aceitar ambos por 1 release, logar warning
de deprecação).

### G6 — `notificationLog` sem retenção (R1)
Cada envio gera uma linha; nenhum expurgo no janitor cobre a tabela. Com
escala, cresce para sempre. **Fix:** retenção no janitor (90 dias, env).

## 4. Roadmap sugerido

| Fase | Item | Repo | Esforço |
|---|---|---|---|
| 1 | G1 recipients[] por setor + UI | Nexa → TMS (tela) | médio |
| 1 | G2 canal único (refactor notifyPhone) | Nexa | pequeno |
| 1 | G6 retenção do log + G5 token | Nexa + TMS | pequeno |
| 2 | G4 fila BullMQ com retry/rate-limit | Nexa | médio |
| 2 | G3 WhatsAppCloudChannel + template | Nexa | médio (depende de conta Meta + template aprovado) |

Ordem de deploy continua: **Nexa (receptor) primeiro, TMS (tela) depois.**
Planos de implementação: `plano-implementacao-alertas-2026-07.md` (este repo) e
`hipertms_v12/docs/features/automation/plano-implementacao-alertas-2026-07.md`.
