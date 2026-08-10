import { describe, it, expect } from 'vitest';
import {
  QUERY_PERMITIDA, detectarCliente, dominioDoReferrer, ehBot, hashVisitante, higienizarUrl,
  ipParaGravar, localizacaoDoHeader,
} from './pageview-sanitizer';

describe('higienizarUrl — allowlist de query', () => {
  // O motivo da allowlist existir. /reset-password?token=… e /auth/verify-email?token=…
  // carregam segredo de uso único na URL; gravar isso na tabela de analytics daria
  // troca de senha de cliente a quem tiver leitura do painel.
  it('DESCARTA token de reset de senha', () => {
    const r = higienizarUrl('/reset-password?token=abc123secreto&utm_source=meta');
    expect(r.query).not.toContain('token');
    expect(r.query).not.toContain('abc123secreto');
    expect(r.path).toBe('/reset-password');
    expect(r.utmSource).toBe('meta');
  });

  it('DESCARTA qualquer parâmetro fora da lista', () => {
    const r = higienizarUrl('/x?email=a@b.com&cpf=123&senha=x&code=999&utm_medium=cpc');
    for (const proibido of ['email', 'cpf', 'senha', 'code', 'a@b.com', '123']) {
      expect(r.query ?? '').not.toContain(proibido);
    }
    expect(r.utmMedium).toBe('cpc');
  });

  it('mantém exatamente os oito parâmetros permitidos', () => {
    const qs = QUERY_PERMITIDA.map((k) => `${k}=v_${k}`).join('&');
    const r = higienizarUrl(`/p?${qs}`);
    for (const k of QUERY_PERMITIDA) expect(r.query).toContain(k);
  });

  it('extrai os utm em campos próprios', () => {
    const r = higienizarUrl('/signup?utm_source=instagram&utm_medium=social&utm_campaign=ago26&utm_term=frete&utm_content=v2');
    expect(r).toMatchObject({
      path: '/signup', utmSource: 'instagram', utmMedium: 'social',
      utmCampaign: 'ago26', utmTerm: 'frete', utmContent: 'v2',
    });
  });

  it('gclid e fbclid viram clickId', () => {
    expect(higienizarUrl('/?gclid=abc').clickId).toBe('abc');
    expect(higienizarUrl('/?fbclid=xyz').clickId).toBe('xyz');
  });

  it('aceita URL absoluta e guarda só o path', () => {
    const r = higienizarUrl('https://hipertms.com.br/planos?utm_source=x');
    expect(r.path).toBe('/planos');
  });

  it('url quebrada não derruba — vira "/"', () => {
    expect(higienizarUrl('%%%').path).toBeTruthy();
    expect(higienizarUrl('').path).toBe('/');
  });

  it('sem query permitida, query fica null (não string vazia)', () => {
    expect(higienizarUrl('/planos?foo=1').query).toBeNull();
  });

  it('corta valor gigante — nada do cliente entra sem teto', () => {
    const r = higienizarUrl(`/p?utm_source=${'a'.repeat(5000)}`);
    expect(r.utmSource!.length).toBeLessThanOrEqual(200);
  });
});

describe('dominioDoReferrer', () => {
  it('guarda só o host, sem www e sem a query de origem', () => {
    expect(dominioDoReferrer('https://www.google.com/search?q=segredo')).toBe('google.com');
  });

  it('vazio ou inválido → null', () => {
    expect(dominioDoReferrer('')).toBeNull();
    expect(dominioDoReferrer('nao-e-url')).toBeNull();
    expect(dominioDoReferrer(null)).toBeNull();
  });
});

describe('ehBot', () => {
  // Sem isto o Googlebot vira "visitante" e o número mente — pior que não ter número,
  // porque decisão de verba sairia dele.
  it('reconhece crawlers conhecidos', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 AhrefsBot/7.0',
      'HeadlessChrome/120.0.0.0',
      'curl/8.4.0',
      'python-requests/2.31.0',
      'Mozilla/5.0 (compatible; SemrushBot/7~bl)',
    ]) {
      expect(ehBot(ua)).toBe(true);
    }
  });

  it('user agent ausente ou curto é bot', () => {
    expect(ehBot('')).toBe(true);
    expect(ehBot(null)).toBe(true);
    expect(ehBot('abc')).toBe(true);
  });

  it('navegador de gente passa', () => {
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    ]) {
      expect(ehBot(ua)).toBe(false);
    }
  });
});

describe('hashVisitante', () => {
  const seg = 'segredo';
  const ip = '203.0.113.9';
  const ua = 'Mozilla/5.0 Chrome/120';

  it('é estável no mesmo dia', () => {
    const a = hashVisitante(ip, ua, seg, new Date('2026-08-08T01:00:00Z'));
    const b = hashVisitante(ip, ua, seg, new Date('2026-08-08T23:00:00Z'));
    expect(a).toBe(b);
  });

  // Consequência ACEITA da escolha de privacidade: o hash não atravessa a meia-noite.
  // "Únicos" num período é a soma dos únicos diários, não gente distinta.
  it('MUDA no dia seguinte — é o que dispensa consentimento', () => {
    const a = hashVisitante(ip, ua, seg, new Date('2026-08-08T23:59:00Z'));
    const b = hashVisitante(ip, ua, seg, new Date('2026-08-09T00:01:00Z'));
    expect(a).not.toBe(b);
  });

  it('IP diferente e navegador diferente dão hashes diferentes', () => {
    const base = hashVisitante(ip, ua, seg);
    expect(hashVisitante('198.51.100.1', ua, seg)).not.toBe(base);
    expect(hashVisitante(ip, 'Firefox/121', seg)).not.toBe(base);
  });

  it('não é reversível ao IP — saída é hex de 64 e não contém o insumo', () => {
    const h = hashVisitante(ip, ua, seg);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(ip);
  });
});

describe('detectarCliente', () => {
  // A ordem dos testes importa: Edge e Opera se anunciam como Chrome, e Chrome se
  // anuncia como Safari.
  it('Edge não é confundido com Chrome', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120';
    expect(detectarCliente(ua).browser).toBe('Edge');
  });

  it('Chrome não é confundido com Safari', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/120 Safari/537.36';
    const r = detectarCliente(ua);
    expect(r.browser).toBe('Chrome');
    expect(r.os).toBe('macOS');
  });

  it('separa mobile, tablet e desktop', () => {
    expect(detectarCliente('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari').device).toBe('mobile');
    expect(detectarCliente('Mozilla/5.0 (iPad; CPU OS 17_0) Safari').device).toBe('tablet');
    expect(detectarCliente('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome Safari').device).toBe('tablet');
    expect(detectarCliente('Mozilla/5.0 (Linux; Android 14; SM-G991B) Mobile Chrome').device).toBe('mobile');
    expect(detectarCliente('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120').device).toBe('desktop');
  });

  it('user agent desconhecido não quebra', () => {
    expect(detectarCliente('xyz')).toMatchObject({ browser: null, os: null, device: 'desktop' });
  });
});

// ── IP e localização (10/08/2026) ───────────────────────────────────────────
// Pedido explicitamente pelo Abel depois de o custo jurídico ser apresentado: a
// tabela deixa de ser anônima e passa a conter dado pessoal. Ver o aviso no model.
describe('ipParaGravar', () => {
  it('guarda o IP como veio', () => {
    expect(ipParaGravar('189.45.12.7')).toBe('189.45.12.7');
  });

  // O mesmo visitante chegando por rotas diferentes não pode aparecer com dois IPs.
  it('reduz IPv6 mapeado à forma v4', () => {
    expect(ipParaGravar('::ffff:189.45.12.7')).toBe('189.45.12.7');
    expect(ipParaGravar('::FFFF:10.0.0.1')).toBe('10.0.0.1');
  });

  it('IPv6 de verdade passa inteiro', () => {
    expect(ipParaGravar('2001:db8::8a2e:370:7334')).toBe('2001:db8::8a2e:370:7334');
  });

  it('ausente ou vazio vira null, não string vazia', () => {
    expect(ipParaGravar(undefined)).toBeNull();
    expect(ipParaGravar(null)).toBeNull();
    expect(ipParaGravar('   ')).toBeNull();
  });

  // Header forjado é entrada hostil como qualquer outra.
  it('corta valor absurdamente longo', () => {
    expect(ipParaGravar('9'.repeat(500))!.length).toBe(45);
  });
});

describe('localizacaoDoHeader', () => {
  it('lê o país do Cloudflare', () => {
    expect(localizacaoDoHeader({ 'cf-ipcountry': 'BR' })).toEqual({ country: 'BR', region: null });
  });

  it('aceita os headers de outros CDNs', () => {
    expect(localizacaoDoHeader({
      'x-vercel-ip-country': 'BR',
      'x-vercel-ip-country-region': 'SP',
    })).toEqual({ country: 'BR', region: 'SP' });
  });

  // Sem CDN na frente, nulo. Localização chutada viraria decisão comercial tomada
  // em cima de invenção — pior que coluna vazia.
  it('sem header nenhum devolve nulo, não um palpite', () => {
    expect(localizacaoDoHeader({})).toEqual({ country: null, region: null });
  });

  // 'XX' e 'T1' são o que o Cloudflare manda para desconhecido e para Tor.
  it('desconhecido e Tor contam como sem localização', () => {
    expect(localizacaoDoHeader({ 'cf-ipcountry': 'XX' }).country).toBeNull();
    expect(localizacaoDoHeader({ 'cf-ipcountry': 'T1' }).country).toBeNull();
  });

  it('header repetido usa o primeiro valor', () => {
    expect(localizacaoDoHeader({ 'cf-ipcountry': ['BR', 'US'] }).country).toBe('BR');
  });

  it('corta valor longo', () => {
    expect(localizacaoDoHeader({ 'cf-ipcountry': 'A'.repeat(200) }).country!.length).toBe(60);
  });
});
