# Auditoria — Módulo de Disparo de Leads (WhatsApp + E-mail)

> **Data:** 2026-08-02
> **Realizada por:** Claude (Sonnet 5) — auditoria dirigida, leitura direta do código
> **Escopo:** `apps/backend/src/application/sender/`, `application/email/`, `shared/waha/`,
> `presentation/http/sender/`, `presentation/http/whatsapp/`, modelos Prisma
> `Campaign`/`CampaignTarget`/`SenderNumber`/`SenderSettings`
> **Stack confirmada:** WhatsApp via WAHA (self-hosted, não Z-API/Evolution/Meta oficial);
> e-mail via SMTP puro (nodemailer), config por tenant (`EmailChannel`). Nenhum
> SendGrid/Resend/SES. Sem BullMQ/fila real — disparo é `@Interval` (polling) com lock Redis.

---

## Resultado — Matriz de Risco

| Área                          | Críticos | Altos | Médios | Baixos |
|-------------------------------|----------|-------|--------|--------|
| Confiabilidade do dado (status)| 2        | 0     | 1      | 0      |
| Escalabilidade/Multi-tenant   | 1        | 1     | 1      | 0      |
| CRUD / UX operacional         | 0        | 2     | 1      | 0      |
| Validação de dados            | 0        | 0     | 1      | 1      |
| Observabilidade               | 0        | 0     | 1      | 1      |
| Segurança                     | 0        | 0     | 0      | 1      |
| **TOTAL**                     | **3**    | **3** | **5**  | **3**  |

> A matriz acima é da **leitura inicial do código** (DISP-001 a 013), mais o DISP-014,
> encontrado durante a implementação. Os achados DISP-015 a 020 vieram depois, testando o
> disparo em produção, e estão na seção "Achados posteriores" — não estão contabilizados
> aqui de propósito, para preservar o retrato do que a auditoria estática pegou e o que só
> apareceu com o sistema rodando. Dos 6 posteriores, **1 era crítico** (DISP-020, Redis
> cruzado com o HiperTMS) e 1 impedia criar campanha com link (DISP-015).

---

## Ações imediatas (antes de qualquer campanha grande em produção)

| # | ID | Arquivo | Ação |
|---|----|---------|------|
| 1 | DISP-001 | `conversations.service.ts:445` + `sender.service.ts:780` | Status `'sent'` da campanha WhatsApp não reflete falha real do WAHA — ver detalhe abaixo |
| 2 | DISP-010 | `waha-client.service.ts`, `sender.service.ts`, `whatsapp.service.ts` | Sessão WAHA é única para a plataforma inteira — todo tenant dispara pelo mesmo número |
| 3 | DISP-002 | `sender.controller.ts` (ausente) | Sem endpoint de retry manual para alvos `failed` |
| 4 | DISP-003 | `sender.service.ts:374` (`campaignDetail`) | Sem paginação — carrega toda a campanha de uma vez |

---

## Findings completos

### 🔴 DISP-001 (Crítico) — Status "sent" do WhatsApp não reflete o envio real

**Cadeia completa, rastreada arquivo por arquivo:**

1. `sender.service.ts:764` chama `conversations.addMessage(...)` para "enviar".
2. Dentro, `conversations.service.ts:445-456` chama `waha.sendText()` e só **loga** o resultado — nunca lança exceção, nunca retorna o resultado ao chamador.
3. `waha-client.service.ts:114-143` (`sendText`) **nunca lança** — todo erro (timeout, 5xx, sessão caída, rede) vira `{ sent: false, reason }` capturado internamente.
4. De volta em `tick()`, o fluxo segue direto para o `$transaction` em `sender.service.ts:780-786`, que marca `campaignTarget.status = 'sent'` **incondicionalmente**.
5. O webhook de ack (`whatsapp.service.ts:50-81`, `handleAck`) só atualiza `aiMessage.ack` — nunca `campaignTarget.status`.

**Impacto:** se o WAHA cair, a sessão desconectar, ou o número estiver fora da allowlist, a campanha inteira aparece como "100% enviada" no relatório.

**Prova de que é regressão, não decisão de design:** o worker de e-mail (`email-campaign-sender.service.ts:376-394`) faz certo — checa `result.sent` antes de decidir `sent`/`failed`. O WhatsApp só não faz isso porque passa por `addMessage()`, compartilhado com o fluxo de resposta da IA, que descarta o resultado.

**Correção sugerida:** `addMessage` passa a retornar `{ message, sendResult }`; `tick()` verifica `sendResult.sent` antes de marcar `'sent'`. Requer checar todos os chamadores de `addMessage` antes de mudar o contrato de retorno.

### 🔴 DISP-010 (Crítico/Arquitetural) — Sessão WhatsApp única para toda a plataforma

`WAHA_SESSION`, `WAHA_API_URL`, `WAHA_API_KEY` são env vars de processo, lidas sem `tenantId`
em **todo** lugar que toca WAHA: `waha-client.service.ts:20-24`, `whatsapp.service.ts:185-230`,
`waha-health.service.ts:41-42`, `waha-bootstrap.service.ts:19-21`, `sender.service.ts:123`.

O modelo `SenderNumber` tem um campo `sessionName` por tenant, mas ele **nunca é lido** pelo
cliente WAHA — é vestigial. Hoje, todo tenant dispara pelo mesmo número de WhatsApp.

Consequência composta com o pacing anti-ban: as chaves Redis `sender:lastSentAt`/
`sender:nextDelayMs` (`sender.service.ts:24-25`) também são globais, e a seleção de campanha
no tick é FIFO sem particionar por tenant (`campaign.findFirst(...orderBy:{createdAt:'asc'})`,
`sender.service.ts:661-668`). Resultado: um tenant com campanha grande **morre de fome** o
throughput de todos os outros tenants até a fila dele esvaziar — e o ritmo geral (1 msg a
cada 30-90s) é compartilhado pela plataforma inteira, não por tenant.

**Contraste:** o canal de e-mail já resolve isso corretamente — `EmailReplyService.resolveConfig(tenantId)` busca config SMTP por tenant via `EmailChannel`.

**Correção sugerida:** roadmap à parte (grande) — sessão WAHA por tenant, seguindo o mesmo padrão do e-mail.

### 🟠 DISP-002 (Alto) — Sem retry manual para alvos `failed`

Nenhuma rota reseta `status:'failed' → 'queued'`. Único jeito de recuperar hoje é editar o
banco na mão. `sender.controller.ts` tem `start`/`pause`, mas não `retry`.

### 🟠 DISP-003 (Alto) — `campaignDetail` sem paginação

`sender.service.ts:374-377` carrega **todos** os `CampaignTarget` de uma campanha de uma vez,
mais N queries relacionadas (`aiConversation`, `aiMessage`) do mesmo tamanho, sem `take/skip`.
Numa campanha de milhares de leads isso é um payload grande em toda visita à tela de detalhe.

### 🟠 DISP-004 (Alto) — Sem ação "Cancelar" campanha

Só existe `pause` (`sender.controller.ts:147-150`), que impede o worker de pegar mais alvos,
mas os `queued` continuam na fila indefinidamente. Não há ação que os zere de propósito.

### 🟡 DISP-005 (Médio) — Índice composto ausente em `CampaignTarget`

A query mais quente do worker (`findFirst` por `campaignId + status`, ordenada por
`createdAt`) usa dois índices separados (`schema.prisma:574-575`) em vez de um composto
`@@index([campaignId, status, createdAt])`.

### 🟡 DISP-006 (Médio) — Falha do anexo de mídia é silenciosamente ignorada

> **Correção da versão inicial deste relatório (2026-08-02):** a primeira redação dizia que
> `sendFile` "lançaria" e marcaria o alvo como `failed` indevidamente. Está **errado** —
> `waha-client.service.ts:38-66` captura tudo internamente e devolve `{ sent: false, reason }`,
> nunca lança. O problema real é o oposto, descrito abaixo.

`sender.service.ts` (bloco do anexo): o retorno de `await this.waha.sendFile(...)` é
**descartado**. Se o anexo falhar, o alvo é marcado como `'sent'` do mesmo jeito e o
relatório não indica que o material nunca chegou. O erro fica só no log do
`WahaClientService`.

### 🟡 DISP-007 (Médio) — `{{nome}}` no e-mail ainda usa fallback genérico

`email-campaign-sender.service.ts:95-96` usa `|| 'tudo bem'` — exatamente o bug que o
WhatsApp já corrigiu em `sender.service.ts` (`firstName()` + `tidyMissingName()`, comentário
cita "1.666 de 3.097 leads sem nome"). O e-mail não recebeu a mesma correção.

### 🟡 DISP-008 (Médio) — Sem validação de formato de e-mail no DTO

`CreateEmailCampaignDto.emails` (`sender.controller.ts`) é `@IsArray()` sem
`@ValidateNested()`/`@IsEmail()` nos itens — qualquer string passa a fila.

### 🟡 DISP-009 (Médio) — Sem reconciliação entre `campaignTarget.status` e `ack` real

`campaignDetail()` já calcula engajamento (delivered/read/replied) corretamente a partir do
`ack` real da `aiMessage` — esse é o dado confiável. Mas o `status` bruto do target
(`sent`/`failed`) nunca é corrigido por esse dado, então os dois podem divergir sem aviso.

### 🔴 DISP-014 (Crítico) — Worker de WhatsApp consumia alvos de campanha de e-mail

> Achado **durante a implementação** das correções, não na leitura inicial.

O worker de e-mail filtra `channel: 'email'` (`email-campaign-sender.service.ts:288-296`),
mas o worker de WhatsApp **não filtrava canal nenhum** (`sender.service.ts`, `findFirst` da
campanha). Como os dois rodam a cada 15s sobre a mesma tabela, o worker de WhatsApp podia
pegar uma campanha de e-mail primeiro, fazer o claim atômico do alvo e tentar mandar
WhatsApp para o telefone sintético `email:<endereço>` (`emailToPhone`, `email.service.ts:43`).

Efeito combinado com o DISP-001: o alvo era consumido, marcado `'sent'` em silêncio, e o
**e-mail real nunca era enviado** — sem nenhum rastro no relatório. Com o DISP-001 corrigido
o sintoma vira um `'failed'` visível, mas o alvo continuaria sendo roubado do canal certo.

Os outros dois `updateMany` do tick (recuperação de travados e fechamento de campanha)
também não filtravam canal e mexiam em campanhas/alvos de e-mail.

### 🔵 DISP-011 (Baixo) — Sem webhook de bounce/complaint no e-mail

Só existe webhook inbound (Mailgun) e opt-out. Um bounce hard fica `'sent'` para sempre.
Depende de decisão de produto (SMTP puro normalmente não emite bounce webhook — precisaria
de provedor transacional ou parsing de bounce via IMAP).

### 🔵 DISP-012 (Baixo) — SMTP sem timeout de conexão

`email-reply.service.ts:135-141` — `nodemailer.createTransport` sem
`connectionTimeout`/`socketTimeout`, diferente das chamadas WAHA (que usam
`AbortSignal.timeout(15000)` em todo lugar).

### 🔵 DISP-013 (Baixo) — `rejectUnauthorized: false` no SMTP

`email-reply.service.ts:140` desabilita validação de certificado TLS (comentário explica:
certificados cPanel/Hostgator sem CA raiz). Trade-off pragmático, mas deveria estar
documentado como risco aceito, não só um comentário de código.

---

## Pontos positivos identificados

- Isolamento multi-tenant correto em 100% das queries de campanha/target/número — `tenantId`
  sempre vindo do JWT (`@CurrentTenant()`), nunca de body/query.
- Validação de telefone brasileira sólida (`phone-eligibility.ts`) — DDD real (lista Anatel),
  9º dígito, rejeita fixo — nasceu de um incidente real documentado (33 números estrangeiros,
  27 fixos num CSV de 1.976 leads).
- Recuperação de crash do worker: alvos presos em `'sending'` voltam pra `'queued'`
  automaticamente após 5-10min.
- Claim atômico (`queued → sending`) evita envio duplicado entre ticks concorrentes.
- Sistema anti-ban genuinamente cuidadoso: delay aleatório, aquecimento progressivo, limite
  diário/hora, janela comercial, bloqueio de concorrentes por nome/domínio, dedup entre
  campanhas, filtro de clientes já no TMS.
- Credenciais SMTP por tenant criptografadas (`EmailCryptoService`).
- Opt-out LGPD com token, TTL de 30 dias, rodapé obrigatório configurável.
- Lock distribuído (Redis) garante uma única réplica processando por tick — sem duplicação
  entre instâncias do backend.

---

## Status de implementação (2026-08-02)

| ID | Situação | Onde |
|----|----------|------|
| DISP-001 | ✅ corrigido | `conversations.service.ts` (`requireDelivery` opt-in) + `sender.service.ts` (marca `failed`, loga o motivo e preserva o ritmo anti-ban na falha). 2 testes de regressão. |
| DISP-014 | ✅ corrigido | `sender.service.ts` — `channel: 'whatsapp'` nos 3 pontos do tick. 1 teste. |
| DISP-002 | ✅ implementado | `retryFailed()` + `POST /campaigns/:id/retry-failed` + botão "Reenviar falhas" agora faz retry **na própria campanha** (antes criava campanha nova e forçava canal WhatsApp, o que quebrava campanha de e-mail). |
| DISP-003 | ✅ corrigido (backend + frontend) | Backend: `campaignDetail(tenantId, id, { limit, offset, status, search })` + DTO de query, retrocompatível (sem `limit` devolve tudo). Frontend: `CampaignsPage` pagina de 50 em 50, a busca virou server-side (debounce 350ms) e o **polling de 8s agora recarrega só a página atual** — antes cada ciclo rebaixava a campanha inteira, para cada campanha expandida. |
| DISP-005 | ✅ corrigido | `@@index([campaignId, status, createdAt])` + migration aditiva `20260802120000_campaign_target_dispatch_index`. |
| DISP-007 | ✅ corrigido | `email-campaign-sender.service.ts` reusa `firstName`/`tidyMissingName`/`greeting` do canal WhatsApp. |
| DISP-008 | ✅ corrigido | `EmailTargetDto` com `@IsEmail()` + `@ValidateNested()`. |
| DISP-012 | ✅ corrigido | `connectionTimeout`/`greetingTimeout`/`socketTimeout` nos **4** pontos que abrem SMTP (`email-reply.service.ts` ×2, `admin-alert.service.ts`, `waha-health.service.ts`). Teto ~30s, abaixo do TTL de 60s do lock. |
| DISP-004, 006, 009, 010, 011, 013 | ⬜ em aberto | Não implementados. |

### Achados posteriores (2026-08-02/03) — durante o teste em produção

Estes **não** vieram da leitura inicial; apareceram testando o disparo de verdade.
Ficam registrados aqui porque o padrão se repete: quase todos são *campo/config que
faltou*, não lógica errada.

| ID | Situação | O que era |
|----|----------|-----------|
| DISP-015 | ✅ corrigido | `sendLinkOnFirst` existia no DTO de e-mail mas **não no de WhatsApp**. A tela enviava o campo junto com o link e o `forbidNonWhitelisted` global derrubava a criação com **400** — criar campanha de WhatsApp com link preenchido sempre falhava. Mesmo padrão do incidente que originou a REGRA 1/2. |
| DISP-016 | ✅ corrigido | Dava para criar campanha **sem nenhum destinatário**: nascia vazia, o worker marcava `done` no 1º tick e a tela só dizia "Campanha criada! 0 contato(s)". Parecia que o disparo rodou e não enviou. Agora recusa com mensagem explícita. 3 testes. |
| DISP-017 | ✅ corrigido | O **anexo** era colado na mensagem sempre, ignorando o `sendLinkOnFirst` que o link já respeitava. A 1ª mensagem fria saía com uma URL mesmo com a opção desmarcada — mesmo risco de ban, e quebrava a regra "primeiro contato é só texto". |
| DISP-018 | ✅ corrigido | O rodapé de opt-out era **concatenado na constante** do follow-up, então `LGPD_OPT_OUT_FOOTER=false` tirava a frase do disparo mas ela **voltava no follow-up de 24h/72h**. Os dois canais agora leem a mesma chave. |
| DISP-019 | ✅ corrigido | `scheduledAt` existia na criação mas **não no DTO de edição** — campanha agendada ficava presa no horário original. Regra própria: reagenda enquanto `sent === 0`, inclusive em campanha "concluída" com tudo pulado. |
| DISP-020 | ✅ corrigido | **Backend do Nexa falava com o Redis do HiperTMS.** O backend está nas duas redes Docker e as duas têm um serviço `redis`; o DNS resolvia para o do TMS (`172.18.x`) em vez do próprio (`172.19.x`). Locks, estado anti-ban e pub/sub do WebSocket iam parar no Redis do outro sistema, com risco de colisão de chaves e de perder o ritmo se aquele Redis reiniciasse. Sintoma que denunciou: warning `default user does not require a password`. Correção: `REDIS_URL` por nome de container + alias `nexa-redis` no compose. |

**Armadilha de operação descoberta no caminho:** `docker compose restart` **não relê o
`env_file`** — as variáveis são gravadas no container na criação. Três mudanças de `.env`
(`LGPD_OPT_OUT_FOOTER`, `GATE_TEST_PHONES`, `REDIS_URL`) pareceram aplicadas e não estavam.
Para valer é `docker compose up -d --force-recreate backend`.

> **Pendência operacional:** a migration do DISP-005 precisa rodar em produção com
> `prisma migrate deploy` (REGRA 5 — nunca `migrate dev`/`db push`). Nada depende dela
> para funcionar: o índice é performance, as queries paginadas rodam sem ele.

**Resíduo conhecido (DISP-003):** o modal "Editar contatos" (`loadEditTargets`) continua
carregando a campanha inteira. É clique explícito do operador, não um ciclo de 8s, e o
contador ao lado do botão precisa mostrar o total real — paginar ali exigiria uma UI
própria. O caso grave (polling) está resolvido.

---

## Plano de implementação sugerido (ordem)

Concluído: DISP-001, 002, 003, 005, 007, 008, 012, 014 a 020.

**Restam:**

1. **DISP-004** (botão Cancelar campanha) e **DISP-009** (coluna "confirmado pelo WhatsApp")
   — pequenos, independentes, sem urgência.
2. **DISP-006** (falha do anexo ignorada — alvo vira `sent` mesmo se o arquivo não foi).
3. **DISP-013** — documentar o `rejectUnauthorized: false` como risco aceito.
4. **DISP-010** (sessão WAHA por tenant) e **DISP-011** (bounce de e-mail) — ficam fora até
   decisão de produto: não são bugs pontuais, são arquitetura/infraestrutura. O DISP-010
   segue sendo a limitação estrutural mais séria do módulo (um tenant com campanha grande
   mata o throughput dos outros, e todos disparam pelo mesmo número).

---

## Relacionados

- `docs/features/campaigns/prd.md`, `docs/features/campaigns/whatsapp-status.md`
- `docs/adr/021-canal-email-leads.md`, `023-orquestrador-envio-unico.md`,
  `024-campanhas-filtro-tms.md`, `029-canal-status-whatsapp.md`
- `docs/infra/item2-fila-alerta-bullmq-2026-07.md` (proposta de fila real — relevante para
  DISP-010, já que resolveria também o gargalo de throughput global)
- `docs/reviews/2026-06-21-auditoria-tecnica-completa.md` (menciona BUG-001 — estado do
  sender multi-instância, já corrigido; esta auditoria é sobre o disparo em si)
