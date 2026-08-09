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

/**
 * Lista pequena não precisa de variação — o sinal de spam é a REPETIÇÃO, e vinte
 * mensagens iguais não formam padrão. Abaixo disso o aviso seria só ruído.
 */
const minDestinatarios = () => Number(process.env.SPINTAX_WARN_MIN_RECIPIENTS ?? 20);
/** Quantas vezes o mesmo texto pode se repetir antes de virar padrão detectável. */
const maxRepeticoes = () => Number(process.env.SPINTAX_WARN_MAX_REPEAT ?? 20);

/**
 * Aviso para o operador quando o template não varia o bastante para o tamanho da
 * lista, ou `null` quando está de bom tamanho.
 *
 * Por que existe: `spin()` devolve o texto intacto quando não há `{a|b}` — o que
 * é a retrocompatibilidade que queremos, mas significa que colar um template
 * plano manda a campanha inteira byte a byte igual, em silêncio. A função de
 * contar variantes já existia (`spinVariants`) e nunca era chamada por ninguém.
 *
 * Não bloqueia a criação de propósito: variação é heurística de risco, não regra
 * de negócio, e há casos legítimos de texto fixo (aviso operacional para uma
 * base pequena). Quem decide é o operador — desde que ele saiba.
 */
export function lowVariationWarning(template: string, destinatarios: number): string | null {
  if (destinatarios < minDestinatarios()) return null;

  const variantes = spinVariants(template);
  const repeticoes = Math.round(destinatarios / variantes);
  if (repeticoes < maxRepeticoes()) return null;

  const comoVariar =
    'Use {opção1|opção2|opção3} no texto para variar — ex.: "{Oi|Olá|Bom dia} {{nome}}".';

  return variantes === 1
    ? `Os ${destinatarios} destinatários vão receber o texto EXATAMENTE igual. ` +
      `Conteúdo idêntico repetido é o sinal de spam mais direto que o WhatsApp usa. ${comoVariar}`
    : `O texto tem ${variantes} variações para ${destinatarios} destinatários — ` +
      `cada mensagem se repete ~${repeticoes}x. ${comoVariar}`;
}
