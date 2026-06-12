# Processo de Revisão de IA — Nexa

> Como revisamos o comportamento da Lia: revisão automática (Supervisor em
> runtime) e revisão humana (auditoria e melhoria contínua).

## Dois níveis de revisão

### 1. Runtime — Supervisor (automático)

Toda interação passa pelo Supervisor antes de entrar e antes de sair (ver
`ai-guardrails.md`):

- **Entrada**: prompt injection, palavras de risco, pedido de dado de outro tenant.
- **Saída**: alucinação (sem KB aprovada → não responde), LGPD, tom de marca,
  promessa comercial não autorizada.
- Falhas geram registro em `ai_escalations` / `ai_quality_audits`.

### 2. Pós-fato — revisão humana (auditoria)

Curadoria periódica das interações para melhoria contínua:

- **Amostragem** de conversas (com prioridade para escaladas, baixa confiança e
  reclamações).
- **Critérios**: precisão factual (bate com a KB?), aderência à policy de ações,
  tom, e se a escalada aconteceu na hora certa.
- **Saídas**: correções na KB (novo conteúdo aprovado / `valid_until`), ajuste de
  system prompt do agente, novo caso para playbook (ADR 017).

## Quando uma mudança de IA exige revisão formal

- Alterar **system prompt** de um agente → revisão de 1 par + teste em conversa real.
- Alterar a **action policy** (`action-policy.ts`) → revisão obrigatória (toca
  fronteira financeira/irreversível).
- Aprovar/editar **KB** → curadoria humana antes de `approved = true`.
- Mudar **autonomia** (default `AI_AUTONOMY_ENABLED` ou por módulo) → registrar
  decisão (ADR) e auditar impacto.

## Métricas de qualidade

Acompanhar por agente/conversa: taxa de escalada, taxa de "não encontrei", custo
(tokens via `completeWithUsage`), confiança média, reclamações abertas
(`complaints`). Quedas/altas anômalas disparam revisão humana.

## Testes

Os agentes têm specs isolados (`*-agent.service.spec.ts`, ex.: router, escalation).
Agente pequeno e focado é testável isoladamente — manter cobertura ao mudar
roteamento ou regra de escalada.

## Relacionados

- `docs/ai/ai-guardrails.md` · `docs/ai/ai-agents.md`
- ADR 012 — Segurança da IA · ADR 016 — Classificação de Chamados · ADR 019 — Ticket Intelligence
- `docs/reviews/` (revisões datadas)
