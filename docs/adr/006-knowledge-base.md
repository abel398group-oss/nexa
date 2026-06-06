# ADR 006 — Knowledge Base (versionada + RAG)

**Status:** Proposto · **Data:** 2026-06

## Contexto
A IA só atende sozinha (suporte/vendas) se souber com precisão. "Ler documentação" cru é
perigoso — pode usar info desatualizada ou não aprovada, causando alucinação.

## Decisão

### D1 — Conteúdo versionado e aprovado
Tabelas `ai_knowledge_base` + `ai_knowledge_versions`:
```json
{ "approved": true, "valid_until": "2026-12-31", "version": 5, "author": "Equipe Produto" }
```
A IA só usa: `approved = true AND (valid_until IS NULL OR valid_until >= hoje)`.

### D2 — Categorização
- **comercial** (planos, preços, objeções, cases por segmento)
- **tecnico** (como fazer cada operação no TMS)
- **suporte** (erros comuns e soluções)

### D3 — RAG (futuro)
- Embeddings por artigo (`ai_knowledge_embeddings`)
- Busca semântica: recupera só o trecho relevante para a pergunta
- Reduz tokens e melhora precisão

### D4 — Origem do conteúdo
- Popular a partir da documentação do HiperTMS (`hipertms_v12/docs/`)
- Curadoria humana antes de aprovar (não importar cru)

### D5 — Anti-alucinação (liga com ia-autonoma 9.11)
Se não há conteúdo aprovado que responda → IA diz "não encontrei, vou encaminhar".
Nunca inventa.

## Consequências
- (+) Respostas precisas e atualizadas; menos alucinação
- (+) Conteúdo evolui sem mexer em prompt/workflow
- (−) Exige processo de curadoria/aprovação

## Migração
Hoje há `ai_knowledge_base` simples (texto injetado no prompt). Evoluir para versionada +
aprovação, depois adicionar embeddings/RAG quando o volume justificar.
