# ADR-026 — Canal de Campanha: Status do WhatsApp

| Campo | Valor |
|---|---|
| **Status** | Aceito |
| **Data** | 2026-06-17 |
| **Autores** | Equipe Nexa |
| **Relacionado** | `sender.service.ts`, `waha-client.service.ts`, modelo `Campaign` |

---

## Contexto

O módulo de campanhas do Nexa suporta dois canais: WhatsApp 1:1 e E-mail. Há demanda
por um terceiro canal — **Status do WhatsApp** (Stories) — que permite publicar conteúdo
(texto, imagem, link de material) que aparece para todos os contatos salvos, sem envio
individual de mensagem.

A infra de WhatsApp já usa o **WAHA** (motor **WEBJS**), que expõe os endpoints:

```
POST /api/{session}/status/text
POST /api/{session}/status/image
```

A escolha do canal Status resolve casos de uso de **marketing de alcance** (não de
relacionamento 1:1): comunicados, lançamentos, promoções — sem gerar conversas no inbox
e sem custo por destinatário.

---

## Decisão

Adicionar o canal `status` como terceiro tipo de campanha no Nexa, implementado sobre
o WAHA WEBJS existente, com as seguintes escolhas de design:

### 1. Campo `type` no modelo `Campaign`

Adicionar `type String @default("message")` ao modelo Prisma `Campaign`.
Valores válidos: `"message"` (WhatsApp 1:1, comportamento atual) | `"email"` | `"status"`.
Migração aditiva — não quebra campanhas existentes.

### 2. Campos de conteúdo do Status reutilizam colunas existentes

| Campo do Status | Coluna do Campaign |
|---|---|
| Texto / legenda | `template` |
| URL da imagem | `mediaUrl` |
| Link do PDF/material | `link` |
| ID do post WAHA | novo campo `statusPostId String?` |
| Data de publicação | novo campo `statusPostedAt DateTime?` |

Não criar tabela nova — o Status é uma campanha com semântica diferente, não uma
entidade diferente.

### 3. Novos métodos no WahaClientService

`sendStatusText(text: string)` e `sendStatusImage(fileUrl: string, caption: string)`,
seguindo o mesmo padrão de `sendText`/`sendFile`: mesmo `baseUrl`, `session`, `X-Api-Key`.

### 4. Caminho de execução próprio no SenderService

Campanhas `type === 'status'` **não usam** o loop `tick()` por destinatário.
Um segundo intervalo (ou verificação dentro do `tick()`) detecta campanhas de status
`running` com `scheduledAt` atingido, publica uma única vez via WAHA e marca `done`.


### 5. CampaignTarget não é usado para Status

Status é broadcast — não há lista de destinatários gerenciada pelo Nexa.
Campanhas `type === 'status'` são criadas sem `targets`. O relatório expõe
`statusPostedAt` e `statusPostId` (retornado pelo WAHA); visualizações individuais
são melhoria futura (WAHA ainda não expõe esse dado de forma confiável no WEBJS).

### 6. Opt-out por destinatário não se aplica

WEBJS envia para todos os contatos salvos no dispositivo — o Nexa não controla a lista.
A ressalva de LGPD é documentada na UI: o Status alcança apenas contatos salvos
(base própria da empresa), não é prospecção fria. Registrar aviso explícito no compositor.

### 7. Sem delay/aquecimento/janela de horário

Status é um único post — risco de ban desprezível comparado ao disparo 1:1 em massa.
`SENDER_DELAY_*`, `WARMUP_DAILY` e `withinWaWindow` não se aplicam ao canal Status.

---

## Consequências

### Positivas

- Terceiro canal de alcance sem custo por destinatário.
- Reusa infraestrutura WAHA existente (sem novo serviço).
- Migração aditiva — zero impacto em campanhas `type="message"` em produção.
- PDF/documento publicável como link (padrão `MEDIA_PUBLIC_BASE` já existente).

### Limitações conhecidas (WEBJS)

| Limitação | Detalhe |
|---|---|
| **Sem segmentação por lista** | WEBJS ignora o campo `contacts`. O Status vai para **todos os contatos salvos** no número. Segmentação por lista exige motor NOWEB/GOWS (fora do escopo deste card). |
| **Sem ack individual** | Não há ack por destinatário — apenas confirmação de publicação. |
| **Expiração em 24h** | Comportamento nativo do WhatsApp, fora do controle do Nexa. |
| **PDF não postável nativamente** | WhatsApp Status não aceita documentos — entra como link na legenda. |
| **Alcance limitado** | Só aparece para quem tem o número salvo. Não adequado para prospecção fria. |

### Riscos

- Se o WAHA retornar erro na publicação, a campanha vai para `failed`. Retentativa
  manual via re-run (fora do escopo desta versão).
- Troca de motor para NOWEB/GOWS para habilitar segmentação é decisão futura independente.

---

## Alternativas Rejeitadas

| Alternativa | Motivo da rejeição |
|---|---|
| Criar tabela `StatusPost` separada | Overhead de schema sem benefício — `Campaign` já tem os campos necessários. |
| Usar o loop `tick()` existente com targets | Status não é 1:1 — forçar targets seria arquitetura incorreta e enganosa. |
| Esperar motor NOWEB para lançar | Atrasa entrega sem bloqueio técnico real; segmentação pode ser adicionada depois. |
| Publicar PDF diretamente como documento | WhatsApp não suporta documentos em Status — link é a única opção disponível. |
