/**
 * Template HTML dos e-mails da Lia (campanha + resposta na conversa).
 *
 * Identidade da marca — fonte: hipertms_v12/marketing-social/README.md
 *   laranja  #FF5A1F (primária)   grafite  #16181D (texto)
 *   off-white #FAFAF9             fundo    #FFF3ED
 *   Logo: wordmark SÓ TEXTO "HiperTMS" — "Hiper" grafite + "TMS" laranja.
 *
 * DOIS LAYOUTS (10/08/2026)
 * ────────────────────────
 * `simples` — cartão discreto, sem faixa e sem botão. É o PADRÃO e é o que sai no
 *   primeiro contato frio. Faixa colorida, botão e rodapé com endereço são
 *   exatamente os marcadores que o Gmail usa para separar e-mail em massa de
 *   e-mail pessoal; em prospecção fria isso significa a aba Promoções, que na
 *   prática é o mesmo que não ter chegado.
 * `marca` — faixa cheia, botão de ação e rodapé. Para quem JÁ te conhece: lead
 *   que respondeu, cliente na base, novidade de produto. Aí a marca ajuda em vez
 *   de levantar suspeita, e o botão faz sentido porque existe link para mandar.
 *
 * Quem escolhe é o chamador (ver EmailCampaignSenderService), não este arquivo.
 *
 * Restrições de e-mail que ditam o formato (não são preferência):
 *   • Layout em <table>: Outlook não suporta flex/grid.
 *   • CSS inline: Gmail remove <style> em boa parte dos casos. Por isso o tema
 *     CLARO vive inteiro no inline, e o <style> só ACRESCENTA o tema escuro —
 *     cliente que descarta o bloco continua vendo o e-mail claro, como antes.
 *   • Zero imagem e zero webfont: a maioria dos clientes bloqueia por padrão, e o
 *     wordmark é texto — renderiza igual com imagens desligadas. Fonte é a stack
 *     do sistema; Baloo 2 não carrega em e-mail.
 *   • Sempre multipart (text + html): cliente sem HTML recebe o texto puro.
 */

import { signatureHtml, type Signature } from './email-signature';

const LARANJA = '#FF5A1F';
const GRAFITE = '#16181D';
const FUNDO = '#FFF3ED';
const TEXTO = '#2B2F36';
const SUAVE = '#8A9099';
// Borda do cartão. Existe porque box-shadow NÃO renderiza em boa parte dos clientes
// de e-mail (Outlook, Gmail em várias combinações): sem uma borda de verdade o cartão
// branco encostava no fundo claro e o escuro no fundo escuro, e o e-mail chegava sem
// contorno nenhum — visto nos dois temas em 10/08/2026.
const BORDA = '#E8DFD6';

// Paleta do tema escuro. Não é a clara invertida: o fundo é quente (puxa para o
// laranja da marca) e o texto para de ser branco puro, que "vibra" sobre escuro.
const D_FUNDO = '#17140F';
const D_CARTAO = '#211D18';
const D_RODAPE = '#1B1813';
const D_FORTE = '#F2EDE7';
const D_CORPO = '#DED7CF';
const D_SUAVE = '#9A9088';
const D_LINHA = '#322C25';

/** Escapa para inserção segura em HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Clareia um hex misturando com branco.
 *
 * O laranja da marca tem contraste suficiente sobre branco e insuficiente sobre
 * o fundo escuro. Em vez de fixar uma segunda cor de marca — que teria de ser
 * mantida em dois lugares e para cada mercado —, a versão escura é derivada da
 * primária. Vale para qualquer cor de parceiro, sem cadastro extra.
 */
export function clarear(hex: string, fator = 0.18): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const canal = (deslocamento: number) => {
    const v = (n >> deslocamento) & 0xff;
    return Math.round(v + (255 - v) * fator);
  };
  return `#${[canal(16), canal(8), canal(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Como o link APARECE no corpo — o endereço, sem o rastreio pendurado.
 *
 * O link da campanha sai marcado com `utm_medium`, `utm_campaign` e `ref`, o que é
 * necessário para saber quem clicou (ver campaign-link.ts) e o deixa com uns 110
 * caracteres. Cortar a URL no caractere 45 produzia coisas como
 * `https://hipertms.com.br/planos?utm_medium=email&utm_camp…`, que não é endereço
 * nenhum: é um pedaço de string que o leitor não reconhece e não consegue conferir.
 *
 * O rótulo passa a ser DOMÍNIO + CAMINHO — `hipertms.com.br/planos`. O `href`
 * continua levando tudo, então o rastreio não muda.
 *
 * Regra de segurança que dita o resto do desenho: o rótulo SEMPRE começa pelo
 * domínio real do destino, e o que se corta é o fim do caminho. Um rótulo que
 * pudesse mostrar um domínio e levar a outro é a definição de link enganoso — o
 * mesmo motivo pelo qual encurtador público é bloqueado pelos provedores.
 */
export function rotuloDeLink(url: string, max = 42): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.length > max ? `${url.slice(0, max - 1)}…` : url;
  }

  const host = u.hostname.replace(/^www\./, '');
  const caminho = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
  const inteiro = `${host}${caminho}`;
  if (inteiro.length <= max) return inteiro;

  // Estoura: corta o CAMINHO, nunca o domínio. Domínio pela metade seria pior que
  // o corte antigo — daria a entender outro destino.
  const sobra = max - host.length - 1;
  return sobra > 3 ? `${host}${caminho.slice(0, sobra - 1)}…` : host;
}

/**
 * Corpo em texto → parágrafos HTML.
 */
function corpoParaHtml(texto: string, cor: string = LARANJA): string {
  const URL_RE = /https?:\/\/[^\s<]+/g;

  // A URL é separada ANTES do escape. Escapar o parágrafo inteiro primeiro
  // transformaria o `&` de um query param em `&amp;` e o escape do href aplicaria
  // um segundo passe (`&amp;amp;`), quebrando o link — cada trecho é escapado
  // exatamente uma vez.
  const linhaParaHtml = (linha: string): string => {
    let out = '';
    let cursor = 0;
    for (const m of linha.matchAll(URL_RE)) {
      const url = m[0];
      out += esc(linha.slice(cursor, m.index));
      out += `<a href="${esc(url)}" class="c-accent" style="color:${cor};text-decoration:underline;">${esc(rotuloDeLink(url))}</a>`;
      cursor = (m.index ?? 0) + url.length;
    }
    return negrito(out + esc(linha.slice(cursor)));
  };

  /**
   * `**assim**` vira negrito de verdade.
   *
   * Os planos de campanha são escritos em markdown, e quem escreve marca a frase
   * que quer destacar do jeito que o editor mostra. Sem esta conversão o lead
   * recebia os asteriscos crus — "existe uma **tabela pronta**" —, que anuncia
   * texto copiado de outro lugar logo na frase que era para ser a mais forte.
   *
   * Roda DEPOIS do escape, sobre o HTML já seguro: os `*` não são caracteres
   * escapáveis, então sobrevivem intactos ao `esc`, e a tag entra sem reabrir
   * caminho para injeção. Um asterisco solto (`2*3`) não casa — o par é exigido.
   */
  function negrito(html: string): string {
    return html.replace(/\*\*(?=\S)([^*]+?)\*\*/g, '<strong>$1</strong>');
  }

  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p class="c-corpo" style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${TEXTO};">` +
        p.split('\n').map(linhaParaHtml).join('<br />') +
        '</p>',
    )
    .join('');
}

/** Só saudação, sem conteúdo — não serve como preheader. */
const SO_SAUDACAO = /^(bom dia|boa tarde|boa noite|ol[áa]|oi|prezad[oa]s?|caro|caros)[\s!,.…]*$/i;

/**
 * Primeira linha da mensagem que realmente diz algo, para o preheader.
 *
 * "Boa tarde!" é a primeira linha de praticamente todo e-mail nosso e não informa
 * nada — usá-la como preheader desperdiça a única frase que o destinatário lê antes
 * de decidir abrir. Então salta as saudações e pega a linha seguinte.
 */
export function primeiraLinhaUtil(body: string, max = 110): string {
  const linhas = (body ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const escolhida = linhas.find((l) => !SO_SAUDACAO.test(l)) ?? linhas[0] ?? '';
  return escolhida.length > max ? `${escolhida.slice(0, max - 1)}…` : escolhida;
}

/**
 * Marca do MERCADO no e-mail (ADR 037).
 *
 * Ausente = HiperTMS, que é o comportamento de sempre. Mercado de parceiro sem isto
 * sairia com o wordmark do HiperTMS na frente do lead dele — o erro mais visível que
 * a operação multi-mercado pode cometer.
 */
export interface EmailBrand {
  /** Nome exibido. Duas palavras coladas ("HiperTMS") ganham a segunda em destaque. */
  name: string;
  /** Cor primária (faixa, links). Só hex — valor inválido cai no laranja padrão. */
  color?: string | null;
  /** Linha curta embaixo do nome. Vazio = sem linha. */
  tagline?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Separa "HiperTMS" em "Hiper" + "TMS" para o destaque do wordmark.
 *
 * A regra é a maiúscula no meio da palavra, que é como a marca do HiperTMS é escrita.
 * Nome sem isso ("Pneus Brasil") destaca a última palavra. Nome de uma palavra só sai
 * inteiro, sem destaque — inventar uma quebra ficaria pior que não ter.
 */
export function partirWordmark(nome: string): { inicio: string; destaque: string } {
  const camel = nome.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zá-ú]+)([A-Z].*)$/);
  if (camel) return { inicio: camel[1], destaque: camel[2] };

  const partes = nome.trim().split(/\s+/);
  if (partes.length > 1) {
    return { inicio: `${partes.slice(0, -1).join(' ')} `, destaque: partes[partes.length - 1] };
  }
  return { inicio: nome, destaque: '' };
}

/** Ver o cabeçalho do arquivo: `simples` é frio, `marca` é para quem já te conhece. */
export type EmailLayout = 'simples' | 'marca';

export interface EmailTemplateInput {
  /** Corpo da mensagem, em texto puro. */
  body: string;
  /** Marca do mercado. Ausente = HiperTMS. */
  brand?: EmailBrand;
  /** URL de descadastro (obrigatória em e-mail de marketing — LGPD). */
  optOutUrl: string;
  /** Convite de WhatsApp, quando o lead está qualificado. */
  whatsappUrl?: string;
  /** Assinatura. Ausente → resolvida do ambiente (ver email-signature.ts). */
  signature?: Signature;
  /** Padrão `simples`. Ver o cabeçalho do arquivo. */
  layout?: EmailLayout;
  /** Botão de ação. Só aparece no layout `marca` — em e-mail frio não existe botão. */
  ctaUrl?: string;
  ctaLabel?: string;
}

/**
 * Bloco <style> com o tema ESCURO.
 *
 * Só acrescenta: o tema claro está todo no inline, então cliente que remove
 * `<style>` (Gmail em vários casos) mostra exatamente o que mostrava antes. Quem
 * suporta — Apple Mail, Outlook.com, Gmail no iOS — para de inverter as cores por
 * conta própria, que era o que deixava o e-mail com aparência de acidente.
 */
function estiloTemaEscuro(cor: string): string {
  const corClara = clarear(cor);
  return `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .c-bg     { background:${D_FUNDO} !important; }
    .c-card   { background:${D_CARTAO} !important; }
    .c-rodape { background:${D_RODAPE} !important; }
    .c-forte  { color:${D_FORTE} !important; }
    .c-corpo  { color:${D_CORPO} !important; }
    .c-suave  { color:${D_SUAVE} !important; }
    .c-accent { color:${corClara} !important; }
    .c-linha  { border-color:${D_LINHA} !important; }
    /* A borda do cartão precisa de um tom PRÓPRIO no escuro: a borda clara
       (#E8DFD6) sobre fundo escuro viraria um contorno branco gritando, e o
       #322C25 das divisórias internas desapareceria contra o cartão. Este fica
       entre os dois — visível, sem chamar atenção. */
    .c-borda  { border-color:#3A332B !important; }
  }`;
}

/** Cabeçalho comum: preheader escondido + abertura do documento. */
function abertura(marcaNome: string, preheader: string, cor: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${esc(marcaNome)}</title>
<style>${estiloTemaEscuro(cor)}</style>
</head>
<body style="margin:0;padding:0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${'&nbsp;&zwnj;'.repeat(60)}</div>`;
}

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Monta o HTML completo.
 *
 * O link de descadastro fica no RODAPÉ EXTERNO ao card (layout `simples`) ou na
 * barra do rodapé (`marca`): presente e clicável (exigência legal), sem competir
 * com a mensagem. O link cru de ~90 caracteres que aparecia antes chamava mais
 * atenção que a própria oferta.
 */
export function renderEmailHtml(input: EmailTemplateInput): string {
  // Marca do mercado; ausente = HiperTMS (ADR 037). Cor inválida cai no padrão em vez
  // de vazar string arbitrária para dentro de um atributo style.
  const marca = input.brand ?? { name: 'HiperTMS', color: LARANJA, tagline: 'O TMS feito para vender frete.' };
  const cor = marca.color && HEX.test(marca.color) ? marca.color : LARANJA;

  // PREHEADER — o trecho que o cliente de e-mail mostra na lista, ao lado do
  // assunto. É a primeira linha REAL da mensagem, não a punchline da marca.
  //
  // Antes trazia a punchline, que também aparece visível embaixo do wordmark. O
  // Gmail concatena preheader + texto visível, então o resumo na lista saía com a
  // mesma frase duas vezes — justamente na única linha que o destinatário lê antes
  // de decidir abrir. Confirmado no texto citado numa resposta real (08/08/2026).
  //
  // A explicação fica AQUI e não num comentário HTML: comentário no template viaja
  // dentro de cada e-mail enviado, e raciocínio interno nosso não tem por que
  // chegar ao lead. Foi o que aconteceu na primeira versão desta correção.
  const preheader = primeiraLinhaUtil(input.body);

  return input.layout === 'marca'
    ? layoutMarca(input, marca, cor, preheader)
    : layoutSimples(input, marca, cor, preheader);
}

/** Botão de ação. Vazio quando não há link — e em e-mail frio nunca há. */
function botao(url: string | undefined, rotulo: string | undefined, cor: string): string {
  if (!url) return '';
  return `<tr><td style="padding:6px 32px 4px;">
         <a href="${esc(url)}"
            style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;
                   font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">
           ${esc(rotulo || 'Saiba mais')}
         </a>
       </td></tr>`;
}

/**
 * `simples` — o primeiro contato.
 *
 * Espaçamento de 30px entre marca, corpo e assinatura (eram 20 e 8): o texto vinha
 * colado no wordmark e o bloco inteiro parecia um aviso, não uma mensagem.
 */
function layoutSimples(input: EmailTemplateInput, marca: EmailBrand, cor: string, preheader: string): string {
  const corpo = corpoParaHtml(input.body, cor);
  const { inicio, destaque } = partirWordmark(marca.name);

  const blocoWhatsapp = input.whatsappUrl
    ? `<tr><td style="padding:4px 32px 24px;">
         <a href="${esc(input.whatsappUrl)}"
            style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;
                   font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">
           Falar no WhatsApp
         </a>
       </td></tr>`
    : '';

  return `${abertura(marca.name, preheader, cor)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       class="c-bg" style="background:${FUNDO};padding:32px 12px;">
  <tr>
    <td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             class="c-card c-borda"
             style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;
                    border:1px solid ${BORDA};
                    box-shadow:0 1px 3px rgba(22,24,29,.08);font-family:${FONTE};">

        <!-- Faixa da marca -->
        <tr><td style="height:4px;background:${cor};line-height:4px;font-size:0;">&nbsp;</td></tr>

        <!-- Wordmark + punchline -->
        <tr>
          <td style="padding:30px 32px 0;">
            <div class="c-forte" style="font-size:22px;font-weight:700;letter-spacing:-.4px;color:${GRAFITE};">
              ${esc(inicio)}${destaque ? `<span class="c-accent" style="color:${cor};font-weight:800;">${esc(destaque)}</span>` : ''}
            </div>
            ${marca.tagline ? `<div class="c-suave" style="margin-top:3px;font-size:12px;color:${SUAVE};">${esc(marca.tagline)}</div>` : ''}
          </td>
        </tr>

        <!-- Corpo -->
        <tr><td style="padding:30px 32px 0;">${corpo}</td></tr>

        ${blocoWhatsapp}

        <!-- Assinatura (configurável — ver email-signature.ts) -->
        <tr>
          <td style="padding:30px 32px 30px;">${signatureHtml(input.signature, cor)}</td>
        </tr>
      </table>

      <!-- Descadastro: fora do card, discreto, mas clicável (LGPD) -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;">
        <tr>
          <td align="center" style="padding:14px 16px 0;font-family:${FONTE};">
            <a href="${esc(input.optOutUrl)}" class="c-suave"
               style="font-size:11px;color:#B4B0AC;text-decoration:underline;">Cancelar e-mails</a>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * `marca` — para quem já te conhece.
 *
 * Faixa cheia, botão e barra de rodapé. Os três são marcadores de e-mail em massa
 * para o classificador do Gmail, e é por isso que este layout NÃO é o do primeiro
 * contato — ver o cabeçalho do arquivo.
 */
function layoutMarca(input: EmailTemplateInput, marca: EmailBrand, cor: string, preheader: string): string {
  const corpo = corpoParaHtml(input.body, cor);

  // Na faixa cheia o wordmark sai em branco, inteiro: o destaque em duas cores
  // depende de contraste com fundo claro e some sobre a cor da marca.
  const blocoWhatsapp = input.whatsappUrl
    ? `<tr><td style="padding:4px 32px 8px;">
         <a href="${esc(input.whatsappUrl)}" class="c-accent"
            style="font-size:14px;font-weight:600;color:${cor};text-decoration:underline;">
           Falar no WhatsApp
         </a>
       </td></tr>`
    : '';

  return `${abertura(marca.name, preheader, cor)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       class="c-bg" style="background:#F3EFEA;padding:32px 12px;">
  <tr>
    <td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             class="c-card"
             style="width:100%;max-width:600px;background:#FFFFFF;border-radius:10px;overflow:hidden;
                    font-family:${FONTE};">

        <!-- Faixa da marca -->
        <tr>
          <td style="background:${cor};padding:22px 32px;">
            <div style="font-size:21px;font-weight:800;letter-spacing:-.3px;color:#FFFFFF;">${esc(marca.name)}</div>
            ${marca.tagline ? `<div style="margin-top:2px;font-size:12px;color:rgba(255,255,255,.82);">${esc(marca.tagline)}</div>` : ''}
          </td>
        </tr>

        <!-- Corpo -->
        <tr><td style="padding:30px 32px 0;">${corpo}</td></tr>

        ${botao(input.ctaUrl, input.ctaLabel, cor)}
        ${blocoWhatsapp}

        <!-- Assinatura -->
        <tr>
          <td style="padding:26px 32px 28px;">${signatureHtml(input.signature, cor)}</td>
        </tr>

        <!-- Barra do rodapé: descadastro sempre visível (LGPD) -->
        <tr>
          <td class="c-rodape" align="center"
              style="background:#FAF7F4;padding:13px 32px;font-size:11px;color:#A9A39C;">
            <span class="c-suave" style="color:#A9A39C;">${esc(marca.name)}</span>
            <span class="c-suave" style="color:#A9A39C;"> · </span>
            <a href="${esc(input.optOutUrl)}" class="c-suave"
               style="color:#A9A39C;text-decoration:underline;">Cancelar e-mails</a>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
