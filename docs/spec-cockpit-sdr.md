# Nexa — Cockpit do SDR: especificação de implementação

> Especificação técnica decorrente de [`analise-cockpit-sdr.md`](./analise-cockpit-sdr.md),
> com as decisões do Abel de **20/08/2026**. Operação **100% manual**: a Lia fica
> desligada neste fluxo, o SDR controla ponta a ponta.

---

## 0. Decisões que regem esta especificação

| # | Decisão |
|---|---|
| 1 | Centro em abas **Conversa \| Roteiro**. Clicar em "Ligar" chaveia para Roteiro. |
| 2 | Qualificação **mista**: caixas de critério fixo + campo de observação livre. |
| 3 | **Marcar reunião = handoff automático.** Agendou é qualificado e entregue. |
| 4 | Cadência apenas **exibida**; o SDR movimenta e registra. |
| 5 | O SDR **edita o score** — ele fala com a pessoa e sabe a temperatura real. |

### ⚠️ Um ponto que contradiz a decisão 4 e precisa de veredito

"Lia desligada" **não** desliga a cadência automática. Verificado no código: nem
`followup.service.ts` nem `sender.service.ts` consultam o kill switch — são relógios
independentes.

Consequência concreta: o SDR liga na quarta e conversa 20 minutos; na quinta o sistema
manda sozinho *"passando pra saber se você viu minha mensagem"*, porque a cadência só
para quando **o lead responde** (`whatsapp.service.ts:718`), nunca quando o vendedor
trabalha.

**Recomendação:** a cadência pausa sozinha quando o SDR registra atividade naquele lead
(seção 6 abaixo). Mantém o follow-up útil em quem ninguém tocou, e cala onde há humano.
Sem isso, "controle de ponta a ponta" não se sustenta.

---

## 1. Backend — o que liberar

### 1.1 Modelos de mensagem legíveis pelo SDR

**Problema:** `message-templates.controller.ts` tem `@RequirePerm('campaigns')` na
classe. Usuário só com `sdr` recebe **403**.

**Solução:** mover a permissão do controller para cada rota, e deixar o `GET` aceitar
os dois papéis. Escrever, aprovar e excluir continuam exigindo `campaigns`/`settings` —
o SDR lê a biblioteca, não a edita.

```
GET  /message-templates          → @RequirePerm('campaigns', 'sdr')   // leitura
POST /message-templates          → @RequirePerm('campaigns')          // inalterado
POST /message-templates/:id/approve → @RequirePerm('settings')        // inalterado
DELETE ...                       → @RequirePerm('settings')           // inalterado
```

O SDR chamará sempre com `?approved=true` — rascunho não vai para o lead.

### 1.2 Score e identidade no payload da fila

**Problema:** `sdr.service.ts` monta o `select` sem `interestScore`, e o tipo
`ItemDaFila` não declara o campo. Ele é calculado, existe no banco, e some no caminho.

**Solução:** somar ao `select` da fila e ao tipo do front:

| Campo | Origem | Para quê |
|---|---|---|
| `interestScore` | `Opportunity` | Termômetro na fila e na ficha |
| `conversationId` | `Opportunity` | **Chave da aba Conversa** — sem ele não há thread |
| `leadStatus` | `Contact` (2ª query, em lote) | new/cold/warm/hot |
| `tags` | `Contact` | Contexto de segmentação |

O `conversationId` é o mais importante: sem ele a aba Conversa não tem o que abrir.

### 1.3 Buscar a conversa de um lead

**Problema:** `GET /conversations` filtra por `scope`, `status`, `sellerId`, `search` —
**não** por contato. Achar a thread do lead exige buscar por telefone e torcer.

**Solução:** aceitar `contactId` no filtro de listagem. Uma linha no DTO e no `where`.

> Alternativa considerada e descartada: usar `Opportunity.conversationId` direto.
> Funciona quando a oportunidade nasceu de uma conversa, mas o lead importado por CSV
> não tem conversa até alguém falar com ele — e é justamente aí que o SDR precisa
> **criar** uma. O filtro por contato cobre os dois casos.

### 1.4 Qualificação — campo novo

Não existe nada estruturado hoje: só o texto livre da anotação.

**Migração aditiva** em `Opportunity`:

```sql
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "qualification" JSONB;
```

Formato gravado:

```json
{
  "decisor": true,
  "frotaPropria": true,
  "temOrcamento": false,
  "observacao": "Sócio decide junto. Retomar depois do fechamento do mês.",
  "avaliadoEm": "2026-08-20T14:32:00Z",
  "avaliadoPor": "seller-id"
}
```

**Por que JSONB e não três colunas:** os critérios são do time comercial e vão mudar —
"tem TMS hoje?", "quantas filiais?". Cada mudança viraria migração em produção. O
formato é validado no DTO, então a flexibilidade não vira lixo.

**Por que na `Opportunity` e não no `Contact`:** a qualificação é daquele ciclo de
venda. O mesmo contato pode ser recusado hoje por falta de orçamento e qualificar em
seis meses — duas oportunidades, duas avaliações, ambas preservadas.

**Rota:**

```
PATCH /sdr/opportunities/:id/qualification
Body: { decisor?, frotaPropria?, temOrcamento?, observacao? }
```

Fica em `/sdr` e não em `/opportunities` porque só o SDR qualifica, e a rota herda o
escopo por dono e mercado que o `SdrService` já aplica.

### 1.5 Score editável pelo SDR

```
PATCH /sdr/opportunities/:id/score
Body: { interestScore: 0..100 }
```

Grava também uma `SellerActivity` do tipo `note` registrando a mudança — sem isso, o
score muda e ninguém sabe quem mudou nem por quê. Se depois se quiser comparar a
calibragem humana com a da IA, o registro é a única fonte.

### 1.6 Marcar reunião = handoff

**Decisão 3:** agendar reunião entrega o lead ao closer.

Não é rota nova. É o `transferir()` que já existe, chamado por um botão diferente:

```
PATCH /sdr/opportunities/:id/transfer
Body: { closerId, meetingAt, meetingUrl?, notes? }
```

O que muda é só a **tela**: o diálogo "Marcar reunião" pede data, hora, link e o closer
— e usa a rota de transferência. O backend não precisa de nada novo, e as validações
que já existem (não transferir para si, closer do mercado, closer não ausente) passam a
valer para o agendamento de graça.

**Efeito colateral que o time precisa saber:** o lead **sai da fila do SDR** ao agendar.
Se ele precisa continuar aparecendo até a reunião acontecer, a decisão 3 muda de forma.

---

## 2. Frontend — o layout

```
┌────────────┬──────────────────────────────────┬───────────────┐
│ FILA       │  [ Conversa ]  [ Roteiro ]       │ LEAD          │
│ (20rem)    │                                  │ (22rem)       │
│            │  ── aba Conversa ──              │               │
│ Lead A     │  ← Lia: Bom dia, aqui é...       │ Empresa       │
│ ●●●○○ 62   │  → Lead: manda mais info         │ Contato       │
│ toque 2    │  ← Você: claro, o que...         │ ●●●○○ 62 ✎    │
│ ⏱ amanhã 9h│                                  │ Frota: 40     │
│            │  ┌────────────────────────────┐  │ Veio de: X    │
│ Lead B     │  │ escreva…       [modelo ▾]  │  │ ───────────── │
│ ●●○○○ 35   │  │         WhatsApp │ E-mail  │  │ QUALIFICAÇÃO  │
│ nunca      │  └────────────────────────────┘  │ ☑ Decisor     │
│            │                                  │ ☑ Frota própria│
│ Lead C     │  ── aba Roteiro ──               │ ☐ Tem orçamento│
│ ●○○○○ 12   │  Abertura da ligação             │ ┌───────────┐ │
│ toque 1    │  Abertura do WhatsApp            │ │observação │ │
│            │  Se ele disser… (objeções)       │ └───────────┘ │
│            │  Material do mercado             │ ───────────── │
│            │  Material de consulta            │ JÁ RECEBEU    │
│            │                                  │ • D2 ✓ · D9 ✓ │
│            │                                  │ ───────────── │
│            │                                  │ HISTÓRICO     │
└────────────┴──────────────────────────────────┴───────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Registrar · Não atendeu · Ligar depois · 📅 Marcar reunião · │
│ Passar pro closer · Descartar                                │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 Coluna 1 — Fila

Ganha três informações:

- **Termômetro** — o `interestScore` em cinco bolinhas. Substitui o selo de prioridade?
  **Não**: prioridade responde "o que fazer agora", score responde "quanto vale". Os
  dois convivem.
- **Toque atual** — em que passo da cadência o lead está.
- **Próximo disparo** — quando o automático fala com ele. É o que evita o SDR ligar
  para alguém que vai receber mensagem em duas horas.

### 2.2 Coluna 2 — Centro em abas

**Regra de abertura:** `conversationId` existe → abre em **Conversa**. Não existe →
abre em **Roteiro**. O estado do lead decide, não uma preferência a configurar.

**Chaveamento automático (decisão 1):** clicar em "Ligar" na ficha muda para **Roteiro**.
O SDR está prestes a falar, e o que ele precisa é o texto — não a thread.

**Aba Conversa**
- Thread com todos os canais na mesma linha do tempo
- Campo de escrita, seletor de canal (WhatsApp/E-mail) e seletor de **modelo aprovado**
- Escolher um modelo preenche o texto para o SDR **ajustar antes de enviar** — nunca
  envia direto
- Sem conversa ainda: estado vazio com botão "Iniciar conversa", que cria a thread

**Aba Roteiro** — o que a tela tem hoje, sem mudança.

### 2.3 Coluna 3 — Lead

- **Identidade** — o que já tem
- **Score com lápis** — clicar abre um seletor de 0 a 100 (decisão 5)
- **Qualificação** — três caixas + observação, salvando ao sair do campo
- **Já recebeu** — campanhas que bateram neste contato (`GET /contacts/:id/campaigns`,
  rota pronta e sem tela)
- **Histórico** — o que já tem

### 2.4 Barra de ações

Ganha **📅 Marcar reunião**, que abre o diálogo de agendamento — e, ao confirmar,
executa o handoff (decisão 3).

---

## 3. Ordem de implementação

Cada fase entrega algo utilizável sozinho.

| Fase | O que entra | Esforço |
|---|---|---|
| **1** | Score, `conversationId` e identidade no payload da fila; termômetro na fila e na ficha; score editável | Baixo |
| **2** | Qualificação: migração, rota, painel na coluna 3 | Médio |
| **3** | Aba Conversa: filtro por contato, thread, envio, seletor de modelo (com o 403 resolvido) | **Alto** |
| **4** | Marcar reunião com handoff; "já recebeu"; cadência na fila | Baixo |

A fase 3 concentra o risco: é onde a tela deixa de ser consulta e passa a **agir sobre
a conversa**. Fazê-la por último deixa as três anteriores validadas em produção antes.

---

## 4. O que NÃO entra

- **Lia rascunhando resposta na thread** — a operação é manual por decisão. A
  infraestrutura de rascunho existe (`humanTakeoverAt`), e ligar isso depois é pequeno.
- **Cadência automática por SDR** — sem a Lia, quem decide o próximo toque é ele.
- **Qualificação alimentando o score sozinha** — marcar "decisor" não mexe no número.
  Misturar o julgamento humano com o cálculo tira a chance de comparar os dois depois.

---

## 5. Pendente de veredito

**A cadência automática deve pausar quando o SDR registra atividade?**

Sem isso, a operação não é manual de ponta a ponta: o robô fala por cima do vendedor.
A mudança é pequena — chamar `followup.stop()` no `registrarAtividade()` do
`SdrService`, do mesmo jeito que a resposta do lead já para.

Se a resposta for sim, entra na **fase 1**.
