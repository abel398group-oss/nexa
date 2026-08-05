# ADR 016 — Classificação de Chamados do Suporte

**Status:** Aceito (implementado) · **Data:** 2026-06 · **Verificado:** 2026-08-05
> Implementado em `application/agents/case-classifier-agent.service.ts (12 categorias, 4 prioridades)`. Status corrigido na auditoria do suporte
> (`docs/reviews/2026-08-05-auditoria-suporte.md`) — estava "Proposto" com o
> código em produção havia semanas.

## Contexto

Para rotear, priorizar e medir o suporte, todo chamado precisa de uma classificação
consistente. Sem taxonomia fixa, a IA improvisa categorias e as métricas/playbooks não
se conectam. Decisão derivada do ADR 015.

## Decisão

### D1 — Categorias canônicas

| Categoria | Exemplos |
|---|---|
| Fiscal | tributação, regras fiscais, rejeição SEFAZ |
| CT-e | emissão, complementar, cancelamento, rejeição |
| MDF-e | manifesto, encerramento, eventos |
| Frete | cálculo, tabela, contrato |
| Financeiro | fatura, cobrança, repasse |
| Cadastro | clientes, motoristas, veículos |
| Usuários | acesso, permissão, senha |
| Integrações | ERP, parceiros, webhooks |
| API | uso da API do TMS, tokens, erros 4xx/5xx |
| Erro do sistema | bug, tela travada, comportamento inesperado |
| Treinamento | "como faço para…" (uso correto) |

### D2 — Matriz de prioridade

| Prioridade | Critério | SLA-alvo (resposta) |
|---|---|---|
| Crítica | operação parada (não emite CT-e/MDF-e em produção) | minutos |
| Alta | bloqueio parcial, financeiro, fiscal | < 1h |
| Média | dúvida operacional sem bloqueio | mesmo dia |
| Baixa | treinamento, "como faço" | 24h |

### D3 — Saída do Router (contrato)

```json
{
  "category": "cte",
  "priority": "high",
  "requiresHuman": false,
  "isCustomer": true
}
```

### D4 — Matriz de resolução (quem resolve)

| Categoria | IA resolve sozinha? | Observação |
|---|---|---|
| Treinamento, Usuários, Cadastro, API | ✅ normalmente | KB + playbook |
| CT-e, MDF-e, Frete, Integrações | 🟡 com diagnóstico | lê dado real (ADR 015 D3) |
| Fiscal, Financeiro | 🔴 escala se low-confidence | regra ADR 015 D6 |
| Erro do sistema | 🟡 diagnostica → vira ticket (ADR 019) | bug provável |

## Consequências

**Positivas:** roteamento previsível, métricas comparáveis, playbooks endereçáveis por categoria.

**Custos:** manter a taxonomia versionada; treinar o prompt do Router com exemplos por categoria.

## Relacionados

ADR 015 (arquitetura) · alimenta ADR 017 (playbooks) e ADR 019 (ticket intelligence).
