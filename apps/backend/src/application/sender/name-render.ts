/**
 * name-render.ts — tratamento do `{{nome}}` quando o lead não tem nome usável.
 *
 * ## Por que é um módulo à parte
 *
 * Estas duas funções nasceram como estáticos do `SenderService` e são usadas
 * também pelo disparo de e-mail e pelo follow-up. O follow-up NÃO pode importar
 * o `SenderService` — ele já é importado por lá (`sender.service.ts` injeta
 * `FollowUpService`), e o ciclo quebra o boot do Nest. Módulo sem dependência
 * nenhuma resolve para os três.
 *
 * ## Por que existem
 *
 * O fallback antigo era a string literal "tudo bem", o que produzia aberrações
 * como "Bom dia tudo bem, tudo bem?" em 1.666 dos 3.097 leads da base — mais da
 * metade entra sem nome. Frase limpa é melhor que frase com apelido genérico.
 */

/**
 * Primeiro nome utilizável, ou '' quando não dá para tratar a pessoa pelo nome.
 * Descarta lixo comum de lista raspada: só dígitos, uma letra só, ou o próprio
 * telefone no lugar do nome — nesses casos é melhor não chamar de nada.
 */
export function firstName(name?: string | null): string {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  if (first.length < 2) return '';
  if (/^\d+$/.test(first)) return '';          // "5511999998888"
  if (!/[a-zA-ZÀ-ÿ]/.test(first)) return '';   // só símbolo/emoji
  return first;
}

/**
 * Recompõe a frase quando `{{nome}}` saiu vazio, para não sobrar pontuação
 * órfã. "Bom dia , tudo bem?" → "Bom dia, tudo bem?" · "Olá !" → "Olá!"
 */
export function tidyMissingName(txt: string): string {
  return txt
    .replace(/[ \t]{2,}/g, ' ')          // espaço duplo deixado pelo placeholder
    .replace(/[ \t]+([,.!?;:])/g, '$1')  // " ," → ","
    .replace(/,\s*,/g, ',')              // ", ," → ","
    // pontuação colidindo: "{{saudacao}}, {{nome}}." vira "Bom dia,." — a
    // vírgula existia só para separar o nome, então some.
    .replace(/,\s*([.!?;:])/g, '$1')
    .replace(/^[ \t]+/gm, '')            // espaço no começo da linha
    .replace(/[ \t]+$/gm, '');           // espaço no fim da linha
}
