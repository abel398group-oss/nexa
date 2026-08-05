# ADR 019 — Ticket Intelligence

**Status:** Aceito (implementado) · **Data:** 2026-06 · **Verificado:** 2026-08-05
> Implementado em `application/agents/ticket-intelligence.service.ts`. Status corrigido na auditoria do suporte
> (`docs/reviews/2026-08-05-auditoria-suporte.md`) — estava "Proposto" com o
> código em produção havia semanas.

## Contexto

Resolver o chamado não basta: o suporte precisa **aprender** com cada atendimento —
detectar recorrência, identificar bug provável e realimentar KB/playbooks. Deriva do
ADR 015/016/017.

## Decisão

### D1 — Classificação do resultado do ticket

| Classe | Significado | Ação automática |
|---|---|---|
| Resolvido | IA resolveu sozinha | candidato a virar artigo de KB |
| Recorrente | mesmo problema repetindo | sobe prioridade; sugere playbook novo |
| Bug provável | erro do sistema reproduzível | abre alerta p/ time TMS |
| Falha operacional | uso incorreto do cliente | reforça treinamento/KB |
| Erro de configuração | cadastro/parametrização errada | playbook de correção |

### D2 — Sinais usados

volume por causa-raiz · taxa de reabertura · escalonamento humano · feedback do cliente ·
passo do playbook onde travou.

### D3 — Loop de aprendizado

```
Ticket fechado → classifica (D1)
  → Resolvido recorrente    → propõe artigo KB (revisor aprova)        [ADR 018]
  → Bug provável            → alerta + agrega ocorrências p/ TMS
  → Gap de playbook         → sugere novo passo/playbook               [ADR 017]
```

> Nada entra em produção sem aprovação humana (curadoria do ADR 006/018).

### D4 — Métricas (alimentam dashboard)

% resolvido sem humano · tempo até causa-raiz · top causas · recorrência ·
taxa de escalonamento por categoria.

## Consequências

**Positivas:** suporte que melhora sozinho; detecção precoce de bug; KB cresce com curadoria.

**Custos:** lógica de agregação/classificação; revisão humana dos candidatos a KB.

## Relacionados

ADR 015, 016, 017, 018 · alimenta Métricas/Dashboard existentes.
