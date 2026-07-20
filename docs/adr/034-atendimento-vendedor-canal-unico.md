---
tags:
  - adr
status: accepted
---

# ADR 034 — Atendimento do vendedor: canal único controlado pelo Nexa

| Campo | Valor |
|------|-------|
| **Status** | Aceito |
| **Data** | 2026-07-20 |
| **Autores** | Abel + squad Nexa |
| **Versão** | 1.0 |
| **Escopo** | `apps/backend` (sellers, whatsapp, conversations) + `apps/frontend` (inbox) |
| **Dependências** | Gate de números internos (pré-requisito, a implementar) |

## Contexto

Lead qualificado pela Lia é atribuído a um vendedor (handoff round-robin,
`sellers.service.ts`). O vendedor precisa atender tanto no PC (inbox Nexa)
quanto na rua. Hoje a notificação de handoff diz "Responda pelo WhatsApp ou
pelo Nexa", mas responder à notificação NÃO fala com o cliente — a resposta cai
no número do Nexa e o vendedor vira lead da Lia (conflito mapeado no brainstorm
de 20/07/2026). Também foi cogitado o vendedor continuar a conversa pelo
WhatsApp pessoal dele.

**Princípio decidido: a conversa com o lead mora sempre em um número que o
Nexa controla.** Se mora, há histórico, métricas, follow-up coordenado e Lia
silenciada na hora certa. Se não mora, o sistema fica cego e os conflitos de
mensagem voltam (Lia re-engajando lead em plena negociação, thread duplicada,
carteira no celular pessoal do vendedor).

## Decisão

- **D1 — Canal único:** a conversa com o lead acontece exclusivamente pelo
  número da empresa conectado ao Nexa. WhatsApp pessoal do vendedor NUNCA é
  canal de atendimento.
- **D2 — Botão "Estou fora" por vendedor (portal Nexa):** desligado → notifica
  só no portal (sino/badge); ligado → notifica também no WhatsApp do vendedor.
- **D3 — Link direto na notificação:** a mensagem de handoff no WhatsApp do
  vendedor leva um deep link para a conversa no inbox; na rua ele atende pelo
  navegador do celular. Texto atual "Responda pelo WhatsApp" será corrigido.
- **D4 — Sem segundo número por enquanto:** um único número WAHA. Novos números
  só serão reavaliados na migração para a API oficial da Meta.
- **D5 — Histórico permanece 100% no Nexa** (consequência de D1-D4).

## Alternativas consideradas

- **A1 — Vendedor atende pelo WhatsApp pessoal** (rejeitada): lead recebe
  mensagem de número desconhecido no auge do interesse; Nexa fica cego e o
  follow-up da Lia atropela a negociação; carteira e histórico ficam no
  celular pessoal; duas threads paralelas com o mesmo lead.
- **A2 — Relay (Nexa como ponte)** (adiada, não rejeitada): vendedor responde a
  própria notificação e o Nexa encaminha ao lead (e vice-versa), Lia muda.
  Melhor UX de rua sem perder histórico, mas exige takeover por conversa e
  regra de desambiguação p/ vendedor com 2+ leads ativos. **Fica como evolução
  se o deep link (D3) mostrar atrito real.**
- **A3 — Chip corporativo nas mãos do vendedor, conectado ao Nexa** (futuro):
  viável, mas no WAHA cada número = uma sessão extra p/ manter, e mensagens
  enviadas pelo app chegam como `fromMe` — hoje descartadas
  (`whatsapp.service.ts`, precisaria passar a gravá-las). Reavaliar na API
  oficial (números adicionais na WABA são triviais e o modo coexistência
  permite app + API no mesmo número).

## Consequências / próximos passos

1. **Gate de números internos** (pré-requisito): inbound de telefone de
   `Seller` ou contato do Monitor não vira contato/lead nem aciona a Lia —
   descarte logado. Cobre também o canal de alertas "só saída".
2. Botão "Estou fora" (campo no Seller + toggle no portal).
3. Deep link na notificação de handoff + correção do texto.
4. Garantir inbox utilizável em navegador mobile.
5. Takeover por conversa (humano assume → Lia silencia) — necessário para D3
   funcionar sem a Lia responder por cima do vendedor.
