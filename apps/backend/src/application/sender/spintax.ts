/**
 * spintax.ts — variação de texto por sorteio, para disparo em massa.
 *
 * ## Por que existe
 *
 * O anti-ban do sender cuidava do RITMO (delay aleatório 30–90s, warmup, teto
 * diário/horário) mas não do CONTEÚDO: todos os alvos de uma campanha recebiam o
 * mesmo texto caractere por caractere. Conteúdo idêntico repetido para dezenas de
 * números que nunca falaram com o remetente é o sinal mais direto de spam que o
 * WhatsApp usa — mais forte que a cadência. Falar devagar repetindo a mesma frase
 * continua sendo repetir a mesma frase.
 *
 * ## Sintaxe
 *
 *   {Oi|Olá|Bom dia}, {{nome}}! {Tudo bem|Como vai}?
 *
 * Cada `{a|b|c}` vira UMA das opções, sorteada por destinatário. Com 3 opções em
 * 2 pontos já são 9 mensagens distintas; 4 opções em 4 pontos dão 256.
 *
 * ## Garantias
 *
 * - **Retrocompatível**: um template sem `|` dentro de chaves passa intacto. Toda
 *   campanha existente continua funcionando exatamente igual.
 * - **Não colide com `{{nome}}`**: só grupos que contêm `|` são expandidos, e o
 *   `{{...}}` é substituído ANTES do spin nos dois renders (WhatsApp e e-mail).
 * - **Aninhamento** suportado (`{Oi|{Olá|Opa}}`), com teto de profundidade para
 *   nunca travar o worker com um template malformado.
 * - **Nunca lança**: template quebrado degrada para o texto como está. Um erro de
 *   digitação do usuário não pode derrubar o disparo no meio da campanha.
 */

/** Profundidade máxima de aninhamento. Acima disso o texto sai como está. */
const MAX_DEPTH = 10;

/** Grupo mais interno que contenha ao menos um `|` (o `[^{}]` impede pegar aninhado). */
const GROUP = /\{([^{}]*\|[^{}]*)\}/g;

/**
 * Expande todos os grupos `{a|b|c}` do texto, sorteando uma opção em cada.
 *
 * @param text  template, possivelmente sem nenhum grupo
 * @param rand  gerador injetável — os testes passam um determinístico
 */
export function spin(text: string, rand: () => number = Math.random): string {
  if (!text || !text.includes('|')) return text ?? '';

  let out = text;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (!new RegExp(GROUP.source).test(out)) return out;
    out = out.replace(new RegExp(GROUP.source, 'g'), (_full, body: string) => {
      const options = String(body).split('|');
      // clamp: rand() === 1 (ou NaN) não pode gerar índice fora do array
      const i = Math.min(options.length - 1, Math.max(0, Math.floor(rand() * options.length) || 0));
      return options[i] ?? '';
    });
  }
  return out;
}

/**
 * Quantas mensagens distintas um template consegue gerar.
 * Serve para avisar na tela quando a variação é baixa demais para o tamanho da lista.
 * Aninhamento não é contabilizado — o número é um piso, nunca uma promessa a mais.
 */
export function spinVariants(text: string): number {
  if (!text) return 1;
  let total = 1;
  for (const m of text.matchAll(new RegExp(GROUP.source, 'g'))) {
    total *= String(m[1]).split('|').length;
  }
  return total;
}
