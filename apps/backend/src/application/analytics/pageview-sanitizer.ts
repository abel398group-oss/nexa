/**
 * Higienização do pageview. Módulo puro, sem dependência — é a parte em que um
 * erro deixa de ser bug de métrica e passa a ser falha de segurança.
 *
 * O frontend do produto já higieniza antes de enviar, mas aqui se valida de novo:
 * o endpoint é público e anônimo, então tudo que chega é entrada não confiável, e o
 * cuidado do cliente não é garantia nenhuma.
 */
import { createHash } from 'crypto';

/**
 * Únicos parâmetros de query que sobrevivem. Tudo fora desta lista é descartado.
 *
 * Não é preferência de organização: telas como `/reset-password?token=…` e
 * `/auth/verify-email?token=…` carregam **segredo de uso único na query string**.
 * Gravar esse token numa tabela de analytics daria a quem tem leitura do painel a
 * capacidade de trocar a senha de um cliente. Lista BRANCA por isso — parâmetro
 * novo no site nasce descartado, e o erro é perder uma métrica, não vazar um token.
 */
export const QUERY_PERMITIDA = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'gclid', 'fbclid',
] as const;

/** Identificadores de clique pago — guardados juntos em `clickId`. */
const CLICK_IDS = ['gclid', 'fbclid', 'ref'] as const;

/**
 * Bots. Sem isto o Googlebot vira "visitante" e o número mente — o que é pior que
 * não ter número, porque decisão de verba seria tomada em cima dele.
 */
const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python-requests|axios|postman|facebookexternalhit|whatsapp|telegram|semrush|ahrefs|mj12|dotbot|petal|bytespider|gptbot|claudebot|ccbot|perplexity/i;

export function ehBot(userAgent?: string | null): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true; // UA ausente/curto: não é gente
  return BOT_RE.test(userAgent);
}

export interface UrlHigienizada {
  path: string;
  /** Query reduzida à allowlist, re-serializada. `null` se não sobrou nada. */
  query: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null
  clickId: string | null;
}

/** Corta em `max` caracteres — nada que venha do cliente entra no banco sem teto. */
function limitar(v: string | null | undefined, max: number): string | null {
  if (!v) return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Separa `path` e query da URL, mantendo só os parâmetros da allowlist.
 *
 * Aceita path relativo (`/signup?x=1`) e URL absoluta. Um `path` que não comece com
 * `/` é normalizado — nunca confiar no formato que o cliente mandou.
 */
export function higienizarUrl(url: string): UrlHigienizada {
  const bruto = (url ?? '').trim();
  // URL absoluta: descarta esquema e host, sobra o path. Base fictícia porque o
  // construtor exige uma; o host dela nunca é usado.
  let u: URL;
  try {
    u = new URL(bruto, 'http://x');
  } catch {
    u = new URL('/', 'http://x');
  }

  const mantidos = new URLSearchParams();
  for (const chave of QUERY_PERMITIDA) {
    const v = limitar(u.searchParams.get(chave), 200);
    if (v) mantidos.set(chave, v);
  }

  const pegar = (k: string) => limitar(mantidos.get(k), 200);
  const clickId = CLICK_IDS.map((k) => mantidos.get(k)).find(Boolean) ?? null;

  return {
    path: limitar(u.pathname, 500) ?? '/',
    query: mantidos.toString() || null,
    utmSource: pegar('utm_source'),
    utmMedium: pegar('utm_medium'),
    utmCampaign: pegar('utm_campaign'),
    utmTerm: pegar('utm_term'),
    utmContent: pegar('utm_content'),
    clickId: limitar(clickId, 200),
  };
}

/**
 * Domínio do referrer. Só o host — a URL completa de origem pode conter query com
 * dado de terceiro, e para "top origens" o host basta.
 */
export function dominioDoReferrer(referrer?: string | null): string | null {
  const r = (referrer ?? '').trim();
  if (!r) return null;
  try {
    return limitar(new URL(r).hostname.replace(/^www\./, ''), 253);
  } catch {
    return null;
  }
}

/**
 * Hash do visitante: sha256(salt do dia + ip + userAgent).
 *
 * O salt do dia é `YYYY-MM-DD` + um segredo do ambiente. Trocar de salt todo dia é
 * o que impede reconstruir a identidade a partir do hash — e é a razão pela qual
 * não precisamos de banner de consentimento.
 *
 * CONSEQUÊNCIA ACEITA: o hash não atravessa a meia-noite. "Visitantes únicos" em um
 * período é a soma dos únicos por dia, não gente distinta.
 */
export function hashVisitante(ip: string, userAgent: string, segredo: string, agora = new Date()): string {
  const dia = agora.toISOString().slice(0, 10);
  return createHash('sha256').update(`${dia}|${segredo}|${ip}|${userAgent}`).digest('hex');
}

export interface Cliente {
  browser: string | null;
  os: string | null;
  device: 'mobile' | 'tablet' | 'desktop';
}

/**
 * Navegador, sistema e tipo de dispositivo a partir do user agent.
 *
 * Deliberadamente grosseiro e sem biblioteca: a decisão que estes dados alimentam é
 * "investir em layout mobile ou desktop", e para isso a precisão de uma lib de
 * 2 MB não muda nada. A ordem dos testes importa — Edge e Opera se anunciam como
 * Chrome, e Chrome se anuncia como Safari.
 */
export function detectarCliente(userAgent: string): Cliente {
  const ua = userAgent ?? '';

  const browser =
    /edg\//i.test(ua) ? 'Edge' :
    /opr\/|opera/i.test(ua) ? 'Opera' :
    /samsungbrowser/i.test(ua) ? 'Samsung Internet' :
    /firefox|fxios/i.test(ua) ? 'Firefox' :
    /chrome|crios/i.test(ua) ? 'Chrome' :
    /safari/i.test(ua) ? 'Safari' :
    null;

  const os =
    /windows/i.test(ua) ? 'Windows' :
    /android/i.test(ua) ? 'Android' :
    /iphone|ipad|ipod/i.test(ua) ? 'iOS' :
    /mac os x|macintosh/i.test(ua) ? 'macOS' :
    /linux/i.test(ua) ? 'Linux' :
    null;

  // "ipad" e Android sem "mobile" são tablet; o resto do mundo móvel é mobile.
  const device: Cliente['device'] =
    /ipad|tablet|(android(?!.*mobile))/i.test(ua) ? 'tablet' :
    /mobi|iphone|ipod|android/i.test(ua) ? 'mobile' :
    'desktop';

  return { browser, os, device };
}
