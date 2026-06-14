# ADR 026 — Suporte é pós-venda: prospect que pede suporte é orientado a se cadastrar

**Status:** Aceito (implementado) · **Data:** 2026-06

> Registra a decisão de roteamento entre a Lia de **vendas** e a Lia de **suporte**
> quando ambas operam no **mesmo número de WhatsApp**, e como o sistema trata a
> transição lead → cliente.

## Contexto

O Nexa usa **um único número de WhatsApp** para vender (prospecção) e para dar
suporte (pós-venda). Os agentes são módulos separados (`sales-agent` e
`support-agent`), coordenados pelo `conversation-agent` via `router-agent`
(ver ADR 003). A jornada real é: a gente dispara para **leads** → parte vira
**cliente** → cliente passa a ter direito a **suporte**.

O problema: como decidir, mensagem a mensagem, se quem está falando é um
**prospect** (deve ser conduzido pela venda) ou um **cliente** (deve receber
suporte) — sem número separado e sem marcação manual? E o que fazer quando um
**prospect** pede suporte antes de virar cliente?

## Decisão

1. **A fonte de verdade de "cliente vs prospect" é o lookup no TMS** (`TmsLookupService`,
   leitura read-only da base do HiperTMS por telefone — ADR 024). O lookup roda
   tanto na rota `sales` quanto na `support`:
   - telefone **encontrado no TMS** → é cliente → rota **suporte** (+ identidade do TMS);
   - telefone **não encontrado** → é prospect.
2. **Suporte é pós-venda.** Um **prospect** roteado para suporte **não** é atendido
   pelo `support-agent`. A Lia (voz de vendas) responde com uma **orientação de
   cadastro**, usando o `signupUrl` configurado no **Playbook**:
   > "Pra usar nosso suporte é só ter uma conta — leva 2 minutos: {signupUrl}.
   > Depois disso você tem o chat de suporte direto por aqui. Quer que eu te ajude a começar?"
3. **Pré-venda continua em vendas.** Dúvidas tipo "funciona com X?", "emite CT-e?"
   são objeção de venda — o `router`/`sales-agent` tratam vendendo, **não** caem na
   orientação de cadastro. A orientação só dispara quando o roteamento resulta em
   **suporte** para um **não-cliente** (suporte de verdade / pedido explícito de suporte).
4. **A transição lead → cliente é automática.** No instante em que o lead se cadastra
   (o telefone passa a existir na base do TMS), a **próxima mensagem** já é roteada
   para suporte. Sem número novo, sem tag manual.
5. **Clientes vindos do painel do TMS** (marcador `[via-painel-tms]` ou token de
   handoff — ADR 022) são tratados como clientes e **vão direto para suporte**,
   sem orientação de cadastro.

## Consequências

- Um número só atende as duas operações; a "personalidade" da Lia troca sozinha
  conforme o telefone seja cliente ou não.
- **Dependência crítica:** `TMS_DB_URL` precisa estar configurado em produção. Sem
  ele, o lookup volta vazio e **todo mundo é tratado como prospect** — inclusive
  clientes, que receberiam a orientação de cadastro indevidamente. Documentar em
  `secrets-management.md` / deploy.
- O `signupUrl` é configurável por tenant na tela de **Playbook** (`sales_playbook`).
  Se estiver vazio, a Lia usa um texto genérico ("crie sua conta") sem link.
- Risco residual: erro de classificação do `router` (objeção de venda marcada como
  suporte) poderia disparar a orientação de cadastro fora de hora. Mitigado por
  manter **vendas como padrão** do prospect; só vira suporte em sinal claro.

## Implementação

- `apps/backend/src/application/agents/conversation-agent.service.ts`:
  - lookup do TMS roda para `sales` **e** `support` (popula `tmsCustomer`);
  - no `case 'support'`: se `!tmsCustomer && !hasPanel && !handoffContext` →
    resposta com `signupUrl` (lido de `prisma.salesPlaybook`), `scripted = true`.
- Texto e link são ajustáveis (Playbook). Sem mudança de schema.

## Referências

- ADR 003 — Agentes (router/sales/support) · ADR 022 — Botão TMS → Lia (handoff)
- ADR 024 — Filtro TMS em campanhas (mesmo `TmsLookupService`)
- `docs/ai/ai-agents.md` · `docs/security/secrets-management.md` (`TMS_DB_URL`)
