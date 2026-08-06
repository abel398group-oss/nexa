# Auditoria do módulo de Suporte — Nexa

**Data:** 2026-08-05 · **Fechada em:** 2026-08-05
**Escopo:** fluxo de suporte ponta a ponta — widget no TMS → Lia → ticket → time humano
**Método:** leitura do código em `apps/backend/src`, comparado com a intenção declarada pelo dono

> Cada achado cita `arquivo:linha`. Nada aqui é hipótese: tudo foi confirmado no código.

## O fluxo pretendido (declarado pelo Abel)

Em **vendas** o TMS é um parceiro. Em **suporte e alertas** a relação se inverte: o
Nexa é um **complemento do TMS**. O fluxo:

```
cliente abre o chat DENTRO do TMS → Lia tenta resolver → não consegue
  → vira ticket → time humano atende (segunda a sexta)
```

A Lia responde 24/7; o humano é de segunda a sexta. **Isso já estava certo no
código** — não havia trava de horário na Lia, e não deveria haver mesmo.

## Status final

| | |
|---|---|
| Achados | 6 |
| **Resolvidos** | **6** |
| Testes | 984 → 1016 |

### Placar

| # | Achado | Risco | Status |
|---|---|---|---|
| S-01 | SLA nunca aplicado — chaves de prioridade em idioma diferente | 🔴 | ✅ |
| S-02 | Cliente do widget/portal nunca sabia que foi escalado | 🔴 | ✅ |
| S-03 | TMS fora do ar não chegava na resposta ao cliente | 🔴 | ✅ |
| S-04 | Lia atendia sem saber o plano do cliente | 🟡 | ✅ |
| S-05 | Resposta final podia pedir CNPJ a quem já veio autenticado | 🟡 | ✅ |
| S-06 | Nada no suporte sabia que horas eram | 🟡 | ✅ |

---

## S-01 — SLA nunca foi aplicado

`conversation-janitor.service.ts:38-43` definia os prazos com as chaves
`urgente / alta / normal / baixa`. Mas quem grava `ticketPriority` é o
classificador, em inglês: `critical / high / medium / low`
(`case-classifier-agent.service.ts:20`).

**Nenhuma chave batia.** `slaHours()` caía no default para 100% dos tickets
classificados pela IA: um chamado **crítico** era alertado no mesmo relógio de
8 horas de um chamado **baixo**.

**Resolvido:** chaves passam a ser as que o classificador realmente escreve. Os
nomes em português ficam como *alias* porque o formulário do portal grava
`'normal'` (`portal-tickets.service.ts:142-143`).

**Lição:** dois vocabulários para a mesma coisa, em pontos diferentes do
sistema, falham em silêncio — nada quebra, o valor só nunca é encontrado.

## S-02 — O cliente do chat nunca sabia que foi escalado

O aviso saía por `waha.sendText(conv.phone, …)`. Mas:

- conversa do widget → `phone` é o **externalId do TMS** (`conversations.service.ts:357`)
- ticket do portal → `phone` vem como **`portal:<externalId>`** (`portal-tickets.service.ts:263`)

Ou seja: tentava mandar WhatsApp para uma string que não é telefone, a falha era
engolida no `catch`, e **justamente o canal que É o suporte oficial era onde o
cliente nunca era avisado** de que um humano tinha sido chamado.

**Resolvido:** passa por `conversations.addMessage()`, que já roteia por canal
(WebSocket para `web_chat`/`portal`, WAHA para WhatsApp) e ainda deixa o aviso
registrado na thread.

## S-03 — TMS fora do ar não chegava ao cliente

Correção parcial feita horas antes, na mesma data: o disjuntor passou a marcar
`tmsIndisponivel` no diagnóstico. Só que o flag morava dentro de
`diagnosticData`, e o `ResolutionAgent` — quem de fato escreve o texto que o
cliente lê — consome apenas `rootCause` e `suggestedAction`
(`resolution-agent.service.ts:46-51`).

Resultado: com o TMS fora, o caso virava "não resolvido" e escalava como um
problema qualquer. O cliente podia concluir que **o documento ou contrato dele
não existe**.

**Resolvido:** `tmsUnstable` virou campo de primeira classe em
`DiagnosticResult`, preenchido pelo código (nunca pelo modelo — é fato observado
no disjuntor, não opinião da IA). O prompt da resolução e o fallback offline
agora dizem que houve instabilidade momentânea e pedem para tentar em minutos.

**Lição:** meia correção que não chega na saída é correção que não existe.

## S-04 — Lia atendia sem saber o plano

O token do TMS carrega apenas `externalId, tenantId, nome, página, errorCode,
isManager` (`handoff.service.ts:45-64`) — **não carrega o plano**. Mas o prompt
do diagnóstico usa plano (`diagnostic-agent.service.ts:82`), então todo cliente
do widget era atendido como `plano: desconhecido`.

**Resolvido sem mexer no contrato do token:** o contrato do cliente já era lido
logo acima (`getContractStatus`) e traz o plano. Passou a ser usado como
fallback — zero chamada a mais, zero mudança no lado do TMS.

## S-05 — A resposta final podia pedir CNPJ

A regra anti-identidade (LGPD + antifraude) existia só no agente de
**diagnóstico** (`diagnostic-agent.service.ts:108-117`). O agente que escreve o
texto que o cliente lê não tinha nenhuma.

**Resolvido:** regra equivalente no prompt do `ResolutionAgent`, com o porquê
explícito — quem está falando já veio autenticado do sistema, então perguntar
quem é não só irrita como é vetor de fraude.

## S-06 — O suporte não sabia que horas eram

Não existia **nenhuma** verificação de horário no caminho do suporte. Duas
consequências:

1. Escalar às 2h de um sábado dizia *"em breve alguém entrará em contato"*. "Em
   breve" eram 54 horas. O cliente ficava atualizando o chat.
2. O relógio do SLA corria a noite e o fim de semana inteiros. Um crítico (SLA
   1h) aberto no sábado estourava no próprio sábado, e o time chegava na segunda
   com violação que **nunca teve como cumprir**.

**Resolvido:** `application/conversations/support-hours.ts` — funções puras
(mesma forma de `sender-health.ts`), fuso UTC-3 fixo (o Brasil não tem horário
de verão desde 2019, e ler o TZ do processo daria resultado diferente em
produção e na máquina do dev). A mensagem passa a dizer a janela real e quando o
time volta; o SLA conta só horário útil.

**Feriado NÃO é tratado**, de propósito: exigiria calendário nacional +
municipal, e o custo de errar é um alerta a mais num feriado.

Configurável por `SUPPORT_START_HOUR` / `SUPPORT_END_HOUR` (padrão 8h-18h — o
que a própria KB da Lia já informava ao cliente).

---

## O que está bem feito (para não mexer)

- **Identidade do widget.** Token de 15 min gerado server-to-server, nenhum
  segredo no navegador, fail-closed em produção (`handoff.service.ts:22-43`).
- **A decisão de escalar é determinística, não da IA.**
  `escalation-agent.service.ts` é uma matriz de regras — a IA não decide quando
  desistir.
- **Numeração de ticket atômica** (`INSERT … ON CONFLICT`,
  `support-agent.service.ts:285-292`) — sem corrida entre réplicas.
- **Portal mostra ao cliente** status, categoria, causa-raiz, histórico e CSAT.

## O que fica em aberto

| Item | Por quê |
|---|---|
| ~~Ticket vive só no Nexa, nada é enviado ao TMS~~ | **Fechado em 2026-08-05.** Decisão do Abel: suporte continua atendido no Nexa; o TMS recebe o histórico via webhook (`TicketSyncService`). Ver `docs/features/tms-native-support/especificacao-sync-ticket-tms.md`. |
| Sem limite de tentativas próprio do suporte | A única trava de loop é a de vendas (`MAX_AI_QUESTIONS`), que exige 3 mensagens seguidas terminando em "?" e usa `leadScore` — que no suporte não significa nada. |
| `ticketNumber` gerado e nunca exibido ao cliente | Cosmético. |
| Formulário do portal grava `categoria: 'outro'` e `prioridade: 'normal'` | Valores que não existem nos enums do classificador. Não quebra nada hoje (o SLA aceita `normal` como alias), mas é vocabulário divergente — mesma classe de problema do S-01. |
| Feriados no cálculo de horário útil | Ver S-06. |
| Escalação de ticket avisa só e-mail + sino, sem WhatsApp | Time hoje (2026-08-06) são 3 pessoas (Abel, Uelder, Mateus) fazendo vendas E suporte — já cadastrados como `Seller`. Ideia: reaproveitar o mesmo aviso de WhatsApp que já existe pro lead quente (`Seller.outOfOffice`, ADR 034) também na escalação de suporte, em vez de criar um conceito novo de "atendente de suporte". Não é feature nova — é ligar um fio que já existe num caminho que não o usa hoje. Adiado por decisão do Abel: documentar agora, implementar quando fizer sentido. |

## Nota de método

O S-03 é o achado mais desconfortável desta auditoria: a correção original foi
feita **no mesmo dia, por mim**, e eu parei no meio do caminho — o flag existia,
tinha teste, e não chegava ao cliente. Teste verde provando que o dado foi
gravado não prova que ele foi *usado*. Fica registrado de propósito.

## Relacionados

- ADR 015 (arquitetura), 016 (classificação), 017 (playbooks), 018 (KB),
  019 (ticket intelligence), 027 (web chat) — todos tiveram o status corrigido
  de "Proposto" para "Aceito (implementado)" nesta auditoria.
- `docs/reviews/2026-08-04-auditoria-arquitetura-seguranca.md` — auditoria
  equivalente do lado comercial.
