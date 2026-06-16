import { Injectable, Logger } from '@nestjs/common';

// Modelo de embeddings local (roda no próprio backend, sem vendor/API key).
// multilingual-e5-small: 384 dims, multilíngue (bom PT-BR), ~120MB.
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'Xenova/multilingual-e5-small';
export const EMBEDDING_DIM = 384;
// Permite desligar por env (ex.: ambiente sem rede p/ baixar o modelo) → cai no textual.
const ENABLED = (process.env.EMBEDDINGS_ENABLED ?? 'true').toLowerCase() !== 'false';

/**
 * Gera embeddings de texto localmente para a busca semântica da KB (RAG).
 * Carrega o modelo sob demanda (lazy) e é à prova de falha: se o modelo não
 * carregar (sem rede, etc.), `enabled` vira false e o retrieval cai no textual.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger('Embeddings');
  private extractor: any | null = null;
  private loading: Promise<any | null> | null = null;
  private failed = false;

  get enabled(): boolean {
    return ENABLED && !this.failed;
  }

  private async getExtractor(): Promise<any | null> {
    if (!this.enabled) return null;
    if (this.extractor) return this.extractor;
    if (!this.loading) {
      this.loading = (async () => {
        try {
          // @xenova/transformers é ESM-only. `new Function` evita o TS rebaixar
          // o import dinâmico para require() (que quebraria com ESM) no build CommonJS.
          const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
          const { pipeline, env } = await dynamicImport('@xenova/transformers');
          env.allowLocalModels = true; // reaproveita o modelo já baixado em disco
          const ex = await pipeline('feature-extraction', EMBEDDING_MODEL);
          this.logger.log(`Modelo de embeddings carregado: ${EMBEDDING_MODEL}`);
          return ex;
        } catch (e: any) {
          this.failed = true;
          this.logger.warn(`Falha ao carregar embeddings (${e?.message}) — retrieval usará busca textual`);
          return null;
        }
      })();
    }
    this.extractor = await this.loading;
    return this.extractor;
  }

  /**
   * Gera o vetor de um texto. e5 exige prefixo "query:" (pergunta) ou
   * "passage:" (documento) para melhor qualidade. Retorna null se indisponível.
   */
  async embed(text: string, kind: 'query' | 'passage' = 'query'): Promise<number[] | null> {
    const ex = await this.getExtractor();
    if (!ex) return null;
    try {
      const clean = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 4000);
      if (!clean) return null;
      const out = await ex(`${kind}: ${clean}`, { pooling: 'mean', normalize: true });
      return Array.from(out.data as Float32Array);
    } catch (e: any) {
      this.logger.warn(`embed falhou: ${e?.message}`);
      return null;
    }
  }

  // Formata um vetor para o literal aceito pelo pgvector: '[0.1,0.2,...]'.
  static toVectorLiteral(vec: number[]): string {
    return `[${vec.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}]`;
  }
}
