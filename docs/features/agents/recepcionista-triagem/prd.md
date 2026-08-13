---
tags:
  - prd
  - feature
status: draft
---

# PRD — Lia recepcionista: triagem de campanha e passagem ao SDR

| Campo | Valor |
|------|-------|
| **Status** | Rascunho — aprovado para implementar, sem data |
| **Data** | 2026-08-13 |
| **Dono** | Abel |
| **Domínio** | agents |

## Problema

A operação virou central de ligações: a Lia toca em escala, o SDR liga. O recurso
escasso é hora de SDR — dezenas de ligações por dia contra uma lista de milhares.

Hoje a Lia responde toda mensagem com o comportamento de vendedora consultiva: sete
estágios, biblioteca de objeções, proposta de valor. Para quem apenas respondeu um
disparo, isso é conversa demais antes do telefone — e num modelo de central,
**o chat é sala de espera, não destino**.

O inverso também dói: quem chegou sozinho vem com pergunta pronta e não pode ouvir
"aguarde a ligação".

## Objetivo & métricas de sucesso

- **Objetivo:** entregar ao SDR uma fila de leads triados, com horário combinado,
  gastando o mínimo de conversa em quem respondeu por educação — sem descartar quem
  chegou perguntando.
- **Como medimos** (já existe em `GET /metrics/funnel`):
  - `taxaPositivacao` — meta ≥ 40% (doc de prospecção do TMS)
  - `demonstracoesAgendadas` — o KPI do funil desde o reposicionamento
  - `taxaDemoPorPositivado`
  - **novo:** % de leads triados que chegam ao SDR **com horário combinado**

## Escopo

### Dentro do escopo
- Roteamento entre os modos recepcionista e conversa
- Prompt próprio e curto do modo recepcionista
- Roteiros por origem (WhatsApp, e-mail, site, rede social)
- Tratamento de fora de perfil (1 a 3 veículos)

### Fora do escopo
- **Camada 2 da fila do SDR** (quentes recém-triados). Explicitamente adiada por Abel
  em 13/08/2026: "ainda não comece a codar a fila". A ordenação atual
  (`retorno_hoje` → `nunca_tocado` → `em_andamento`) segue valendo.
- Conexão com Instagram e Facebook (ManyChat) — adiada na mesma conversa.
- Cotação de rota pela Lia — depende do endpoint `/nexa/quote` no TMS (ADR 031).

## Requisitos

- **R1 — Modo pela direção da primeira mensagem.** `outbound` primeiro → recepcionista;
  `inbound` primeiro → conversa. Consulta ao banco, sem IA (ADR 038 D1).
- **R2 — Recepcionista faz UMA pergunta:** o melhor horário para a ligação. Nunca duas.
  Qualificar é bônus, marcar é o produto (ADR 038 D4).
- **R3 — Nunca prometer prazo.** Proibido "em alguns minutinhos", "em 5 minutos".
  Vale a frase-modelo já existente: um especialista assume, sem relógio.
- **R4 — Não pedir dado que já temos.** No WhatsApp o número já é conhecido: pedir
  soa robótico. No e-mail, aí sim, pedir telefone e horário.
- **R5 — Nunca falar preço**, nos dois modos. A trava determinística
  (`preco_em_venda` no `output-guard`) continua valendo.
- **R6 — Promoção de modo.** Se, em modo recepcionista, o lead fizer pergunta real de
  produto, a conversa **promove para o modo conversa** e não volta atrás. Sem isso a
  recepcionista trava numa dúvida legítima. O sinal de promoção deve ser
  determinístico ou vir do `intent` do roteador — nunca uma segunda chamada de IA só
  para decidir o modo.
- **R7 — Fora de perfil não entra na fila.** 1 a 3 veículos: atende, indica a
  calculadora pública, registra o segmento, não escala.
- **R8 — Rede social entra com peso menor.** Curtida ou comentário genérico não é
  intenção comparável a uma resposta de WhatsApp; exige uma pergunta de aquecimento
  antes de virar item de fila.

## Fluxos / UX

```
Mensagem chega
   └── Quem falou primeiro na conversa?
        ├── nós  → RECEPCIONISTA → passa ao SDR
        └── ele  → CONVERSA      → passa ao SDR quando esquentar
                                     │
                              Fila do SDR (já existe)
                              1. agendados do dia
                              2. quentes recém-triados   ← fora do escopo
                              3. cadência normal
```

### Roteiros do modo recepcionista

Textos aprovados por Abel em 13/08/2026. Curtos, sem emoji, sem markdown — regra do
canal (WhatsApp não renderiza).

**Respondeu no WhatsApp** (já temos o número):
> Oi, [nome]! Que bom que respondeu.
> Vou passar você pro [SDR], nosso especialista — ele conhece a fundo a parte de
> precificação e cotação.
> Qual o melhor horário pra ele te ligar hoje?

**Respondeu por e-mail** (não temos telefone):
> Oi, [nome]! Recebi sua resposta, obrigada.
> Nosso especialista pode te explicar melhor numa ligação rápida.
> Me passa o melhor número e horário pra ele te chamar?

**Veio do site, com dados preenchidos:**
> [saudação], [nome]! Recebi seus dados aqui — [empresa], certo?
> O [SDR] vai te ligar pra entender sua operação e te mostrar como fica a cotação das
> suas rotas.
> Qual o melhor horário hoje?

**Interação de rede social** (mais frio — aquece antes de escalar):
> Oi! Vi seu comentário lá no post.
> Você trabalha com transporte? Pergunto porque o que a gente faz é ajudar
> transportadora a precificar frete.

**Fora de perfil (1 a 3 veículos):**
> Que bom te conhecer! Pra quem roda por conta própria, o que mais ajuda é nossa
> calculadora aberta — ela mostra o piso mínimo da ANTT e o custo estimado de qualquer
> rota. Fica à vontade pra usar: [link]
> Se a operação crescer, me chama.

### O que a recepcionista NUNCA faz

| Não faz | Por quê |
|---|---|
| Falar preço | Reposicionamento de agosto/2026 |
| Prometer "em X minutos" | O sistema não cumpre — um SDR em ligação |
| Perguntar mais de uma coisa | Vira formulário |
| Cotar ou tratar objeção | Não é o papel; isso é do modo conversa |
| Pedir número já estando no WhatsApp | Soa robótico |

## Modelo de dados / API

**Nenhuma coluna nova.** Tudo que o roteamento precisa já existe:

| Dado | Onde | Uso |
|---|---|---|
| Direção da 1ª mensagem | `ai_messages.direction` | decide o modo (R1) |
| Intenção do lead | `ai_messages.intent` | promoção de modo (R6) |
| Ação encaminhada | `ai_messages.metadata.suggestedAction` | métrica de agendamento |
| Nome do vendedor | `sellers.name` | preencher `[SDR]` no roteiro |

O roteiro da recepcionista deve ser **texto fixo verificável** (`isKnownScript` em
`conversation-agent.service.ts`), não geração livre: literal nosso não precisa de
auditoria da Supervisora e não pode alucinar. Roteiro novo entra no catálogo — texto
marcado como roteirizado que não bate com o catálogo cai no aceno seguro e é logado.

## IA / Autonomia

- **Modo recepcionista:** prompt próprio e curto. Sem biblioteca de objeções, sem
  posicionamento, sem estágios de venda — economia relevante no caminho de maior volume.
- **Modo conversa:** agente de vendas atual, sem alteração.
- **Escalação:** os gatilhos atuais continuam (preço, pedido de demonstração, frota
  acima de 20, duas mensagens sem resposta). No modo recepcionista a escalação é a
  regra, não a exceção.
- **Travas determinísticas inalteradas:** `output-guard` (preço, conselho fiscal,
  prazo, recurso não confirmado), cerca de conteúdo não confiável, kill switch.

## Riscos & dependências

| Risco | Mitigação |
|---|---|
| Recepcionista trava numa dúvida legítima | R6 — promoção de modo |
| Conversa de campanha longa demais mesmo assim | O anti-loop (3 perguntas) já escala |
| Nome do SDR errado no roteiro | Vem de `sellers`, não do prompt |
| Fila enche de interação social rasa | R8 — peso menor e pergunta de aquecimento |
| Roteiro fixo divergir do catálogo | `isKnownScript` derruba para o aceno seguro e loga |

**Dependências:** nenhuma externa. A camada 2 da fila e o ManyChat são posteriores e
não bloqueiam este PRD.

## Decisão em aberto

**Nenhuma para começar.** Abel aprovou o modelo B (dois modos) e os roteiros em
13/08/2026. A ordem de implementação combinada é: (1) roteamento, (2) recepcionista,
(3) camada 2 da fila — o item 3 só depois de liberação explícita.
