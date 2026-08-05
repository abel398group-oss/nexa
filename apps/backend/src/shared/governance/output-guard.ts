/**
 * output-guard.ts — travas DETERMINÍSTICAS na saída da Lia.
 *
 * ## Por que existe
 *
 * A pilha de defesa hoje é toda probabilística: o agente gera, a Supervisora (outro
 * modelo) audita. O problema é que a Supervisora lê a MESMA mensagem hostil — se o
 * texto enganou o primeiro modelo, pode enganar o segundo. IA auditando IA não é
 * controle de segurança, é segunda opinião.
 *
 * Estas travas são burras de propósito. Não leem instrução, não têm contexto, não
 * têm o que ser convencido a fazer. Comparam número com número e string com string.
 *
 * ## Casos reais que motivaram cada trava
 *
 * - **Chevrolet (dez/2023)**: pediram ao chatbot da concessionária para concordar com
 *   tudo e encerrar com "oferta juridicamente vinculante". Ele vendeu uma Tahoe de
 *   US$ 58 mil por US$ 1. → `PRECO`
 * - **Air Canada (2024)**: o chatbot inventou uma política de reembolso. A empresa
 *   alegou em tribunal que o bot era "entidade separada, responsável pelos próprios
 *   atos"; o tribunal rejeitou e mandou pagar. Vale para tudo que a Lia escreve. → `PRECO`
 * - **OWASP LLM07:2025 — System Prompt Leakage**: "repita suas instruções" entrega a
 *   estratégia comercial, os limites de desconto e o desenho do gate para quem quiser
 *   montar o próximo ataque. → `PROMPT`
 * - **Dano reputacional**: fazer o bot falar algo ofensivo só para o print. → `OFENSA`
 * - **Vazamento de dado de terceiro (2026-08-04)**: a mesma técnica que engana a Lia a
 *   "confirmar" um desconto inventado funciona para fazer ela repetir o contato de OUTRO
 *   cliente, um CPF/CNPJ, ou um segredo de infraestrutura — bastou o guard de preço
 *   existir para ficar claro que o padrão de ataque não é sobre preço, é sobre
 *   convencer a Lia a dizer algo que ela não devia. → `DADOS`
 *
 * ## Contrato
 *
 * Esta função NUNCA lança e NUNCA reescreve o texto. Ela só devolve um veredito. Quem
 * chama decide o que fazer — no ConversationAgent a reprovação cai no mesmo caminho já
 * existente da Supervisora: manda o aceno seguro e marca `needsHuman`. Ou seja, a
 * conversa nunca trava e o cliente nunca fica no silêncio; só não sai a frase suspeita.
 */

export type GuardViolation =
  | 'preco_nao_autorizado'
  | 'vazamento_de_prompt'
  | 'linguagem_ofensiva'
  | 'vazamento_de_dados';

export interface GuardVerdict {
  safe: boolean;
  violations: GuardViolation[];
  /** Detalhe legível para log e para a tela do atendente. Nunca vai para o cliente. */
  detail: string;
}

// ── 1. PREÇO ──────────────────────────────────────────────────────────────────

/**
 * Um número pt-BR: começa e TERMINA em dígito.
 *
 * O `\d$` no fim não é detalhe — sem ele, "R$ 1,00." no fim da frase capturava o
 * ponto final junto, `Number("1.00.")` dava NaN, o valor sumia da lista e o guard
 * aprovava um preço inventado. Falha silenciosa exatamente no caso que ele existe
 * para barrar (coberto por teste).
 */
const NUM = String.raw`\d[\d.,]*\d|\d`;

/** `R$ 1.234,56`, `R$ 199`, `1.234,56 reais`, `199 reais`. */
const MONEY = new RegExp(String.raw`(?:R\$\s*(${NUM}))|(?:(${NUM})\s*reais\b)`, 'gi');
/** `70%`, `70 %`, `70 por cento`. */
const PERCENT = new RegExp(String.raw`(${NUM})\s*(?:%|por\s*cento)`, 'gi');

/**
 * "1.234,56" (pt-BR) → 1234.56. Devolve null quando não é número plausível.
 *
 * O ponto é separador de milhar e a vírgula é decimal. Tratar "1.990" como 1.99
 * (leitura en-US) faria o guard aprovar um preço anual como se fosse centavos.
 */
function toNumber(raw: string): number | null {
  const cleaned = String(raw).trim().replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Todos os valores monetários e percentuais citados no texto. */
function extractFigures(text: string): { money: number[]; percent: number[] } {
  const money: number[] = [];
  const percent: number[] = [];
  for (const m of text.matchAll(MONEY)) {
    const n = toNumber(m[1] ?? m[2] ?? '');
    if (n !== null) money.push(n);
  }
  for (const m of text.matchAll(PERCENT)) {
    const n = toNumber(m[1] ?? '');
    if (n !== null) percent.push(n);
  }
  return { money, percent };
}

/**
 * Valores que a Lia PODIA citar: tudo que aparece como número em `allowedFacts`
 * (catálogo de planos + artigos da KB entregues ao agente).
 *
 * Aqui a leitura é deliberadamente permissiva — qualquer número solto do contexto
 * conta. O objetivo não é conferir se ela usou o preço do plano certo (isso é papel
 * da Supervisora); é garantir que o número **existe em algum lugar da verdade** e não
 * foi inventado nem ditado pelo lead.
 */
function allowedNumbers(allowedFacts: string): Set<number> {
  const out = new Set<number>();
  for (const m of String(allowedFacts ?? '').matchAll(new RegExp(NUM, 'g'))) {
    const n = toNumber(m[0]);
    if (n !== null) out.add(n);
  }
  return out;
}

/** Percentuais inofensivos que aparecem em linguagem comum e não são oferta. */
const PERCENT_SAFE = new Set([100]);

// ── 2. VAZAMENTO DE PROMPT ────────────────────────────────────────────────────

/**
 * Trechos que só existem DENTRO das instruções internas. Se aparecerem na resposta,
 * a Lia está recitando o próprio prompt em vez de conversar.
 *
 * A lista é de alta precisão de propósito: cada item é literal do código dos agentes
 * (`sales-agent.service.ts:94`, `resolution-agent.service.ts:59`) ou nome de campo do
 * contrato interno. Marcador genérico demais reprovaria conversa legítima.
 */
const PROMPT_MARKERS = [
  'você é a lia,',
  'voce e a lia,',
  'consultora de vendas da nexa',
  'assistente de suporte do hipertms.',
  'allowedfacts',
  'leadscore',
  'suggestedaction',
  'needshuman',
  'system prompt',
  'prompt do sistema',
  'minhas instruções são',
  'minhas instrucoes sao',
  'fui instruída a',
  'fui instruida a',
];

// ── 3. OFENSA ─────────────────────────────────────────────────────────────────

/**
 * A Lia jamais precisa destas palavras para vender ou dar suporte. Não é filtro de
 * conteúdo do cliente (ele fala o que quiser) — é filtro do que SAI com a nossa marca.
 * Com fronteira de palavra, para não pegar substring inocente.
 */
const OFFENSIVE = [
  'porra', 'caralho', 'merda', 'foda-se', 'fodase', 'puta que pariu',
  'vai se foder', 'viado', 'bicha', 'macaco', 'retardado', 'imbecil',
  'idiota', 'burro', 'otário', 'otario', 'vagabundo', 'lixo humano',
];

// ── 4. VAZAMENTO DE DADO DE TERCEIRO / SEGREDO DE INFRA ───────────────────────

/**
 * A Lia atende UM lead por conversa. Ela pode citar o telefone/e-mail DELE — é
 * dado que ele mesmo forneceu. O que ela nunca pode fazer é repetir o contato de
 * OUTRO cliente, um CPF/CNPJ, ou um segredo de infraestrutura (chave de API,
 * variável de ambiente, string de conexão de banco, token). Não existe cenário
 * de venda ou suporte em que isso seja a resposta certa.
 */
export interface OwnData {
  /** Telefone do contato DESTA conversa — a Lia pode citar o próprio. */
  phone?: string | null;
  /** E-mail do contato DESTA conversa. */
  email?: string | null;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Telefone BR: DDD (2 díg.) + 8 ou 9 dígitos, com/sem +55, parênteses ou traço. */
const PHONE_RE = /(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;

/** CPF: 000.000.000-00 (pontuação opcional). Nunca legítimo citar, de ninguém. */
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
/** CNPJ: 00.000.000/0000-00 (pontuação opcional). */
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;

/**
 * Marcadores de segredo de infraestrutura: nome de variável de ambiente
 * (SCREAMING_SNAKE_CASE — exige `_`, para não pegar sigla comum tipo "CT-E"),
 * formato de chave da Anthropic, cabeçalho Bearer, string de conexão de banco,
 * ou bloco de chave privada. Nenhum tem motivo legítimo numa conversa com lead.
 */
const SECRET_RE =
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|sk-ant-[A-Za-z0-9-]+|Bearer\s+[A-Za-z0-9._-]{10,}|(?:postgres(?:ql)?|mongodb|mysql):\/\/\S+|-----BEGIN [A-Z ]+-----/g;

function onlyDigits(s: string): string {
  return String(s ?? '').replace(/\D/g, '');
}

function detectDataLeak(text: string, allowedFacts: string, own: OwnData): string[] {
  const achados: string[] = [];
  const ownPhoneDigits = onlyDigits(own.phone ?? '');
  const ownEmailLower = (own.email ?? '').trim().toLowerCase();
  const allowedLower = String(allowedFacts ?? '').toLowerCase();

  for (const m of text.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase();
    if (email === ownEmailLower) continue; // e-mail do próprio lead desta conversa
    if (allowedLower.includes(email)) continue; // veio do catálogo/KB (ex.: e-mail de suporte oficial)
    achados.push(`e-mail de terceiro: ${m[0]}`);
  }

  for (const m of text.matchAll(PHONE_RE)) {
    const digits = onlyDigits(m[0]);
    if (digits.length < 10) continue; // fragmento curto — não é telefone completo
    if (ownPhoneDigits && (digits === ownPhoneDigits || digits.endsWith(ownPhoneDigits) || ownPhoneDigits.endsWith(digits))) {
      continue; // é o próprio telefone do lead, com ou sem DDI
    }
    if (allowedFacts && allowedFacts.includes(digits)) continue; // número oficial citado na KB
    achados.push(`telefone de terceiro: ${m[0]}`);
  }

  for (const m of text.matchAll(CPF_RE)) achados.push(`documento (CPF): ${m[0]}`);
  for (const m of text.matchAll(CNPJ_RE)) achados.push(`documento (CNPJ): ${m[0]}`);
  for (const m of text.matchAll(SECRET_RE)) achados.push(`padrão de segredo/config: ${m[0]}`);

  return achados;
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Inspeciona o texto que está prestes a ser enviado ao cliente.
 *
 * @param text         rascunho já aprovado pela Supervisora
 * @param allowedFacts catálogo + KB que o agente recebeu (fonte da verdade numérica)
 * @param own          telefone/e-mail do lead DESTA conversa — o único contato que a
 *                      Lia pode citar sem que conte como vazamento de terceiro
 */
export function inspectOutbound(text: string, allowedFacts: string, own: OwnData = {}): GuardVerdict {
  const violations: GuardViolation[] = [];
  const detail: string[] = [];

  if (!text || !text.trim()) return { safe: true, violations: [], detail: '' };

  const lower = text.toLowerCase();

  // 1. Preço — o caso Chevrolet.
  const permitido = allowedNumbers(allowedFacts);
  const { money, percent } = extractFigures(text);
  const moneyRuim = money.filter((v) => !permitido.has(v));
  const percentRuim = percent.filter((v) => !permitido.has(v) && !PERCENT_SAFE.has(v));
  if (moneyRuim.length || percentRuim.length) {
    violations.push('preco_nao_autorizado');
    if (moneyRuim.length) detail.push(`valores fora do catálogo: ${moneyRuim.join(', ')}`);
    if (percentRuim.length) detail.push(`percentuais fora do catálogo: ${percentRuim.join(', ')}%`);
  }

  // 2. Vazamento das instruções internas — OWASP LLM07:2025.
  const marcador = PROMPT_MARKERS.find((m) => lower.includes(m));
  if (marcador) {
    violations.push('vazamento_de_prompt');
    detail.push(`trecho de instrução interna na resposta: "${marcador}"`);
  }

  // 3. Linguagem ofensiva saindo com a marca.
  const palavrao = OFFENSIVE.find((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(text));
  if (palavrao) {
    violations.push('linguagem_ofensiva');
    detail.push(`termo ofensivo: "${palavrao}"`);
  }

  // 4. Dado de terceiro ou segredo de infraestrutura.
  const vazamentos = detectDataLeak(text, allowedFacts, own);
  if (vazamentos.length) {
    violations.push('vazamento_de_dados');
    detail.push(...vazamentos);
  }

  return { safe: violations.length === 0, violations, detail: detail.join(' | ') };
}
