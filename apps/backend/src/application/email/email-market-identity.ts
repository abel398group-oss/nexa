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
import type { Signature } from './email-signature';

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
 * Identidade do mercado, ou `{}` quando o mercado não tem cara própria.
 *
 * A regra do "tudo ou nada" é deliberada e espelha a assinatura por env
 * (`EMAIL_SIGNATURE_NAME` como interruptor): sem `displayName`, TODOS os campos
 * caem no padrão HiperTMS. Um e-mail com o wordmark de um mercado e a assinatura
 * de outro é pior que um e-mail 100% HiperTMS — identidade pela metade é o que
 * mais parece phishing.
 */
export function identidadeDoMercado(
  market: MarketIdentitySource | null | undefined,
): MarketEmailIdentity {
  const displayName = market?.displayName?.trim();
  if (!market || !displayName) return {};

  return {
    brand: {
      name: displayName,
      color: market.brandColor,
      tagline: market.brandTagline,
    },
    // O gate de liberação exige senderName; o fallback existe para o mercado ainda
    // em rascunho sendo testado (sendTest passa por aqui também).
    fromName: market.senderName?.trim() || `Lia ${displayName}`,
    signature: {
      name: market.senderName?.trim() || 'Lia',
      role: `Assistente ${displayName}`,
      // Site do MERCADO, não hipertms.com.br — o domínio da assinatura apontando
      // para um produto que não é o do e-mail é outro "quem é você?".
      site: dominioDe(market.signupUrl),
      // Sem telefone aqui: o convite de WhatsApp já tem bloco próprio no template,
      // condicionado ao lead qualificado (score ≥ 40) — duplicar o número na
      // assinatura o exporia em todo primeiro contato frio.
    },
  };
}
