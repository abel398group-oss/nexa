/**
 * Tradução das mensagens do class-validator para português.
 *
 * Por que traduzir o texto RENDERIZADO em vez de pôr `message:` em cada
 * decorator: são centenas de decorators espalhados por dezenas de DTOs, e cada
 * um esquecido volta a responder em inglês sem ninguém perceber. Aqui é um
 * ponto só, que todo 400 de validação já atravessa (`exceptionFactory` em
 * main.ts), e decorator novo nasce traduzido de graça.
 *
 * O nome do campo é preservado como veio (`phone`, `sourceChannel`): é o que
 * identifica ONDE está o erro, e o TMS/frontend precisa dele para apontar o
 * campo certo. Só a explicação da regra muda de idioma.
 *
 * Mensagem que não casa com nenhum padrão volta INTACTA — é o caso dos
 * validadores próprios (IsBrazilPhone, por exemplo), que já escrevem em
 * português e não podem ser mexidos por acidente.
 *
 * Cuidado ao editar: `property X should not exist` é a mensagem que já derrubou
 * a abertura de chamado do widget duas vezes (isManager em 09/07/2026,
 * companyName+cnpj em 07/08/2026). O proxy do TMS mostra o array `message` como
 * texto para o usuário final, então essa frase precisa dizer sozinha o que
 * aconteceu. Ver apps/backend/docs/portal-api-contract.md.
 */

type Regra = [RegExp, (m: RegExpMatchArray) => string];

// A ordem importa: o primeiro padrão que casar vence. Os mais específicos
// (frases longas do class-validator) vêm antes dos genéricos.
const REGRAS: Regra[] = [
  // whitelist / forbidNonWhitelisted — a mais importante do contrato TMS↔Nexa
  [/^property (.+) should not exist$/, (m) => `o campo "${m[1]}" não é aceito nesta rota`],

  // presença
  [/^(.+) should not be empty$/, (m) => `${m[1]} não pode ficar vazio`],
  [/^(.+) should not be null or undefined$/, (m) => `${m[1]} é obrigatório`],
  [/^(.+) must be defined$/, (m) => `${m[1]} é obrigatório`],

  // conjunto fechado (IsIn / IsEnum)
  [
    /^(.+) must be one of the following values: (.+)$/,
    (m) => `${m[1]} deve ser um destes valores: ${m[2]}`,
  ],

  // faixas numéricas
  [/^(.+) must not be less than (.+)$/, (m) => `${m[1]} não pode ser menor que ${m[2]}`],
  [/^(.+) must not be greater than (.+)$/, (m) => `${m[1]} não pode ser maior que ${m[2]}`],
  [/^(.+) must be a positive number$/, (m) => `${m[1]} deve ser um número positivo`],
  [/^(.+) must be a negative number$/, (m) => `${m[1]} deve ser um número negativo`],

  // tamanho de texto
  [
    /^(.+) must be longer than or equal to (\d+) characters?$/,
    (m) => `${m[1]} deve ter no mínimo ${m[2]} caractere(s)`,
  ],
  [
    /^(.+) must be shorter than or equal to (\d+) characters?$/,
    (m) => `${m[1]} deve ter no máximo ${m[2]} caractere(s)`,
  ],

  // tamanho de lista
  [
    /^(.+) must contain at least (\d+) elements?$/,
    (m) => `${m[1]} deve ter pelo menos ${m[2]} item(ns)`,
  ],
  [
    /^(.+) must contain no more than (\d+) elements?$/,
    (m) => `${m[1]} deve ter no máximo ${m[2]} item(ns)`,
  ],
  [/^(.+) must contain only unique values$/, (m) => `${m[1]} não pode ter valores repetidos`],

  // tipos
  [/^(.+) must be a string$/, (m) => `${m[1]} deve ser um texto`],
  [/^(.+) must be an integer number$/, (m) => `${m[1]} deve ser um número inteiro`],
  [
    /^(.+) must be a number conforming to the specified constraints$/,
    (m) => `${m[1]} deve ser um número`,
  ],
  [/^(.+) must be a number string$/, (m) => `${m[1]} deve ser um número em texto`],
  [/^(.+) must be a boolean value$/, (m) => `${m[1]} deve ser verdadeiro ou falso`],
  [/^(.+) must be an array$/, (m) => `${m[1]} deve ser uma lista`],
  [/^(.+) must be an object$/, (m) => `${m[1]} deve ser um objeto`],
  [/^(.+) must be a non-empty object$/, (m) => `${m[1]} deve ser um objeto não vazio`],

  // formatos
  [/^(.+) must be an email$/, (m) => `${m[1]} deve ser um e-mail válido`],
  [/^(.+) must be a URL address$/, (m) => `${m[1]} deve ser uma URL válida`],
  [/^(.+) must be a UUID$/, (m) => `${m[1]} deve ser um UUID`],
  [/^(.+) must be a Date instance$/, (m) => `${m[1]} deve ser uma data`],
  [
    /^(.+) must be a valid ISO 8601 date string$/,
    (m) => `${m[1]} deve ser uma data no formato ISO 8601`,
  ],
  // A regex crua não diz nada a quem preencheu o formulário — some de propósito.
  [/^(.+) must match .+ regular expression$/, (m) => `${m[1]} está em formato inválido`],
];

/**
 * Prefixo que o class-validator põe nos decorators com `{ each: true }`:
 * "each value in events must be a string". Sem tratar isso, a frase saía
 * metade em inglês — "each value in events deve ser um texto".
 */
const CADA_ITEM = /^each value in (.+)$/;

/** Traduz UMA mensagem. Sem padrão correspondente, devolve a original. */
export function traduzirMensagemDeValidacao(mensagem: string): string {
  const cada = mensagem.match(CADA_ITEM);
  if (cada) {
    // Traduz o resto e devolve o campo pro começo: o nome dele fica dentro da
    // frase interna, então "cada item de X" é montado a partir do resultado.
    const interna = traduzirMensagemDeValidacao(cada[1]);
    return `cada item de ${interna}`;
  }
  for (const [padrao, montar] of REGRAS) {
    const m = mensagem.match(padrao);
    if (m) return montar(m);
  }
  return mensagem;
}

/** Traduz a lista inteira que vai no corpo do 400. */
export function traduzirMensagensDeValidacao(mensagens: string[]): string[] {
  return mensagens.map(traduzirMensagemDeValidacao);
}
