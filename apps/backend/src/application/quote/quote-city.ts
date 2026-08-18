// Limpeza do texto de cidade antes de perguntar ao TMS — puro, sem IO.
//
// A cidade é o maior risco de preço errado no fluxo inteiro: trocar Bariri por Barueri
// muda o valor e ninguém percebe. Por isso este módulo só LIMPA e SEPARA — quem decide
// qual cidade é continua sendo a busca do TMS, e o usuário confirma no eco.

/// As 27 unidades federativas. Lista fechada e que não muda — por isso é seguro expandir
/// sigla aqui. Apelido de cidade ("sampa", "bh") NÃO entra: é onde se erra com confiança.
const UFS = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE',
  'PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]);

/// Enfeite que a pessoa escreve sem pensar e que só atrapalha a busca.
const PREFIXOS = /^(cidade\s+de\s+|cidade\s+|de\s+|da\s+|do\s+|pra\s+|para\s+|até\s+|ate\s+)/i;

export interface TermoDeBusca {
  /// O que vai para a busca do TMS, já sem acento e sem enfeite.
  termo: string;
  /// UF quando a pessoa mandou. É o que transforma "Santa Rita" de 8 opções em 1.
  uf: string | null;
}

/// Tira acento sem depender de tabela: decompõe e joga fora os diacríticos.
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * "  de  São Paulo/sp " → { termo: 'sao paulo', uf: 'SP' }
 * "santa rita"          → { termo: 'santa rita', uf: null }
 *
 * A UF é reconhecida em qualquer separador comum — barra, hífen, vírgula ou espaço — e
 * só quando são exatamente duas letras que existem na lista. "Rio Branco AC" separa;
 * "Rio do Sul" não, porque "Sul" não é UF.
 */
export function prepararBuscaDeCidade(entrada: string): TermoDeBusca {
  let s = semAcento(String(entrada ?? '')).trim().replace(/\s+/g, ' ');
  s = s.replace(PREFIXOS, '').trim();

  let uf: string | null = null;
  // Separador explícito (/, -, ,) ou o último token solto.
  const m = s.match(/^(.*?)[\s/,-]+([A-Za-z]{2})$/);
  if (m && UFS.has(m[2].toUpperCase())) {
    uf = m[2].toUpperCase();
    s = m[1].trim();
  }

  // Pontuação de sobra nas pontas, depois de tirar a UF.
  s = s.replace(/^[\s/,-]+|[\s/,-]+$/g, '');
  return { termo: s.toLowerCase(), uf };
}

export interface CidadeDoTms {
  code: string;
  name: string;
  state: string;
}

/**
 * Aplica a UF que a pessoa mandou sobre o que o TMS devolveu.
 *
 * Filtrar aqui e não na chamada: se a busca do TMS ignorar o parâmetro de estado (não sei
 * se ela aceita), o filtro ainda vale. E se sobrar nada depois de filtrar, devolve a
 * lista ORIGINAL — some com tudo seria pior que mostrar opções de outros estados.
 */
export function filtrarPorUf(cidades: readonly CidadeDoTms[], uf: string | null): CidadeDoTms[] {
  if (!uf) return [...cidades];
  const filtradas = cidades.filter((c) => (c.state ?? '').toUpperCase() === uf);
  return filtradas.length ? filtradas : [...cidades];
}

/// Teto do menu. Vinte opções ninguém lê no WhatsApp; cinco cabem na tela e decidem.
export const MAX_OPCOES = 5;
