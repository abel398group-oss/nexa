# Arquitetura RAG / Knowledge Base — Nexa

> Como a base de conhecimento alimenta a Lia. Decisão em **ADR 006** (Knowledge
> Base versionada + RAG) e **ADR 018** (KB do Suporte). Implementação em
> `application/knowledge/`.

## Por que RAG

A Lia só atende sozinha (suporte/vendas) se souber com precisão. "Ler documentação
crua" é perigoso: pode usar informação desatualizada ou não aprovada e alucinar. A
KB resolve isso com **conteúdo versionado, aprovado e recuperável por relevância**.

## Estado atual → alvo

| Fase | Recuperação | Estado |
|---|---|---|
| Semântica | Embeddings por artigo + busca por similaridade de cosseno (pgvector) | ✅ implementado |
| Fallback | Scoring textual por termos: título (3pts) > tags (2pts) > topic (2pts) > conteúdo (1pt) | ✅ implementado |

> O scoring textual e o endpoint de importação estão detalhados em
> [`docs/features/knowledge/prd.md`](../features/knowledge/prd.md).

### Busca semântica (implementada)

- **Modelo:** `multilingual-e5-small` (384 dims), rodando **local** no backend via
  `@xenova/transformers` — sem vendor externo nem API key. Configurável por
  `EMBEDDING_MODEL`; desligável por `EMBEDDINGS_ENABLED=false`.
- **Serviço:** `shared/ai/embeddings.service.ts` (carregamento lazy, à prova de falha).
- **Armazenamento:** coluna `embedding vector(384)` em `ai_knowledge_base` (extensão
  `pgvector`, migração `20260614000000_add_kb_embeddings`).
- **Recuperação:** `KnowledgeService.retrieve()` embeda a pergunta (prefixo `query:`)
  e faz `ORDER BY embedding <=> $vec` (distância de cosseno). Se os embeddings
  estiverem indisponíveis (sem rede/modelo) ou ainda não houver vetores, cai
  automaticamente no **scoring textual** — nunca quebra.
- **Indexação:** vetor gerado em create/update/approve (prefixo `passage:`). Backfill
  da base existente via `POST /api/knowledge/reindex` (perm. `knowledge`); `?force=true`
  reindexa tudo.
- **Índice:** dispensável enquanto a KB é pequena; criar HNSW (`vector_cosine_ops`)
  quando passar de ~1.000 artigos.

PostgreSQL 16 já roda com **pgvector** (ver `docker-compose.yml` e README).

## Regras de uso (não negociáveis)

A Lia só usa conteúdo que satisfaça:

```
approved = true AND (valid_until IS NULL OR valid_until >= hoje)
```

Se nada satisfaz a pergunta → "não encontrei, vou encaminhar" (anti-alucinação,
ADR 006 D5). O Knowledge Service é **retrieval puro**: não conversa e não escreve.

## Categorização

- **comercial** — planos, preços, objeções, cases por segmento.
- **tecnico** — como executar cada operação no produto.
- **suporte** — erros comuns e soluções (liga aos playbooks, ADR 017).

## Versionamento e aprovação

Tabelas `ai_knowledge_base` + `ai_knowledge_versions`:

```json
{ "approved": true, "valid_until": "2026-12-31", "version": 5, "author": "Equipe Produto" }
```

Curadoria humana antes de aprovar. O conteúdo evolui sem mexer em prompt/workflow.

## Origem do conteúdo

Popular a partir da documentação do HiperTMS (`hipertms_v12/docs/`) e do conector
(`Connector.getKnowledge()` retorna `KnowledgeItem[]` do produto). **Nunca
importar cru** — sempre com curadoria e aprovação.

## Pipeline RAG alvo (resumo)

```
artigo aprovado → chunk → embedding (pgvector) → índice
pergunta do lead → embedding → busca top-k por similaridade
              → filtra approved/valid_until → monta contexto → agente responde
```

## Relacionados

- ADR 006 — Knowledge Base · ADR 018 — KB do Suporte · ADR 017 — Playbooks
- `docs/ai/context-engineering.md` · `docs/features/knowledge/prd.md`
- `application/knowledge/knowledge.service.ts` · `application/connectors/connector.interface.ts`
