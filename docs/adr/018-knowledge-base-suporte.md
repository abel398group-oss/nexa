# ADR 018 — Knowledge Base do Suporte

**Status:** Aceito (implementado) · **Data:** 2026-06 · **Verificado:** 2026-08-05
> Implementado em `application/connectors/hipertms-suporte-kb.data.ts (228 tópicos) + knowledge.service.ts`. Status corrigido na auditoria do suporte
> (`docs/reviews/2026-08-05-auditoria-suporte.md`) — estava "Proposto" com o
> código em produção havia semanas.

## Contexto

O suporte precisa de uma base de conhecimento confiável e **aprovada**. O Nexa já tem KB
com versão/curadoria/aprovação (ADR 006) e ~20 artigos reais do TMS via `getKnowledge()`.
Este ADR **estende** o ADR 006 para o contexto de suporte — não recria.

## Decisão

### D1 — Origem do conhecimento (fontes)

| Fonte | Uso | Aprovação |
|---|---|---|
| Documentação oficial do HiperTMS | base primária | obrigatória |
| ADRs do próprio TMS | regras/decisões | obrigatória |
| FAQ / artigos curados | dúvidas comuns | revisor |
| Vídeos / tutoriais (transcrição) | treinamento | revisor |
| Casos resolvidos (ADR 019) | recorrências | curadoria automática + revisão |

### D2 — Fonte aprovada

- Só conteúdo com `approved_at` + `reviewer` entra em produção (regra do ADR 006).
- A IA cita a fonte (artigo/versão) na resposta — rastreabilidade.

### D3 — Retrieval (decisão técnica)

- **Ligar busca semântica via pgvector** (hoje desligado; retrieval é textual).
- Para base técnica de TMS (CT-e, fiscal), o textual erra recall → semântico é **requisito**
  de qualidade do suporte, não "evolução".
- Híbrido recomendado: semântico (embeddings) + filtro por categoria (ADR 016).

### D4 — Governança de confiança

- `confidence` do retrieval propaga para o pipeline.
- `confidence = low` em Fiscal/Financeiro → escala (ADR 015 D6).
- Fallback determinístico (Claude down) usa top-1 da KB com `confidence=low`.

## Consequências

**Positivas:** respostas rastreáveis e aprovadas; ligar pgvector é baixo custo (já instalado).

**Custos:** pipeline de ingestão da doc do TMS; gerar/armazenar embeddings; reindexação ao versionar.

## Relacionados

Estende ADR 006 · consumida por ADR 017 (playbooks) · realimentada por ADR 019.
