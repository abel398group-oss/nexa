# ADR 015 — Arquitetura do Módulo de Suporte

**Status:** Proposto · **Data:** 2026-06

## Contexto

O Nexa já atende o fluxo COMERCIAL (lead → qualifica → vende). O próximo módulo é o
SUPORTE: a Lia atende **clientes já existentes** do HiperTMS — não leads. O objetivo é
**resolver sem humano** na maioria dos casos, sem virar "FAQ + chatbot".

A diferença-chave: ao detectar via `lookupCustomer()` que o número é cliente ativo, a IA
NÃO tenta vender — ela diagnostica e resolve a dúvida técnica/operacional.

Reaproveita: ADR 003 (agentes), ADR 010 (conector), ADR 012 (governança/Action Policy).

## Decisão

### D1 — Pipeline de suporte (camadas)

```
Cliente (WhatsApp)
  → Router (já existe): detecta cliente ativo via lookupCustomer → rota = support
  → SupportPipeline:
      → Knowledge Agent   — consulta KB; NUNCA executa ação; só responde
      → Diagnostic Agent  — investiga dado real do TMS quando a dúvida é operacional
      → Resolution Agent  — propõe/encaminha a solução (ACTION para o backend)
      → Escalation Agent  — decide IA resolve x humano resolve
  → Supervisora (já existe) — audita rascunho antes de enviar
```

### D2 — Papel de cada agente

| Agente | Faz | NÃO faz |
|---|---|---|
| Knowledge | Responde dúvida conceitual via KB | Ler dado do cliente, executar ação |
| Diagnostic | Lê dado real (status CT-e, contrato, rota) e correlaciona com playbook | Escrever no TMS |
| Resolution | Monta a solução e emite `ACTION=...` | Executar a ação (quem executa é o backend — ADR 012) |
| Escalation | Aplica matriz de escalonamento (ADR 016) | Resolver o caso |

### D3 — Fonte de dado do diagnóstico (decisão crítica)

- **Leitura:** o Diagnostic Agent lê **sempre via a interface `Connector`** (ADR 010).
  A implementação atual (`TmsLookupService`, SELECT read-only no banco do TMS) é aceita no
  curto prazo, mas **fica atrás da interface** para poder migrar à API do TMS sem refatorar.
- **Escrita/ação:** QUALQUER ação de resolução vai **exclusivamente pela API do TMS**.
  **Proibido escrever no banco do TMS** (mantém a regra "zero writes" já vigente).

### D4 — Comportamento "cliente ativo"

- `lookupCustomer()` retorna cliente → `customerStage = cliente_ativo` → rota support.
- IA não oferta plano nem captura lead. Foco: resolver.

### D5 — Ciclo de fechamento do suporte (difere do comercial)

| Situação | Status | Outcome |
|---|---|---|
| Resolvido + 48h sem retorno | `closed` | `resolved` |
| Escalado a humano | `escalated` | — (humano fecha) |
| Cliente sem retorno em caso aberto | regra do Janitor de suporte (48h, não 7 dias) | `no_response` |

> Adiciona `resolved` ao enum `outcome` e uma regra de Janitor específica para suporte.

### D6 — Escalonamento de segurança (tema sensível)

- Em categorias **Fiscal** ou **Financeiro**, se `confidence = low` OU o fallback
  determinístico for acionado (Claude indisponível) → **escala humano. NÃO responde.**
- Reforça o ADR 012: a IA não improvisa em tema fiscal/financeiro.

## Consequências

**Positivas**
- Reaproveita router, supervisora, governança e conector já prontos.
- Diagnóstico sobre dado real = diferencial defensável (não é FAQ).
- Desacopla leitura (interface) de ação (API) — seguro e evolutivo.

**Custos / a decidir**
- Implementar Diagnostic e Resolution agents (novos).
- Novo enum `resolved` + Janitor de suporte (48h).
- Embeddings (ADR 018) tornam-se pré-requisito de qualidade.

## Relacionados

ADR 003, 006, 010, 012, 014 · deriva em ADR 016 (classificação), 017 (playbooks),
018 (KB), 019 (ticket intelligence).
