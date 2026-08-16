/**
 * EmailReplyService — ADR 021 D5
 *
 * Envia respostas da Lia por SMTP (Hostgator / qualquer servidor cPanel).
 *
 * Configuração via EmailChannel no banco (por tenant) ou .env como fallback:
 *   EMAIL_SMTP_HOST   mail.hipertms.com.br
 *   EMAIL_SMTP_PORT   465
 *   EMAIL_SMTP_USER   lia@hipertms.com.br
 *   EMAIL_SMTP_PASS   <senha>
 *   EMAIL_FROM_NAME   Lia HiperTMS
 *   EMAIL_REPLY_TO    contato@hipertms.com.br
 *   APP_BASE_URL      https://api.hipervias.com.br
 */
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailOptOutService } from './email-optout.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';
import { renderEmailHtml, type EmailLayout } from './email-template';
import { resolveSignature, signatureText } from './email-signature';
import { identidadeDoMercado } from './email-market-identity';
import { normalizarMessageId } from './campaign-reply-linker';
import { marcarLinkDaCampanha } from '@/application/sender/campaign-link';

// Assinatura configurável — ver email-signature.ts. A versão texto e a versão HTML
// vêm da MESMA fonte, para não existir a situação de o destinatário ver um nome no
// HTML e outro no fallback de texto puro.

/**
 * Nome anunciado no HELO/EHLO da sessão SMTP.
 *
 * Sem isto o nodemailer usa `os.hostname()`, que **nunca** é um nome válido nos
 * nossos ambientes: na máquina de dev virou `DESKTOP-8NO954L` e dentro do Docker
 * é o hash do container (`a3f9c1e8b204`). A RFC 5321 §4.1.1.1 exige FQDN ou
 * literal de endereço entre colchetes — nenhum dos dois casos qualifica.
 *
 * Custo real disso (diagnosticado em 08/08/2026): o Exim do HostGator aceitava a
 * mensagem e devolvia `250 OK` com id de fila, mas o gateway de saída dele
 * (cloudfilter.net) descartava tudo com HELO inválido **sem gerar bounce**. Do
 * nosso lado parecia envio bem-sucedido; nada chegava ao Gmail, nem no spam. O
 * mesmo servidor entregava normalmente quando o cliente era o Thunderbird, que
 * anuncia `helo=[192.168.0.14]`.
 *
 * Default: o domínio do próprio remetente — o valor que um servidor de e-mail
 * espera ver. `EMAIL_HELO_NAME` sobrescreve quando o ambiente precisar de outro.
 */
export function heloName(fromEmail: string): string {
  const env = process.env.EMAIL_HELO_NAME?.trim();
  if (env) return env;
  const dominio = fromEmail.split('@')[1]?.trim();
  return dominio && dominio.includes('.') ? dominio : 'localhost';
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  tenantId: string;
  contactId: string;
  leadScore?: number;
  inReplyToSubject?: string; // assunto original para o Re:
  /**
   * Mercado do e-mail (ADR 037). Presente → o e-mail sai com a CARA do mercado:
   * wordmark, cor, From e assinatura. Ausente/sem identidade → HiperTMS, como
   * sempre. Ver email-market-identity.ts — inclusive por que é tudo ou nada.
   */
  productCode?: string | null;
  /**
   * Campanha que originou o envio. Presente → o link da assinatura sai marcado, o
   * que é o que permite saber QUEM clicou quando o corpo vai sem link (e-mail frio).
   * Ausente (resposta de conversa) → assinatura com link limpo.
   */
  tracking?: { canal: 'email'; campanhaId: string; campanhaNome: string; contatoId?: string | null };
  /**
   * Layout. Padrão `simples` (primeiro contato). `marca` só para quem já te
   * conhece — ver o cabeçalho de email-template.ts.
   */
  layout?: EmailLayout;
  /** Botão de ação. Ignorado no layout `simples`: e-mail frio não leva botão. */
  ctaUrl?: string;
  ctaLabel?: string;
  /**
   * Message-ID da mensagem que estamos respondendo (forma canônica, sem `<>`).
   *
   * É o que faz o cliente do lead ENCADEAR a nossa resposta embaixo da mensagem
   * dele, em vez de abrir um fio novo. Sem isto, uma troca de quatro mensagens
   * vira quatro conversas soltas na caixa dele — foi o que apareceu no teste de
   * 10/08/2026. Assunto igual ajuda, mas quem de fato encadeia é este cabeçalho.
   */
  inReplyTo?: string;
}

// Configuração SMTP resolvida (banco ou .env)
interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

@Injectable()
export class EmailReplyService {
  private readonly logger = new Logger('EmailReplyService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly optout: EmailOptOutService,
    private readonly crypto: EmailCryptoService,
  ) {}

  /**
   * Resolve configuração SMTP: banco (por tenant) ou fallback .env.
   *
   * `proposito` separa a reputação de entrega: prospecção fria e transacional
   * (redefinição de senha, alerta do Monitor, escalação) saíam do mesmo remetente, e uma
   * denúncia de spam na primeira derrubava a segunda — que é a que não pode falhar.
   *
   * A escolha é por PREFERÊNCIA, nunca por filtro: caixa do propósito exato → caixa
   * `both` → qualquer ativa. Filtrar faria um tenant com uma caixa só parar de enviar no
   * dia do deploy, que é exatamente o desastre que a separação quer evitar.
   */
  private async resolveConfig(
    tenantId: string,
    proposito: 'comercial' | 'transacional' = 'comercial',
  ): Promise<SmtpConfig | null> {
    // Todas as ativas do tenant, e a escolha acontece aqui: ordenar por "propósito igual
    // primeiro" no Prisma exigiria SQL cru, e são poucas linhas por tenant.
    const ativas = await this.prisma.emailChannel.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ isSender: 'desc' }, { createdAt: 'asc' }],
    }).catch(() => [] as any[]);

    const ch =
      ativas.find((c: any) => c.purpose === proposito) ??
      ativas.find((c: any) => c.purpose === 'both') ??
      ativas[0] ??
      null;

    if (ch?.isActive && ch.smtpUser && ch.smtpPass) {
      return {
        host: ch.smtpHost,
        port: ch.smtpPort,
        secure: ch.smtpSecure,
        user: ch.smtpUser,
        pass: this.crypto.decrypt(ch.smtpPass), // decripta AES-256-GCM
        fromEmail: ch.fromEmail,
        fromName: ch.fromName,
        replyTo: ch.replyTo ?? undefined,
      };
    }

    // Fallback: variáveis de ambiente
    const host = process.env.EMAIL_SMTP_HOST;
    const user = process.env.EMAIL_SMTP_USER;
    const pass = process.env.EMAIL_SMTP_PASS;
    if (!host || !user || !pass) return null;

    return {
      host,
      port: Number(process.env.EMAIL_SMTP_PORT ?? 465),
      secure: (process.env.EMAIL_SMTP_SECURE ?? 'true') !== 'false',
      user,
      pass,
      fromEmail: user,
      fromName: process.env.EMAIL_FROM_NAME ?? 'Lia HiperTMS',
      replyTo: process.env.EMAIL_REPLY_TO,
    };
  }

  /**
   * Envia e devolve o Message-ID atribuído pelo SMTP.
   *
   * O `messageId` volta porque é a ÚNICA âncora que sobrevive a uma resposta vinda de
   * outro endereço: o cliente de e-mail do lead copia esse valor no `In-Reply-To`.
   * Quem dispara campanha guarda no alvo (ver CampaignTarget.messageId) para
   * reconhecer a resposta depois. É informativo — nunca vem vazio em envio bem
   * sucedido, mas quem consome trata `undefined` sem quebrar.
   */
  async send(opts: SendEmailOptions): Promise<{ sent: boolean; reason?: string; messageId?: string }> {
    // Comercial: disparo de campanha E a resposta da Lia na mesma conversa. As duas
    // PRECISAM sair do mesmo endereço — separar aqui faria o lead ver dois remetentes
    // numa thread só, e a resposta dele cairia numa caixa que ninguém lê.
    const config = await this.resolveConfig(opts.tenantId, 'comercial');

    if (!config) {
      this.logger.warn(
        'Configuração SMTP não encontrada (banco nem .env) — e-mail não enviado (dev mode)',
      );
      this.logger.debug(`[dev] Para: ${opts.to} | ${opts.subject}\n${opts.body}`);
      return { sent: false, reason: 'smtp_not_configured' };
    }

    // Gera token de opt-out (TTL 30 dias)
    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3001';
    const optOutToken = await this.optout.generateToken(opts.tenantId, opts.contactId, opts.to);
    const optOutUrl = `${baseUrl}/api/email/optout?token=${optOutToken}`;

    // Convite WhatsApp para leads qualificados (score ≥ 40 — ADR 021 D6)
    const waLink = process.env.WHATSAPP_INVITE_LINK ?? 'https://wa.me/5511994327713';
    const waQualificado = opts.leadScore !== undefined && opts.leadScore >= 40;
    const waInvite = waQualificado
      ? `\n\nPara agilizar seu atendimento, você também pode nos chamar no WhatsApp: ${waLink}`
      : '';

    const corpoLimpo = stripMarkdown(opts.body);

    // Identidade do MERCADO (ADR 037): a prévia da tela Mensagens já renderizava
    // com a marca do mercado e o envio real saía sempre HiperTMS — a divergência
    // exata que a prévia existe para impedir. Falha na consulta não segura o
    // e-mail: identidade é apresentação, o envio é o trabalho.
    const market = opts.productCode
      ? await this.prisma.product
          .findUnique({ where: { code: opts.productCode } })
          .catch(() => null)
      : null;
    const identidade = identidadeDoMercado(market as any);

    // Resolvida UMA vez e usada nas duas versões — texto e HTML precisam mostrar o
    // mesmo nome, senão o destinatário vê assinaturas diferentes conforme o cliente.
    //
    // O e-mail da assinatura é omitido quando é o MESMO do remetente: ele já está
    // no "De:", e repetir gasta uma das poucas linhas que o leitor percorre. Quando
    // difere, continua aparecendo — foi o que denunciou o endereço errado em
    // 10/08/2026, e um contato divergente é informação, não ruído.
    const base = identidade.signature ?? resolveSignature();
    const mesmoEndereco =
      !!base.email && base.email.trim().toLowerCase() === config.fromEmail.trim().toLowerCase();
    const semEmailRepetido = mesmoEndereco ? { ...base, email: undefined } : base;

    // O link da ASSINATURA também leva a marcação da campanha.
    //
    // Em e-mail frio o corpo sai sem link de propósito (anti-spam), então a assinatura
    // é o ÚNICO link — e é nele que a pessoa clica. Num teste real em 10/08/2026 o
    // clique veio por aqui e entrou como visita direta: campanha sem crédito, lead
    // anônimo. Só marca quando o chamador informa a campanha; resposta de conversa
    // segue com o link limpo.
    const assinatura =
      opts.tracking && semEmailRepetido.site
        ? {
            ...semEmailRepetido,
            siteHref: marcarLinkDaCampanha(
              /^https?:\/\//i.test(semEmailRepetido.site)
                ? semEmailRepetido.site
                : `https://${semEmailRepetido.site}`,
              opts.tracking,
            ),
          }
        : semEmailRepetido;

    // Alternativa em texto puro (multipart) — para cliente sem HTML e para o score
    // de spam: e-mail só-HTML pontua pior nos filtros.
    const bodyText =
      `${corpoLimpo}${waInvite}\n\n` +
      `--\n${signatureText(assinatura)}\n\n` +
      `Cancelar e-mails: ${optOutUrl}`;

    // Versão HTML com a identidade da marca. O descadastro vai em 11px cinza no
    // rodapé externo, clicável — antes era uma URL crua de ~90 caracteres em
    // corpo normal, que competia visualmente com a própria mensagem.
    const bodyHtml = renderEmailHtml({
      body: corpoLimpo,
      brand: identidade.brand,
      optOutUrl,
      whatsappUrl: waQualificado ? waLink : undefined,
      signature: assinatura,
      // Padrão `simples`: quem não disse nada está mandando primeiro contato ou
      // respondendo numa conversa, e os dois pedem o layout discreto.
      layout: opts.layout,
      ctaUrl: opts.ctaUrl,
      ctaLabel: opts.ctaLabel,
    });

    const subject =
      opts.inReplyToSubject
        ? (opts.inReplyToSubject.startsWith('Re:') ? opts.inReplyToSubject : `Re: ${opts.inReplyToSubject}`)
        : opts.subject;

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure, // true = SSL/TLS (porta 465)
      auth: { user: config.user, pass: config.pass },
      // HELO válido — sem isto o gateway de saída descarta em silêncio (ver heloName)
      name: heloName(config.fromEmail),
      tls: { rejectUnauthorized: false }, // Hostgator usa certificado cPanel, pode não ter CA raiz
      // DISP-012: sem timeout o nodemailer espera o SO desistir (minutos). O tick
      // de campanha de e-mail roda dentro de um lock Redis de 60s — se o envio
      // passar disso, o lock expira com o tick ainda rodando e outra réplica
      // dispara o próximo e-mail fora do intervalo anti-spam de 90-180s.
      // Teto aqui: ~30s no pior caso, bem abaixo do TTL do lock.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    try {
      const info = await transporter.sendMail({
        // O NOME é o do mercado quando há um; o ENDEREÇO é sempre o do canal.
        // Trocar o endereço exigiria SPF/DKIM do outro domínio — sem isso o
        // e-mail é descartado, então o mercado muda a cara, não o remetente.
        from: `"${identidade.fromName ?? config.fromName}" <${config.fromEmail}>`,
        to: opts.to,
        subject,
        text: bodyText,
        html: bodyHtml,
        replyTo: config.replyTo,
        // Encadeamento RFC 5322 §3.6.4 — ver `inReplyTo` em SendEmailOptions.
        // Os sinais `<>` são obrigatórios no cabeçalho; guardamos a forma canônica
        // sem eles porque é assim que o dedup e o linker comparam.
        ...(opts.inReplyTo
          ? { inReplyTo: `<${opts.inReplyTo}>`, references: [`<${opts.inReplyTo}>`] }
          : {}),
        // Descadastro também no cabeçalho: Gmail e Outlook mostram um botão nativo
        // "Cancelar inscrição" no topo quando ele existe, e a presença do header
        // melhora a reputação de envio. Complementa o link do rodapé, não substitui.
        headers: {
          'List-Unsubscribe': `<${optOutUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      // Registra o Message-ID do que NÓS mandamos.
      //
      // O poller agora lê a pasta de enviados, e tudo que sai daqui vai parar lá
      // também. Sem este registro, a mensagem que o disparo já gravou na conversa
      // seria reencontrada e gravada de novo — cada e-mail apareceria duas vezes no
      // fio. Mesma tabela e mesmo prefixo do dedup de entrada: um Message-ID é um
      // só, tanto faz por qual porta ele apareça. Ver EmailSentIngestService.
      const mid = normalizarMessageId(info?.messageId);
      if (mid) {
        await this.prisma.processedMessage
          .create({ data: { messageId: `email:${mid}` } })
          .catch(() => null); // já existe = já estava travado; não é erro
      }

      this.logger.log(`E-mail enviado via SMTP para ${opts.to} (tenant=${opts.tenantId})`);
      return { sent: true, messageId: info?.messageId };
    } catch (err: any) {
      this.logger.error(`Erro SMTP ao enviar para ${opts.to}: ${err?.message}`);
      return { sent: false, reason: `smtp_error: ${err?.message}` };
    }
  }

  /**
   * Envia e-mail operacional (alerta do Monitor Proativo) sem opt-out link e sem rastreamento de contato.
   * Usado para notificações admin-para-admin, não para marketing.
   *
   * Quando `html` é fornecido, o e-mail é enviado como multipart (text/plain fallback + text/html).
   * Clientes que não suportam HTML recebem o `text` simples; os demais veem o template rico.
   */
  async sendAlertEmail(
    to: string,
    subject: string,
    text: string,
    tenantId: string,
    html?: string,
    // O teste de modelo da tela Mensagens passa o nome do mercado aqui: o From é
    // uma das coisas que o teste existe para mostrar, e chegar de "Lia HiperTMS"
    // quando o disparo real sairia como o mercado seria a prévia mentindo de novo.
    fromName?: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    // Transacional: redefinição de senha, digest do Monitor, escalação de chamado,
    // handoff de vendedor. É o e-mail que não pode falhar — e falhava junto com a
    // reputação da prospecção fria, por dividir a caixa com ela.
    const config = await this.resolveConfig(tenantId, 'transacional');
    if (!config) {
      this.logger.warn(`sendAlertEmail: SMTP não configurado para tenant ${tenantId} — e-mail não enviado`);
      return { sent: false, reason: 'smtp_not_configured' };
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      name: heloName(config.fromEmail), // ver heloName — HELO inválido é descartado sem bounce
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10_000, // DISP-012 — ver comentário em send()
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    try {
      await transporter.sendMail({
        from: `"${fromName ?? config.fromName}" <${config.fromEmail}>`,
        to,
        subject,
        text: `${text}\n\n--\n${signatureText()}`,
        ...(html ? { html } : {}),
        replyTo: config.replyTo,
      });
      this.logger.log(`sendAlertEmail: enviado para ${to} (tenant=${tenantId})`);
      return { sent: true };
    } catch (err: any) {
      this.logger.error(`sendAlertEmail: erro SMTP para ${to}: ${err?.message}`);
      return { sent: false, reason: `smtp_error: ${err?.message}` };
    }
  }
}
