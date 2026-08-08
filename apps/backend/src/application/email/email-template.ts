/**
 * Template HTML dos e-mails da Lia (campanha + resposta na conversa).
 *
 * Identidade da marca — fonte: hipertms_v12/marketing-social/README.md
 *   laranja  #FF5A1F (primária)   grafite  #16181D (texto)
 *   off-white #FAFAF9             fundo    #FFF3ED
 *   Logo: wordmark SÓ TEXTO "HiperTMS" — "Hiper" grafite + "TMS" laranja.
 *
 * Restrições de e-mail que ditam o formato deste arquivo (não são preferência):
 *   • Layout em <table>: Outlook não suporta flex/grid.
 *   • CSS inline: Gmail remove <style> em boa parte dos casos.
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

/** Escapa para inserção segura em HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Corpo em texto → parágrafos HTML.
 *
 * URLs viram link clicável com o texto encurtado: um link cru de 80 caracteres
 * quebra o layout no mobile e ainda pesa no score de spam.
 */
function corpoParaHtml(texto: string): string {
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
      const rotulo = url.length > 48 ? `${url.slice(0, 45)}…` : url;
      out += `<a href="${esc(url)}" style="color:${LARANJA};text-decoration:underline;">${esc(rotulo)}</a>`;
      cursor = (m.index ?? 0) + url.length;
    }
    return out + esc(linha.slice(cursor));
  };

  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${TEXTO};">` +
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

export interface EmailTemplateInput {
  /** Corpo da mensagem, em texto puro. */
  body: string;
  /** URL de descadastro (obrigatória em e-mail de marketing — LGPD). */
  optOutUrl: string;
  /** Convite de WhatsApp, quando o lead está qualificado. */
  whatsappUrl?: string;
  /** Assinatura. Ausente → resolvida do ambiente (ver email-signature.ts). */
  signature?: Signature;
}

/**
 * Monta o HTML completo.
 *
 * O link de descadastro fica no RODAPÉ EXTERNO ao card, em 11px cinza claro:
 * presente e clicável (exigência legal), sem competir com a mensagem. O link cru
 * de ~90 caracteres que aparecia antes chamava mais atenção que a própria oferta.
 */
export function renderEmailHtml(input: EmailTemplateInput): string {
  const corpo = corpoParaHtml(input.body);

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

  const blocoWhatsapp = input.whatsappUrl
    ? `<tr><td style="padding:4px 32px 24px;">
         <a href="${esc(input.whatsappUrl)}"
            style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;
                   font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">
           Falar no WhatsApp
         </a>
       </td></tr>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>HiperTMS</title>
</head>
<body style="margin:0;padding:0;background:${FUNDO};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${'&nbsp;&zwnj;'.repeat(60)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${FUNDO};padding:32px 12px;">
  <tr>
    <td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(22,24,29,.08);
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

        <!-- Faixa da marca -->
        <tr><td style="height:4px;background:${LARANJA};line-height:4px;font-size:0;">&nbsp;</td></tr>

        <!-- Wordmark + punchline -->
        <tr>
          <td style="padding:28px 32px 4px;">
            <div style="font-size:22px;font-weight:700;letter-spacing:-.4px;color:${GRAFITE};">
              Hiper<span style="color:${LARANJA};font-weight:800;">TMS</span>
            </div>
            <div style="margin-top:3px;font-size:12px;color:${SUAVE};">O TMS feito para vender frete.</div>
          </td>
        </tr>

        <!-- Corpo -->
        <tr><td style="padding:20px 32px 4px;">${corpo}</td></tr>

        ${blocoWhatsapp}

        <!-- Assinatura (configurável — ver email-signature.ts) -->
        <tr>
          <td style="padding:8px 32px 28px;">${signatureHtml(input.signature)}</td>
        </tr>
      </table>

      <!-- Descadastro: fora do card, discreto, mas clicável (LGPD) -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;">
        <tr>
          <td align="center" style="padding:14px 16px 0;
                 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <a href="${esc(input.optOutUrl)}"
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
