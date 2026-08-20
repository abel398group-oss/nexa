/**
 * erroDoServidor.ts — a frase que o servidor mandou, pronta para o toast.
 *
 * ## Por que existe
 *
 * O backend responde de duas formas. Quando é uma regra de negócio, `message` é uma
 * string ("Mercado X não existe"). Quando é o `ValidationPipe` global recusando o
 * corpo, `message` é um ARRAY — um item por campo inválido.
 *
 * As telas faziam `toast.error(e?.response?.data?.message ?? 'falhou')`, o que
 * funciona no primeiro caso e falha no segundo: o array chega ao toast e vira um
 * texto imprestável, ou nada. Foi o que aconteceu em 20/08/2026 na importação de
 * leads — o servidor recusou com 400 dizendo exatamente qual campo estava errado, e
 * a tela mostrou um erro sem motivo. Quem estava importando teve de abrir o console
 * do navegador para descobrir que havia uma explicação.
 *
 * O erro que não chega a quem clicou não existe, por mais preciso que seja.
 */

/**
 * @param erro     o que o axios rejeitou
 * @param fallback frase para quando o servidor não disse nada aproveitável — rede
 *                 caída, 500 sem corpo, timeout
 */
export function erroDoServidor(erro: unknown, fallback: string): string {
  const dados = (erro as any)?.response?.data;
  const msg = dados?.message ?? dados?.error;

  if (Array.isArray(msg)) {
    // Um item por campo inválido. Junta com ' · ' em vez de vírgula porque as
    // próprias mensagens já têm vírgula dentro, e o resultado vira uma frase só.
    const limpos = msg.filter((m): m is string => typeof m === 'string' && !!m.trim());
    if (limpos.length) return limpos.join(' · ');
  }

  if (typeof msg === 'string' && msg.trim()) return msg;

  return fallback;
}
