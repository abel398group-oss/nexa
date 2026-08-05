# Revisões — Nexa

Relatórios e auditorias datados do projeto. Padrão de nome: `YYYY-MM-DD-<assunto>.md`.

## Propósito

Centralizar revisões técnicas, auditorias e relatórios pontuais — separando-os da
documentação viva (ADRs, PRDs, padrões), que descreve o estado atual, enquanto as
revisões registram um **retrato de um momento**.

## Relatórios consolidados (2026-06-11)

- [`2026-06-05-auditoria-tecnica-n8n.md`](2026-06-05-auditoria-tecnica-n8n.md) —
  auditoria técnica do MVP n8n (antes: `docs/AUDITORIA_TECNICA_N8N.md`).
- [`2026-06-07-relatorio-tecnico.md`](2026-06-07-relatorio-tecnico.md) —
  relatório técnico (antes: raiz `RELATORIO_TECNICO.md`).

Referências que apontavam para os caminhos antigos já foram atualizadas
(`docs/ANALISE_CONSOLIDADA.md`, `PROGRESS.md`).

## Auditorias por módulo (2026-08)

Feitas com o mesmo método: ler o código e comparar com a intenção declarada,
citando `arquivo:linha`. As duas estão fechadas.

- [`2026-08-04-auditoria-arquitetura-seguranca.md`](2026-08-04-auditoria-arquitetura-seguranca.md) —
  arquitetura, IA, multi-tenancy, disparo e segurança. 12 achados; inclui a
  segunda opinião externa (Gemini) e o que dela se confirmou.
- [`2026-08-05-auditoria-suporte.md`](2026-08-05-auditoria-suporte.md) —
  fluxo de suporte ponta a ponta (widget no TMS → Lia → ticket → humano).
  6 achados, todos corrigidos; corrigiu também o status de 6 ADRs que estavam
  "Proposto" com o código em produção.

> `TESTE_MANUAL.md` (raiz) foi mantido como **guia vivo** de teste manual — não é
> um relatório datado, então não migrou para cá.

## Como adicionar uma revisão

1. Crie `reviews/YYYY-MM-DD-<assunto>.md`.
2. Comece com contexto (escopo, quem revisou, versão/commit avaliado).
3. Liste achados, severidade e ações recomendadas.
4. Linke os ADRs/PRDs afetados.

## Relacionados

- `docs/ai/ai-review-process.md` (revisão do comportamento da IA)
- `docs/GAP_DOCUMENTACAO.md`
