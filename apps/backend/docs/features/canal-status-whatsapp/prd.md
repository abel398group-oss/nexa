# PRD — Canal de Campanha: Status do WhatsApp

> **Status:** Em desenvolvimento · **Versão:** 1.0 · **Data:** 2026-06-17
> **ADR de referência:** [ADR-026](../../adr/ADR-026-canal-status-whatsapp.md)

---

## 1. Objetivo

Adicionar o canal **Status do WhatsApp** (Stories) ao módulo de campanhas do Nexa,
ao lado de WhatsApp 1:1 e E-mail. O Status publica um único post (texto, imagem ou
link de material) que aparece para todos os contatos salvos no número — sem disparo
individual e sem gerar conversas no inbox.

**Valor para o usuário:** alcance rápido de toda a base com zero custo por destinatário,
sem risco de parecer spam e sem saturar o inbox.

---

## 2. Usuários

- **Gestor de campanhas** do tenant: cria, agenda e monitora publicações de Status.
- **Admin do tenant**: configura o número WAHA e visualiza relatórios.

---

## 3. Requisitos Funcionais

### 3.1 Backend

#### RF-01 — Migração Prisma

Adicionar ao modelo `Campaign`:

```prisma
type          String    @default("message")  // "message" | "email" | "status"
statusPostId  String?   // ID do post retornado pelo WAHA
statusPostedAt DateTime? // data/hora de publicação efetiva
```

- Migração aditiva: campanhas existentes recebem `type = "message"` por default.
- Campos `statusPostId` e `statusPostedAt` ficam `null` para campanhas não-status.

#### RF-02 — WahaClientService: novos métodos

```ts
sendStatusText(text: string): Promise<StatusResult>
sendStatusImage(fileUrl: string, caption: string): Promise<StatusResult>
```

`StatusResult`: `{ posted: boolean; postId?: string; reason?: string }`.

Ambos chamam os endpoints WAHA correspondentes com o mesmo padrão de auth (`X-Api-Key`,
`baseUrl`, `session`) já usado em `sendText`/`sendFile`.

#### RF-03 — SenderService: caminho de execução para Status

- Campanhas `type === 'status'` **não entram** no loop de destinatários do `tick()`.
- Dentro do `tick()` (ou em intervalo dedicado), verificar campanhas `status = 'running'`,
  `type = 'status'`, com `scheduledAt <= now` (ou `scheduledAt = null`), ainda não publicadas
  (`statusPostedAt = null`).
- Se `mediaUrl` estiver preenchido → `sendStatusImage(fileUrl, caption)` onde `caption`
  inclui `template` + link do PDF (se `link` estiver preenchido).
- Se apenas texto → `sendStatusImage` não aplicável → `sendStatusText(template + link)`.
- Após publicação bem-sucedida: marcar campanha como `done`, persistir `statusPostId` e
  `statusPostedAt`.
- Em caso de erro: marcar `failed`, salvar mensagem de erro (máx. 200 chars).
- CampaignTarget: **não criar targets** para campanhas `type === 'status'`.

#### RF-04 — Agendamento

Reutilizar o campo `scheduledAt` existente. Campanha de Status criada com `scheduledAt`
entra como `running`; o worker aguarda o horário antes de publicar.


#### RF-05 — Relatório de Status

Endpoint de detalhe de campanha (`GET /campaigns/:id`) para `type === 'status'` retorna:

```json
{
  "campaign": {
    "type": "status",
    "status": "done",
    "statusPostId": "true_15551234567@c.us_3EB0...",
    "statusPostedAt": "2026-06-17T14:30:00.000Z"
  },
  "targets": [],
  "counts": {},
  "engagement": null
}
```

Visualizações individuais: não disponíveis no WEBJS — campo reservado como melhoria futura.

#### RF-06 — Criação de Campanha de Status via API

`POST /campaigns` aceita o novo campo `type: "status"`. Quando `type === "status"`:
- `phones` e `fromContacts` são ignorados.
- `template` (texto/legenda) é obrigatório.
- `mediaUrl` (imagem) é opcional.
- `link` (URL do PDF/material) é opcional — incluído na legenda se presente.

---

### 3.2 Frontend

#### RF-07 — Aba/Seção "Status" no módulo de Campanhas

Adicionar terceira aba "Status" junto de "WhatsApp" e "E-mail" na tela de campanhas.
A aba exibe a lista de publicações de Status (publicado / agendado / falhou + data).

#### RF-08 — Compositor de Status

Formulário de criação com os seguintes campos:

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| Tipo de conteúdo | radio | ✅ | "Texto" ou "Imagem" |
| Imagem | upload | Se tipo=Imagem | Upload de arquivo de imagem |
| Texto / Legenda | textarea | ✅ | Texto do Status ou legenda da imagem |
| Link do material | text | — | URL do PDF/documento (aparece na legenda) |
| Agendar | datetime-local | — | Data e hora de publicação |

#### RF-09 — Preview do Status

Exibir preview do Status antes do envio:
- Texto: balão estilo story com o texto.
- Imagem: miniatura da imagem + legenda (truncada em 2 linhas).

#### RF-10 — Avisos obrigatórios na UI

Exibir **antes** do botão de envio:

> ⚠ Este Status será publicado para **todos os seus contatos salvos** no WhatsApp.
> O conteúdo expira automaticamente em **24 horas**.

#### RF-11 — Lista e Relatório de Publicações

Colunas na lista da aba Status:

| Coluna | Fonte |
|---|---|
| Conteúdo (preview) | `template` truncado |
| Tipo | `mediaUrl ? "Imagem" : "Texto"` |
| Agendado para | `scheduledAt` (ou "Imediato") |
| Publicado em | `statusPostedAt` |
| Status | `status` (Agendado / Publicado / Falhou) |

---

## 4. Requisitos Não-Funcionais

- **Sem breaking change:** campanhas `type="message"` e `type="email"` não são afetadas.
- **Migração zero-downtime:** campo `type` com `@default("message")` — sem backfill necessário.
- **Idempotência:** worker verifica `statusPostedAt IS NULL` antes de publicar — nunca
  publica duas vezes a mesma campanha.
- **Build/lint/test:** executar `pnpm build`, `pnpm lint` e `pnpm test` antes de concluir
  a implementação. O spec do SenderService deve cobrir o novo caminho de execução.

---

## 5. Limitações Conhecidas (motor WEBJS)

| Limitação | Impacto |
|---|---|
| Sem segmentação por lista | Status vai para TODOS os contatos salvos. Segmentação exige migração para motor NOWEB/GOWS (fora de escopo). |
| Sem ack individual | Relatório não mostra visualizações por contato. |
| PDF não nativo | Documentos entram como link na legenda — não como anexo nativo. |
| Expiração em 24h | Sem controle pelo Nexa. Informar o usuário na UI. |

---

## 6. Fora de Escopo

- Segmentação de destinatários por lista (requer NOWEB/GOWS).
- Métricas de visualização individuais.
- Status de vídeo ou voz (endpoints WAHA existem mas não são priorizados nesta versão).
- Retentativa automática em caso de falha (operação manual via re-run).
- Alteração do fluxo de disparo WhatsApp 1:1 ou E-mail existentes.

---

## 7. Critérios de Aceite

- [ ] Migração Prisma aplicada sem erros (`pnpm prisma migrate deploy`).
- [ ] `POST /campaigns` com `type: "status"` cria campanha sem targets.
- [ ] Worker publica no Status do WAHA na data/hora agendada.
- [ ] Campanha marcada `done` + `statusPostedAt` preenchido após publicação.
- [ ] Campanha marcada `failed` + mensagem de erro em caso de falha na API do WAHA.
- [ ] Campanhas `type="message"` continuam funcionando sem alteração.
- [ ] Aba "Status" visível na tela de campanhas do frontend.
- [ ] Avisos de "todos os contatos" e "expira em 24h" visíveis no compositor.
- [ ] Build, lint e testes passando.
