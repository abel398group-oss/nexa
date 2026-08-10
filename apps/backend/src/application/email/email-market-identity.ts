/**
 * email-market-identity.ts — a identidade que o MERCADO imprime no e-mail (ADR 037).
 *
 * O furo que este arquivo fecha (10/08/2026): a prévia da tela Mensagens renderiza
 * com a marca do mercado, mas o envio real (`EmailReplyService.send`) nunca recebia
 * `brand` — todo e-mail de campanha saía com o wordmark do HiperTMS, a cor laranja,
 * a tagline de TMS, o From "Lia HiperTMS" e a assinatura "Assistente HiperTMS",
 * fosse a campanha de TMS ou de pneus. A trava de liberação do mercado EXIGE
 * `displayName` e `senderName` preenchidos… que nada no caminho de envio lia.
 *
 * Por que isso é assunto de spam e não só de estética: o lead do parceiro recebe
 * um e-mail cuja marca não bate com o assunto nem com a copy. "Quem é você?" é a
 * reação que termina no botão "Reportar spam" — e reclamação de spam é a métrica
 * que o Google mais pesa (teto de 0,10%). Marca coerente é anti-spam.
 *
 * Função PURA de propósito: o mapeamento Product → identidade é testável sem SMTP
 * e sem banco, e os três consumidores (campanha, resposta da Lia na conversa,
 * prévia) usam a mesma regra — prévia divergindo do envio foi o defeito original.
 */
import type { EmailBrand } from './email-template';
import { assinaturaConfigurada, resolveSignature, type Signature } from './email-signature';

/** O subconjunto de `Product` que a identidade usa. Tudo opcional menos o nome. */
export interface MarketIdentitySource {
  name: string;
  displayName?: string | null;
  brandColor?: string | null;
  brandTagline?: string | null;
  senderName?: string | null;
  signupUrl?: string | null;
}

export interface MarketEmailIdentity {
  /** Marca para o `renderEmailHtml`. `undefined` = padrão HiperTMS. */
  brand?: EmailBrand;
  /** Nome do "De:". `undefined` = o fromName do canal (ex.: "Lia HiperTMS"). */
  fromName?: string;
  /** Assinatura do rodapé. `undefined` = a assinatura do ambiente. */
  signature?: Signature;
}

/** Extrai "pneus.com.br" de "https://pneus.com.br/cadastro?x=1". Inválida → undefined. */
function dominioDe(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Identidade do e-mail: quem assina e com que cara.
 *
 * PRECEDÊNCIA — pessoa configurada > mercado > padrão HiperTMS
 * ────────────────────────────────────────────────────────────
 * A MARCA (wordmark, cor, tagline) é sempre do mercado: é o produto de que o
 * e-mail fala. Já QUEM ASSINA é uma pessoa, e quando existe uma configurada
 * (`EMAIL_SIGNATURE_NAME` — ver email-signature.ts) ela ganha do "Lia <mercado>"
 * no "De:" e no rodapé. Os dois papéis não competem: um vendedor de verdade
 * assinando a campanha do mercado é exatamente o que o lead espera ver.
 *
 * A escolha não é só de tom. Prospecção fria assinada por gente é aberta e
 * respondida mais que a assinada por assistente, e as provedoras leem o mesmo
 * sinal — e-mail que parece pessoa recebe menos reclamação de spam, que é a
 * métrica com o teto mais apertado (0,10% no Google).
 *
 * O "tudo ou nada" do mercado continua valendo dentro da parte dele: sem
 * `displayName`, nada de marca própria. Um e-mail com o wordmark de um mercado e
 * a tagline de outro é o que mais parece phishing.
 */
export function identidadeDoMercado(
  market: MarketIdentitySource | null | undefined,
): MarketEmailIdentity {
  const displayName = market?.displayName?.trim();
  const brand: EmailBrand | undefined = displayName
    ? { name: displayName, color: market!.brandColor, tagline: market!.brandTagline }
    : undefined;

  // Pessoa configurada assina e aparece no "De:", com ou sem mercado.
  if (assinaturaConfigurada()) {
    const humano = resolveSignature();
    return { brand, fromName: humano.name, signature: humano };
  }

  if (!displayName) return {};

  return {
    brand,
    // O gate de liberação exige senderName; o fallback existe para o mercado ainda
    // em rascunho sendo testado (sendTest passa por aqui também).
    fromName: market!.senderName?.trim() || `Lia ${displayName}`,
    signature: {
      name: market!.senderName?.trim() || 'Lia',
      role: `Assistente ${displayName}`,
      // Site do MERCADO, não hipertms.com.br — o domínio da assinatura apontando
      // para um produto que não é o do e-mail é outro "quem é você?".
      site: dominioDe(market!.signupUrl),
      // Sem telefone aqui: o convite de WhatsApp já tem bloco próprio no template,
      // condicionado ao lead qualificado (score ≥ 40) — duplicar o número na
      // assinatura o exporia em todo primeiro contato frio.
    },
  };
}
