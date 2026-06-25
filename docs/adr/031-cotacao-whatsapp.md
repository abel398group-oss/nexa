# ADR-031 — Cotação de Frete via WhatsApp

**Data:** 2026-06-25  
**Status:** Aceito  
**Princípio:** `docs/principles/proatividade.md`

---

## Princípio norteador

> O cliente recebe o valor do frete antes de precisar ligar.
> A Lia cota em segundos, 24h por dia.

---

## Contexto

O TMS já tem um motor de cálculo completo:
- `POST /api/public/calc/dedicated` — frete dedicado (FCL), público, sem auth
- `POST /api/public/calc/fractional` — frete fracionado (LCL), público, sem auth
- `TariffEngineService` — motor real com tabela do tenant, usado internamente

A calculadora pública já existe e é usada no site de marketing do HiperTMS.
O Nexa pode reutilizá-la diretamente para prospects (Modo 1).

Para clientes com conta (Modo 2), um novo endpoint `POST /nexa/calc/quote` expõe
o `TariffEngineService` com contexto de tenant via `InternalTokenGuard`.

---

## Decisão

Dois modos de cotação, diferenciados pelo `lookupByPhone`:

| Modo | Quem é | Endpoint | Pricing |
|---|---|---|---|
| Público | Prospect (sem conta TMS) | `POST /public/calc/dedicated` ou `fractional` | Estimativa de mercado (tenant marketing) |
| Personalizado | Cliente com conta | `POST /nexa/calc/quote` | Tabela real do tenant |

A conversa é gerenciada por `QuoteConversationService` (máquina de estados por telefone,
TTL 10 minutos, persistência em Redis em produção).

Toda cotação é persistida em `NexaQuoteState` para histórico e follow-up proativo em 24h.

---

## Por que não usar apenas a calculadora pública para todos?

A calculadora pública usa um "tenant de marketing" com margem padrão.
Um cliente existente tem sua própria tabela de preços negociada — preço diferente.
Usar a pública para clientes existentes geraria inconsistência entre a cotação no WhatsApp
e a cotação formal no TMS.

---

## Alternativas rejeitadas

**A — Lia abre cotação formal no TMS (`POST /logistic-quotes`)**  
Requer tenant auth e cria um registro permanente no TMS antes do cliente confirmar interesse.
Rejeitado: polui o banco com cotações incompletas e mistura suporte com vendas.

**B — Motor de NLP externo para extrair dados da mensagem (Wit.ai, Dialogflow)**  
Adiciona dependência externa desnecessária. A coleta sequencial step-by-step é mais confiável
e já é o padrão do Nexa (mesmo fluxo do suporte guiado).

**C — PDF com cotação enviado via WhatsApp**  
Adiciona complexidade de geração de PDF. Para a fase 1, mensagem de texto é suficiente.
PDF pode ser adicionado na fase 2 via Nexa (skill existente de PDF).

---

## Consequências

- TMS squad: 1 endpoint novo + 1 método em `nexa-external.service.ts` (~50 linhas)
- Nexa squad: `QuoteConversationService` + `QuoteHandler` + `QuoteFormatter` + intents Lia
- Nova tabela `nexa_quote_states` no schema do Nexa
- A calculadora pública do TMS passa a receber requisições do Nexa (monitorar rate limit)
- Follow-up proativo 24h: se cotação não converteu, Lia reengaja automaticamente

---

## Referências

- ADR-010 — Arquitetura de Conectores (HiperTmsConnector)
- ADR-023 — Orquestrador de Envio Único (evita spam)
- `docs/features/cotacao-whatsapp/prd.md` — PRD completo
- `docs/features/cotacao-whatsapp/squad-tms.md` — implementação TMS
- `docs/features/cotacao-whatsapp/squad-nexa.md` — implementação Nexa
