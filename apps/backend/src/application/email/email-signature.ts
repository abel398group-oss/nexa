/**
 * Assinatura dos e-mails — bloco de identificação de quem assina a mensagem.
 *
 * Configurada por env (ver `resolveSignature`). Sem configuração, mantém a
 * assinatura antiga da Lia, então nenhum ambiente muda de comportamento só por
 * este arquivo existir.
 *
 * Decisões de formato, todas por restrição de cliente de e-mail e não por gosto:
 *   • Zero imagem. Logo em PNG é o erro mais comum em assinatura: Gmail, Outlook e
 *     Apple Mail bloqueiam imagem remota por padrão, então o que o destinatário vê
 *     é um retângulo vazio. Nome e cargo em texto sempre aparecem.
 *   • Zero tabela de layout aninhada e nenhuma coluna. Assinatura em duas colunas
 *     quebra e vira sopa no mobile.
 *   • Telefone vira link de WhatsApp (`wa.me`), não `tel:` — o número informado é
 *     de WhatsApp, e no desktop um `tel:` não faz nada.
 *   • Uma linha por informação, na ordem: quem → o que faz → onde → como falar.
 *     É a ordem em que a pessoa lê quando está decidindo se responde.
 *
 * Multi-tenant: hoje a resolução é por env, ou seja, global. Quando existir um
 * segundo tenant vendendo com assinatura própria, isto precisa virar coluna em
 * `EmailChannel` (o lugar onde já vivem fromName/replyTo) mais campo na tela de
 * configuração de e-mail. Está registrado de propósito: env é a escolha certa
 * para um tenant e a errada para dois.
 */

const LARANJA = '#FF5A1F';
const GRAFITE = '#16181D';
const SUAVE = '#8A9099';

export interface Signature {
  name: string;
  role?: string;
  company?: string;
  /** Como o número aparece para o leitor, ex.: "+55 11 99432-7713". */
  phoneLabel?: string;
  /** Só dígitos, para montar o link do WhatsApp, ex.: "5511994327713". */
  phoneDigits?: string;
  email?: string;
  /** Domínio exibido, sem protocolo, ex.: "hipertms.com.br". */
  site?: string;
}

/** Assinatura anterior — usada quando nada está configurado. */
const PADRAO: Signature = { name: 'Lia', role: 'Assistente HiperTMS', site: 'hipertms.com.br' };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Existe uma PESSOA configurada assinando os e-mails?
 *
 * É a mesma chave que liga a assinatura (`EMAIL_SIGNATURE_NAME`), exposta à parte
 * porque ela decide mais do que o rodapé: quando há uma pessoa configurada, ela
 * também é o nome no "De:" e ganha da identidade do mercado. Ver
 * email-market-identity.ts — prospecção fria assinada por gente responde mais que
 * assinada por assistente, e o provedor também confia mais.
 */
export function assinaturaConfigurada(): boolean {
  return !!process.env.EMAIL_SIGNATURE_NAME?.trim();
}

/**
 * Lê a assinatura do ambiente.
 *
 * `EMAIL_SIGNATURE_NAME` é o interruptor: sem ele, tudo é ignorado e vale o padrão.
 * Isso evita assinatura meio preenchida — um bloco com cargo e telefone mas sem
 * nome é pior que a assinatura antiga.
 */
export function resolveSignature(): Signature {
  const v = (k: string) => process.env[k]?.trim() || undefined;
  const name = v('EMAIL_SIGNATURE_NAME');
  if (!name) return PADRAO;

  const phoneRaw = v('EMAIL_SIGNATURE_PHONE');
  return {
    name,
    role: v('EMAIL_SIGNATURE_ROLE'),
    company: v('EMAIL_SIGNATURE_COMPANY'),
    phoneLabel: phoneRaw,
    phoneDigits: phoneRaw?.replace(/\D/g, '') || undefined,
    email: v('EMAIL_SIGNATURE_EMAIL'),
    site: v('EMAIL_SIGNATURE_SITE'),
  };
}

/** Versão texto puro — parte `text/plain` do multipart. */
export function signatureText(s: Signature = resolveSignature()): string {
  const linhas = [
    s.name,
    [s.role, s.company].filter(Boolean).join(' · ') || undefined,
    s.phoneLabel ? `${s.phoneLabel} (WhatsApp)` : undefined,
    s.email,
    s.site,
  ].filter(Boolean);
  return linhas.join('\n');
}

/** Versão HTML — sem imagem, sem coluna, uma linha por informação. */
export function signatureHtml(s: Signature = resolveSignature()): string {
  const cargoEmpresa = [s.role, s.company].filter((x): x is string => !!x).map(esc).join(' · ');

  const contatos: string[] = [];
  if (s.phoneDigits && s.phoneLabel) {
    contatos.push(
      `<a href="https://wa.me/${esc(s.phoneDigits)}" style="color:${SUAVE};text-decoration:none;">` +
      `${esc(s.phoneLabel)}</a> <span style="color:#C3BFBB;">·</span> WhatsApp`,
    );
  }
  if (s.email) {
    contatos.push(`<a href="mailto:${esc(s.email)}" style="color:${SUAVE};text-decoration:none;">${esc(s.email)}</a>`);
  }
  if (s.site) {
    const url = /^https?:\/\//i.test(s.site) ? s.site : `https://${s.site}`;
    const rotulo = s.site.replace(/^https?:\/\//i, '');
    contatos.push(`<a href="${esc(url)}" style="color:${LARANJA};text-decoration:none;">${esc(rotulo)}</a>`);
  }

  return (
    `<div style="border-top:1px solid #EFEAE6;padding-top:16px;font-size:13px;line-height:1.65;color:${SUAVE};">` +
    `<div style="color:${GRAFITE};font-weight:600;font-size:14px;">${esc(s.name)}</div>` +
    (cargoEmpresa ? `<div>${cargoEmpresa}</div>` : '') +
    (contatos.length ? `<div style="margin-top:6px;">${contatos.join('<br />')}</div>` : '') +
    '</div>'
  );
}
