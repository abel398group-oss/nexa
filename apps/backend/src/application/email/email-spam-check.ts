/**
 * Peneira de conteúdo antes do disparo — o que os filtros do Gmail/Outlook olham
 * ANTES de decidir entre Caixa de entrada, Promoções e Spam.
 *
 * Divisão proposital em dois níveis:
 *
 *  • BLOQUEIO — só para o que é rejeição praticamente certa. Hoje: encurtador de
 *    link. O Gmail bloqueia por associação com phishing, então o e-mail não cai em
 *    Promoções: ele não chega. Deixar passar como aviso seria fingir escolha onde
 *    não há.
 *  • AVISO — tudo o mais. Assunto em CAIXA ALTA, excesso de pontuação, palavras de
 *    gatilho, texto curto demais, links demais. Cada um SOBE o score de spam sem
 *    condenar o e-mail, e o operador tem contexto que o código não tem (o nome do
 *    produto pode conter uma palavra da lista). Quem decide é ele — mas vendo.
 *
 * O que existia antes: uma lista de 12 substrings, aplicada só ao assunto, cujo
 * resultado ia para um `logger.warn()` que ninguém lê. O cabeçalho do arquivo
 * afirmava que MAIÚSCULAS e pontuação eram barradas; não eram.
 */

/** Gatilhos clássicos de spam comercial. Comparados sem acento e sem caixa. */
const PALAVRAS_GATILHO = [
  'gratis', 'gratuito', 'promocao', 'oferta', 'ganhe', 'lucre', 'lucro facil',
  '100%', 'urgente', 'clique aqui', 'compre agora', 'imperdivel', 'so hoje',
  'ultima chance', 'desconto exclusivo', 'dinheiro', 'renda extra', 'sem custo',
];

/**
 * Encurtadores públicos. A lista cobre os comuns no Brasil; o teste é por domínio
 * do link, não por substring solta, senão "bit.ly" dentro de uma palavra qualquer
 * derrubaria a campanha.
 */
const ENCURTADORES = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 't.co', 'is.gd', 'cutt.ly',
  'rebrand.ly', 'shorturl.at', 'encurtador.com.br', 'bitly.com', 'lnkd.in',
];

const URL_RE = /https?:\/\/([^\s/<>"')]+)/gi;

/** Remove acento e caixa — "PROMOÇÃO" e "promocao" são o mesmo gatilho. */
function achatar(s: string): string {
  // U+0300–U+036F = marcas diacríticas combinantes, que o NFD separa da letra.
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Domínios dos links presentes no texto, em minúsculas e sem `www.`. */
export function dominiosDosLinks(texto: string): string[] {
  return [...(texto ?? '').matchAll(URL_RE)].map((m) => m[1].toLowerCase().replace(/^www\./, ''));
}

/** Links encurtados encontrados — vazio quando não há. Ver ENCURTADORES. */
export function encurtadoresEncontrados(...textos: string[]): string[] {
  const achados = new Set<string>();
  for (const t of textos) {
    for (const dom of dominiosDosLinks(t)) {
      if (ENCURTADORES.some((e) => dom === e || dom.endsWith(`.${e}`))) achados.add(dom);
    }
  }
  return [...achados];
}

/** Proporção de letras maiúsculas entre as letras do texto (0–1). */
function proporcaoMaiusculas(texto: string): number {
  const letras = texto.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (letras.length < 8) return 0; // amostra pequena demais para concluir
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
  return maiusculas / letras.length;
}

/**
 * Avisos de conteúdo. Lista vazia = nada a apontar.
 *
 * `corpo` é opcional porque o assunto sozinho também é analisado em outros pontos,
 * mas o filtro do provedor lê os dois — sempre que houver corpo, passe-o.
 */
export function avisosDeSpam(assunto: string, corpo = ''): string[] {
  const avisos: string[] = [];
  const assuntoPlano = achatar(assunto ?? '');
  const corpoPlano = achatar(corpo ?? '');

  const noAssunto = PALAVRAS_GATILHO.filter((p) => assuntoPlano.includes(p));
  if (noAssunto.length) {
    avisos.push(`Assunto tem palavra de gatilho de spam: ${noAssunto.join(', ')}.`);
  }

  const noCorpo = PALAVRAS_GATILHO.filter((p) => corpoPlano.includes(p));
  if (noCorpo.length) {
    avisos.push(`Corpo tem palavra de gatilho de spam: ${noCorpo.join(', ')}.`);
  }

  if (proporcaoMaiusculas(assunto ?? '') > 0.6) {
    avisos.push('Assunto quase todo em CAIXA ALTA — filtros pontuam isso como spam.');
  }

  if (/[!?]{2,}/.test(assunto ?? '') || ((assunto ?? '').match(/!/g)?.length ?? 0) >= 2) {
    avisos.push('Excesso de pontuação no assunto (!! ou ?!) — pontua como spam.');
  }

  if (/\$\s*\$|\$\$\$/.test(`${assunto} ${corpo}`)) {
    avisos.push('Sequência de cifrões ($$$) — gatilho clássico de spam.');
  }

  // Primeiro contato frio: o objetivo é a resposta, não o clique. Cada link a mais
  // sobe o score e divide a atenção.
  const links = dominiosDosLinks(corpo ?? '');
  if (links.length > 2) {
    avisos.push(`${links.length} links no corpo — em prospecção fria, o ideal é no máximo 1.`);
  }

  // Corpo curto demais tem pouca "matéria" legítima para o filtro pesar e parece
  // template disparado em massa.
  const palavras = (corpo ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (corpo && palavras < 20) {
    avisos.push(`Corpo com ${palavras} palavra(s) — texto muito curto pontua como massa.`);
  }

  return avisos;
}
