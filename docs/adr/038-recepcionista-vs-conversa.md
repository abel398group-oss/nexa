---
tags:
  - adr
status: accepted
---

# ADR 038 — Recepcionista ou conversa: a Lia decide pela direção da primeira mensagem

| Campo | Valor |
|------|-------|
| **Status** | Aceito |
| **Data** | 2026-08-13 |
| **Autores** | Abel · Claude |
| **Versão** | 1.0 |
| **Escopo** | `apps/backend` (agents) |
| **Dependências** | ADR 003 (roteador) · ADR 012 (política de ação) · ADR 037 (mercados) |

## Contexto

A Nexa deixou de ser "um sistema que vende o HiperTMS" e virou **operação de vendas
com central de ligações**: a Lia faz o toque em escala, o SDR (humano) liga. O
recurso escasso passou a ser **hora de SDR**, não lead — um SDR faz dezenas de
ligações por dia contra uma lista de milhares.

Nesse arranjo a Lia foi redefinida: ela não fecha venda, ela mantém a agenda do SDR
cheia de gente que vale ligar. Ver a ADR 037 para o modelo de mercados, que é o que
permite a mesma máquina atender produtos diferentes (TMS, pneus).

A questão que este ADR resolve é **quanto** a Lia conversa antes de passar o bastão.
E ela não tem resposta única, porque existem dois leads com origens opostas:

- **Nós procuramos ele.** Respondeu um disparo. Não estava pensando no assunto hoje;
  respondeu por curiosidade ou educação. Segurar esse lead em conversa longa não
  agrega — ele não veio com pergunta.
- **Ele procurou a gente.** Anúncio, busca, indicação. **Chega com pergunta pronta**
  ("vocês emitem CT-e?", "dá pra usar junto com o meu sistema?"). Responder "vou passar
  pro especialista te ligar" deixa ele com a pergunta na mão — e ele pergunta ao
  concorrente enquanto espera.

Tratar os dois igual erra nas duas pontas: ou se gasta conversa com quem só foi
educado, ou se descarta o inbound espontâneo, que é minoria em volume e maioria em
valor.

## Decisão

- **D1 — O discriminador é a direção da PRIMEIRA mensagem da conversa.** Se a primeira
  é `outbound`, nós iniciamos: é campanha. Se é `inbound`, ele chegou sozinho. É um
  fato do banco, não uma inferência.
- **D2 — Campanha → modo RECEPCIONISTA.** Saúda, classifica a intenção, pergunta o
  melhor horário e passa o bastão. Não cota, não trata objeção, não fala preço.
- **D3 — Inbound espontâneo → modo CONVERSA.** É o comportamento de vendas atual
  (matriz de qualificação, biblioteca de objeções, oferta de cotar rota), com os
  mesmos gatilhos de escalação já em vigor.
- **D4 — A pergunta da recepcionista é o HORÁRIO, não a qualificação.** A fila do SDR
  já privilegia compromisso acima de tudo (`sdr-queue.ts`): perguntar "qual o melhor
  horário?" transforma um lead quente em **agendado**, que é o topo absoluto da fila.
  Qualificar é bônus; marcar é o produto.
- **D5 — A recepcionista não promete prazo.** Nada de "em alguns minutinhos". Com um
  SDR em ligação, minutos viram uma hora e o lead lembra. Ver a regra já existente em
  `sales-agent.service.ts` e o teste que a prende.
- **D6 — Operação de 1 a 3 veículos não entra na fila**, nos dois modos. Atende bem,
  indica a calculadora pública, registra e encerra (fora do ICP desde o
  reposicionamento de agosto/2026).

## Alternativas consideradas

- **A1 — Recepcionista para todos.** (rejeitada) Simples e previsível, mas queima o
  inbound espontâneo, que é o lead mais quente que a operação recebe. O custo cai
  justamente sobre quem já estava decidido a resolver o problema.
- **A2 — Conversa para todos** (o comportamento de hoje). (rejeitada) Gasta contexto e
  tempo com quem respondeu por educação, e — pior num modelo de central de ligações —
  **segura o lead no chat em vez de levá-lo ao telefone**. Aqui o chat é sala de
  espera, não destino.
- **A3 — Deixar a IA decidir o modo.** (rejeitada) Acrescenta uma chamada e um ponto de
  erro para uma pergunta que o banco responde com certeza. Coisa determinística não é
  convencida por conversa.
- **A4 — Decidir pelo canal** (WhatsApp = campanha, site = inbound). (rejeitada) O
  mesmo canal recebe os dois: um lead pode achar o número do WhatsApp sozinho.

## Consequências

- **(+) Positivas:**
  - O modo sai de graça e sem erro — nenhuma chamada de IA a mais.
  - O anti-loop (escalar após 3 perguntas), que atrapalharia a cotação, vira
    *funcionalidade* no modo recepcionista.
  - A recepcionista usa um prompt curto: sem biblioteca de objeções nem posicionamento,
    o que reduz tokens de forma relevante no caminho de maior volume.
- **(−) Negativas / trade-offs:**
  - Dois comportamentos para manter e testar em vez de um.
  - Uma conversa de campanha que evolui (o lead começa a perguntar de verdade) fica
    presa no modo recepcionista até alguém decidir promovê-la. Ver R6 no PRD.
- **Impacto em migração / dados:** nenhum. Não há coluna nova; a direção da primeira
  mensagem já existe em `ai_messages`.

## Referências

- `docs/features/agents/recepcionista-triagem/prd.md` — requisitos e fluxos
- `apps/backend/src/application/telemarketing/sdr-queue.ts` — a fila que D4 explora
- `apps/backend/src/application/agents/sales-agent.service.ts` — modo conversa
- ADR 034 (canal único do vendedor) · ADR 035 (takeover) · ADR 037 (mercados)

## Histórico de revisões

| Versão | Data | Alteração | Autor |
|--------|------|-----------|-------|
| 1.0 | 2026-08-13 | Criação | Abel · Claude |
