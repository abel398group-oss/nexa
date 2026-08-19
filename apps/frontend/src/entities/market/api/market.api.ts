// Funções puras de acesso à API de mercados (FSD — sem React).
import { api } from '@/shared/lib/api';
import type { Market, MarketReadiness, MarketSellers } from '../types/market.types';

/**
 * `somenteLiberados` é o que a tela de Disparo usa: mercado em rascunho não pode
 * aparecer para o vendedor, senão a trava de liberação não serve para nada.
 */
export async function listMarkets(somenteLiberados = false): Promise<Market[]> {
  const r = await api.get('/markets', {
    params: somenteLiberados ? { liberados: 'true' } : {},
  });
  return r.data;
}

export async function getMarketReadiness(code: string): Promise<MarketReadiness> {
  const r = await api.get(`/markets/${code}/readiness`);
  return r.data;
}

export async function releaseMarket(code: string): Promise<Market> {
  const r = await api.post(`/markets/${code}/release`);
  return r.data;
}

export async function pauseMarket(code: string): Promise<Market> {
  const r = await api.post(`/markets/${code}/pause`);
  return r.data;
}

/// Vendedores do mercado: quem trabalha e quem ainda não. As duas listas vêm juntas
/// porque a tela precisa das duas — sem os de fora não há o que escolher.
export async function getMarketSellers(code: string): Promise<MarketSellers> {
  const r = await api.get(`/markets/${code}/sellers`);
  return r.data;
}

/// Vincular é o que decide quem pode receber lead deste mercado: a transferência do
/// SDR recusa closer sem vínculo.
export async function linkMarketSeller(
  code: string,
  sellerId: string,
  role: 'seller' | 'lead' = 'seller',
): Promise<MarketSellers> {
  const r = await api.post(`/markets/${code}/sellers/${sellerId}`, { role });
  return r.data;
}

export async function unlinkMarketSeller(
  code: string,
  sellerId: string,
): Promise<MarketSellers> {
  const r = await api.delete(`/markets/${code}/sellers/${sellerId}`);
  return r.data;
}

/**
 * Cria um mercado. `slug` vira o `code` do produto — a chave usada em conhecimento,
 * campanha e conector — então o servidor recusa qualquer coisa fora de
 * `letras-minusculas-com-hifen`. Nasce em rascunho: só aparece no Disparo depois de
 * liberado.
 *
 * A identidade é opcional aqui, mas não é acessório: sem `displayName` e
 * `senderName` o mercado nasce com uma pendência vermelha que ele mesmo poderia
 * ter evitado. Vazio cai no nome do mercado, do lado do servidor.
 */
export async function createMarket(data: {
  name: string;
  slug: string;
  displayName?: string;
  senderName?: string;
  brandTagline?: string;
  brandColor?: string;
  signupUrl?: string;
}): Promise<Market> {
  const r = await api.post('/markets', data);
  return r.data;
}

/**
 * Edita a identidade do mercado — a cara dele no e-mail que o lead recebe.
 *
 * PATCH: campo ausente não é tocado. String vazia chega como limpeza (o backend
 * grava NULL), que é o que permite voltar à marca padrão do HiperTMS.
 *
 * Existe desde 17/08/2026. Antes disso o `create` do backend dizia "editável
 * depois na configuração do mercado" e essa configuração nunca tinha sido feita
 * — enquanto a trava de liberação exigia a identidade preenchida.
 */
export async function updateMarket(
  code: string,
  dto: Partial<Pick<Market, 'name' | 'displayName' | 'senderName' | 'brandTagline' | 'brandColor' | 'signupUrl'>>,
): Promise<Market> {
  const r = await api.patch(`/markets/${code}`, dto);
  return r.data;
}

/**
 * Exclui um mercado criado por engano.
 *
 * O servidor só aceita rascunho sem conhecimento, sem modelo e sem lista de
 * lead — mercado que já rodou não é engano, é história, e sai com "Suspender".
 * A recusa vem com o motivo em `message`; mostre-a, não troque por um genérico.
 */
export async function deleteMarket(code: string): Promise<void> {
  await api.delete(`/markets/${code}`);
}

// ─── Material de campanha do mercado (ADR 037) ──────────────────────────────

export interface MarketAsset {
  id: string;
  name: string;
  /** plan = roteiro que a Lia lê · portfolio = PDF/imagem que o lead vê. */
  kind: 'plan' | 'portfolio';
  /** Só no portfólio: caminho relativo servido em /uploads. */
  fileUrl: string | null;
  mimeType: string | null;
  sizeBytes: number;
  /** pending = subiu e ninguém leu · approved = revisado, a Lia pode usar. */
  status: 'pending' | 'approved';
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** O texto vem só aqui — a listagem devolve nome e tamanho, nunca o conteúdo. */
export interface MarketAssetContent extends MarketAsset {
  content: string;
}

export async function listMarketAssets(
  code: string,
  kind?: 'plan' | 'portfolio',
): Promise<MarketAsset[]> {
  const r = await api.get(`/markets/${code}/assets`, { params: kind ? { kind } : undefined });
  return r.data;
}

/**
 * Portfólio: PDF ou imagem, como `multipart`.
 *
 * Diferente do roteiro, que vai como JSON: o navegador leu o `.md` para mostrar
 * antes de enviar, mas não tem como ler um PDF — os bytes sobem crus.
 */
export async function uploadMarketPortfolio(code: string, file: File): Promise<MarketAsset> {
  const form = new FormData();
  form.append('file', file);
  const r = await api.post(`/markets/${code}/assets/portfolio`, form);
  return r.data;
}

export async function readMarketAsset(code: string, id: string): Promise<MarketAssetContent> {
  const r = await api.get(`/markets/${code}/assets/${id}`);
  return r.data;
}

/**
 * Sobe um arquivo de texto já LIDO pelo navegador.
 *
 * Vai como JSON, não `multipart`: o `FileReader` já decodificou o `.md` para mostrar
 * o tamanho antes de enviar, e remontar bytes para o servidor decodificar de novo
 * seria trabalho a troco de nada. Muda quando entrar PDF, que o navegador não lê.
 *
 * Reenviar o mesmo nome ATUALIZA e derruba a aprovação — é correção, não cópia.
 */
export async function uploadMarketAsset(
  code: string,
  file: { name: string; content: string },
): Promise<MarketAsset> {
  const r = await api.post(`/markets/${code}/assets`, file);
  return r.data;
}

export async function approveMarketAsset(code: string, id: string): Promise<MarketAsset> {
  const r = await api.post(`/markets/${code}/assets/${id}/approve`);
  return r.data;
}

export async function rejectMarketAsset(code: string, id: string): Promise<MarketAsset> {
  const r = await api.post(`/markets/${code}/assets/${id}/reject`);
  return r.data;
}

/**
 * Remove um material do mercado.
 *
 * Vai com `_override` desde o começo, e isso é sobre PROMPT, não sobre permissão.
 *
 * Para o platform admin operando dentro de um cliente, o backend recusa ação
 * irreversível sem `X-Acting-Override` e o interceptor do `api.ts` abre um segundo
 * modal de "quebra de vidro". Só que a tela JÁ perguntou, nomeando o arquivo e
 * avisando que não dá para desfazer — a segunda pergunta não acrescenta informação,
 * e em "Remover tudo" ela apareceria uma vez por arquivo. Confirmação repetida é o
 * que ensina a clicar em "sim" sem ler, então ela custa segurança em vez de dar.
 *
 * O controle continua inteiro: o header segue sendo exigido pelo backend e a ação
 * continua auditada. O que sai é a pergunta duplicada, não a trava.
 */
export async function deleteMarketAsset(code: string, id: string): Promise<void> {
  await api.delete(`/markets/${code}/assets/${id}`, { _override: true } as never);
}

/**
 * Corrige um material durante a revisão. PATCH: campo ausente não é tocado.
 *
 * Editar derruba a aprovação — o que foi lido e o que está gravado precisam ser a
 * mesma coisa. Quem corrigiu está com o texto na frente, então reaprovar é um clique.
 */
export async function editMarketAsset(
  code: string,
  id: string,
  dto: { name?: string; content?: string },
): Promise<MarketAsset> {
  const r = await api.patch(`/markets/${code}/assets/${id}`, dto);
  return r.data;
}
