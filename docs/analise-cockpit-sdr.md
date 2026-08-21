# Nexa — Mesa de Trabalho do SDR: análise e proposta de cockpit

> Documento para revisão externa. Analisa a tela atual do SDR, aponta as lacunas
> contra o fluxo real de prospecção, e propõe um layout unificado.
> Estado verificado no código em **20/08/2026**. Tudo conferido na fonte.

---

## 1. O que a tela tem hoje

Arquivo: `apps/frontend/src/pages/SdrWorkbenchPage.tsx` (1.045 linhas).
Layout em três colunas, mais uma barra fixa no rodapé.

```
┌──────────────┬─────────────────────────┬──────────────────┐
│ FILA (20rem) │ ROTEIRO (1.4fr)         │ FICHA (1fr)      │
│              │                         │                  │
│ • Lead A     │ Abertura da ligação     │ Empresa / nome   │
│ • Lead B     │ Abertura do WhatsApp    │ Ligar · Zap · @  │
│ • Lead C     │ Abertura do e-mail      │ E-mail, frota,   │
│              │ Se ele disser… (objeç.) │ mercado, lista   │
│  prioridade  │ ─────────────────────   │ ─────────────    │
│  tentativas  │ Material do mercado     │ HISTÓRICO        │
│  nº listas   │ Material de consulta    │ (10 últimas)     │
└──────────────┴─────────────────────────┴──────────────────┘
┌────────────────────────────────────────────────────────────┐
│ Registrar contato · Não atendeu · Ligar depois ·           │
│ Passar pro closer · Descartar                              │
└────────────────────────────────────────────────────────────┘
```

**Fila** — oportunidades em estágio `new`, escopadas por dono e por mercado. Ordenadas
por prioridade calculada no servidor: prometido para hoje → nunca contatado → em
andamento. Leads do mesmo contato são agrupados numa linha só, com selo de "N listas".

**Roteiro** — o `SalesScript` do mercado, com `{{nome}}`, `{{saudacao}}` e `{{remetente}}`
já preenchidos. Abertura de ligação aberta por padrão; WhatsApp, e-mail e objeções
recolhidos. Abaixo, o material aprovado na Validação de Campanha e uma busca na base de
conhecimento com atraso de 300 ms.

**Ficha** — dados do contato, botões `tel:`, `wa.me` e `mailto:`, e o histórico das
dez últimas atividades.

**Barra de ações** — fixa no rodapé, posição constante para acertar sem olhar. Cada
ação carimba a versão do roteiro que estava na tela.

---

## 2. A lacuna central

**O SDR não consegue enviar nem ler uma mensagem dentro do Nexa.**

Os botões de WhatsApp e e-mail são links `wa.me` e `mailto:` — eles **abrem outro
aplicativo**. A conversa acontece fora, e o Nexa não registra nada dela. O histórico da
tela mostra apenas o que o SDR digitou à mão depois, se digitou.

Isso tem três consequências que se somam:

1. **O contexto se perde.** O que o lead respondeu no WhatsApp não está na tela quando
   o SDR liga de novo três dias depois.
2. **O closer herda um buraco.** Ele recebe a nota do handoff, mas não a conversa.
3. **A medição mente.** "Tentativas" conta o que o SDR registrou, não o que aconteceu.

E o mais relevante para a decisão de investimento: **a infraestrutura para resolver
isso já existe inteira e está em uso em outra tela.**

---

## 3. O que já existe e a tela não usa

Levantamento no código. Todas as rotas sob o prefixo `/api`.

### Conversas — completo, zero uso no SDR

| Recurso | Rota | Situação |
|---|---|---|
| Ler mensagens | `GET /conversations/:id/messages` | Existe · front tem função pronta |
| **Enviar mensagem** | `POST /conversations/:id/messages` | Existe · front tem função pronta |
| Criar conversa para um lead | `POST /conversations` | Existe |
| Linha do tempo | `GET /conversations/:id/timeline` | Existe |
| Devolver para a IA | `POST /conversations/:id/return-to-ai` | Existe |

O envio despacha sozinho pelo canal certo (WhatsApp via WAHA, e-mail via SMTP,
web-chat via WebSocket). E o **takeover humano já é automático**: a primeira mensagem
que um humano envia coloca a Lia em modo rascunho naquela conversa. Não precisa de
botão "assumir" — enviar já assume.

A tela de Inbox usa tudo isso hoje, inclusive atualização ao vivo por WebSocket. A mesa
do SDR não importa nenhuma dessas funções.

### Modelos de mensagem

`GET /message-templates?productCode=&channel=&approved=true` devolve exatamente os
modelos aprovados daquele mercado. Existe também a pré-visualização com o motor real.

**Bloqueio concreto:** o controller inteiro exige a permissão `campaigns`. Um usuário
que só tem `sdr` recebe **403**. Para o SDR usar modelo numa conversa 1:1, é preciso
liberar a leitura para `sdr` — sem dar a ele o poder de editar a biblioteca.

### Estado da cadência

`GET /followups` existe, mas devolve o tenant inteiro sem filtro por contato ou
conversa, e **nenhuma tela do sistema consome**. A informação "este lead está no toque
2, o próximo dispara amanhã às 9h" está no banco e não chega em lugar nenhum.

### Qualificação e score

O `interestScore` é escrito **apenas pela IA** — nada permite um humano defini-lo. E o
payload da fila do SDR **remove o campo**: `ItemDaFila` não traz `interestScore`, nem
`leadStatus`, nem `conversationId`.

Existe um `AiCustomerProfile` com segmento, porte de frota e tom preferido — **sem
nenhuma rota HTTP**. Não existe estrutura de qualificação (BANT ou similar) em lugar
nenhum: o único registro é o texto livre da anotação.

### Agendamento

`meetingAt` e `meetingUrl` existem na oportunidade, mas os dois caminhos que escrevem
estão **presos a uma mudança de papel**: transferir para o closer, ou o closer
remarcando. `PATCH /opportunities/:id` não aceita esses campos.

**O SDR não consegue marcar uma reunião sem entregar o lead.** Se o lead aceita
conversar semana que vem mas ainda precisa de qualificação, não há onde registrar.

### Outros já prontos

- `GET /contacts/:id/campaigns` — quais campanhas já bateram neste lead. Responde
  "ele já recebeu três e-mails meus?" antes da ligação.
- `GET /contacts/:id/tickets` — se o contato já é cliente de outro produto.
- `PATCH /opportunities/:id/partner-consent` e `POST /:id/share-partner` — passar um
  lead fora de perfil para um parceiro em vez de descartar. Rota pronta, sem botão.
- `GET /knowledge/:id` — o artigo completo (a busca do SDR devolve versão reduzida).

---

## 4. Lacunas contra o fluxo real do SDR

| # | Lacuna | Consequência prática |
|---|---|---|
| 1 | **Não envia nem lê mensagem** | A conversa acontece fora do sistema e não é registrada |
| 2 | **Não usa modelo de mensagem** | O SDR reescreve à mão o que já foi aprovado |
| 3 | **Não mostra a cadência** | Ele não sabe em que toque o lead está nem quando dispara o próximo |
| 4 | **Não mostra o score** | O campo existe, é calculado, e some no caminho até a tela |
| 5 | **Não marca reunião sem transferir** | Reunião de qualificação não tem onde ser registrada |
| 6 | **Não captura qualificação estruturada** | Só texto livre — não dá para filtrar nem medir depois |
| 7 | **Não mostra o que o lead já recebeu** | Ele pode ligar para quem recebeu e-mail ontem, sem saber |
| 8 | **Objeções são estáticas** | Estão no roteiro, mas não conectam ao que o lead disse |

---

## 5. Proposta de layout

### O princípio

O SDR **nunca está falando e digitando ao mesmo tempo**. Ou está numa ligação — e aí o
roteiro é o trabalho — ou está respondendo por texto, e aí a conversa é o trabalho.

Hoje o roteiro ocupa o centro e a conversa não existe. Somar uma quarta coluna espremeria
as duas. A proposta é: **o centro alterna entre os dois modos**, e o que muda é o que
está sob a mão, não o que existe na tela.

```
┌────────────┬──────────────────────────────────┬───────────────┐
│ FILA       │  [ Conversa ]  [ Roteiro ]       │ LEAD          │
│            │  ─────────────────────────────   │               │
│ Lead A     │                                  │ Empresa       │
│ ● toque 2  │  ← Lia: Bom dia, aqui é...       │ Contato       │
│ ⏱ amanhã   │  → Lead: manda mais info         │ Score ●●●○○   │
│            │  ← Você: claro, o que...         │ Frota: 40     │
│ Lead B     │                                  │ Veio de: X    │
│ ● nunca    │  ┌────────────────────────────┐  │               │
│            │  │ escreva…      [modelo ▾]   │  │ QUALIFICAÇÃO  │
│ Lead C     │  │            WhatsApp │ Email│  │ □ decisor     │
│ ● toque 1  │  └────────────────────────────┘  │ □ tem TMS     │
│            │                                  │ □ orçamento   │
│            │  ── ou, na aba Roteiro: ──       │               │
│            │  Abertura · Objeções ·           │ JÁ RECEBEU    │
│            │  Material · Base de conhec.      │ • Camp. D2 ✓  │
│            │                                  │ • Camp. D9 ✓  │
│            │                                  │ ───────────── │
│            │                                  │ HISTÓRICO     │
└────────────┴──────────────────────────────────┴───────────────┘
┌──────────────────────────────────────────────────────────────┐
│ Registrar · Não atendeu · Ligar depois · 📅 Marcar reunião · │
│ Passar pro closer · Descartar                                │
└──────────────────────────────────────────────────────────────┘
```

### Coluna 1 — Fila (mantém, ganha cadência)

O que já tem, mais **em que toque o lead está e quando o próximo dispara**. É o que
evita o SDR ligar para alguém que vai receber um follow-up automático em duas horas.

### Coluna 2 — Centro, em duas abas

**Aba Conversa** — a thread real do lead, todos os canais na mesma linha do tempo, com
campo de escrita embaixo. Seletor de canal (WhatsApp/E-mail) e seletor de **modelo
aprovado**, que preenche o texto para o SDR ajustar antes de enviar.

Enviar já assume a conversa (a Lia entra em modo rascunho automaticamente) — o
mecanismo existe e não precisa de botão.

**Aba Roteiro** — o que hoje ocupa o centro, sem mudança: aberturas, objeções, material
aprovado, busca na base.

A aba abre em **Conversa quando já existe conversa**, e em **Roteiro quando é o primeiro
contato**. O estado do lead decide, não uma preferência a configurar.

### Coluna 3 — Lead

**Identidade e score** — o que já tem, mais o `interestScore` que hoje some no caminho.

**Qualificação** — três a cinco caixas de marcar, definidas por vocês (é decisor? já
usa TMS? tem orçamento?). Precisa de campo novo no banco. É o que transforma "achei que
era bom lead" em algo filtrável e mensurável depois.

**Já recebeu** — quais campanhas bateram neste contato. Rota pronta, sem tela.

**Histórico** — o que já tem.

### Barra de ações — um botão a mais

**📅 Marcar reunião**, desacoplado da transferência. Hoje a única forma de registrar
uma reunião é entregando o lead.

---

## 6. O que cada parte custa

| Parte | Esforço | Depende de |
|---|---|---|
| Conversa no centro (ler + enviar) | Médio | Filtro por contato em `GET /conversations` |
| Seletor de modelo | Baixo | Liberar leitura de templates para a permissão `sdr` |
| Cadência na fila | Baixo | Filtro por conversa em `GET /followups` |
| Score na tela | Muito baixo | Só incluir o campo no payload da fila |
| "Já recebeu" | Muito baixo | Rota pronta |
| Marcar reunião | Baixo | Aceitar os campos em `PATCH /opportunities/:id` |
| Qualificação estruturada | Médio | Campo novo no banco + definição do time |

A maior parte é **fiação**, não construção. O item genuinamente novo é a qualificação
estruturada, e ele depende mais de vocês decidirem o que perguntar do que de código.

---

## 7. Perguntas para o revisor

1. A divisão **Conversa | Roteiro** em abas no centro respeita como um SDR realmente
   trabalha, ou os dois precisam estar visíveis ao mesmo tempo?

2. A qualificação em caixas de marcar é suficiente, ou prospecção B2B em transporte
   exige campos abertos? Quais três a cinco perguntas realmente decidem se um lead
   avança?

3. O SDR deveria conseguir **marcar reunião sem transferir**, ou reunião marcada já
   deveria significar handoff automático?

4. Mostrar a **cadência automática** na fila resolve o conflito humano-vs-robô, ou o
   certo seria a cadência **pausar sozinha** quando o SDR registra atividade?

5. O score é escrito só pela IA. O SDR deveria poder corrigir depois de falar com a
   pessoa — que sabe mais que o modelo — ou isso corrompe a medição?
