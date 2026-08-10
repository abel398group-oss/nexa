/**
 * EmailService — ADR 021
 *
 * Processa e-mails inbound do Mailgun, normaliza para o pipeline da Lia
 * e envia respostas por e-mail.
 *
 * Análogo ao WhatsappService, mas com:
 *  - Contato identificado por e-mail (não telefone)
 *  - Synthetic phone = "email:<endereço>" para o pipeline existente
 *  - Validação SPF/DKIM via headers do Mailgun (D8)
 *  - Rate-limit por remetente (máx 10/hora) — D8
 *  - Resposta via EmailReplyService (não WAHA)
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { stripQuotedReply } from '@/shared/ai/untrusted-input';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { EmailReplyService } from './email-reply.service';
import { AutonomyService } from '@/shared/governance/autonomy.service';
import { CampaignReplyLinker, normalizarMessageId } from './campaign-reply-linker';

// E-mail normalizado extraído do webhook Mailgun
export interface NormalizedEmail {
  from: string;           // endereço remetente ex: "João <joao@empresa.com>"
  fromAddress: string;    // só o endereço: "joao@empresa.com"
  subject: string;
  bodyText: string;       // texto puro (sem HTML)
  spfOk: boolean;
  dkimOk: boolean;
  /** Thread RFC 5322 — liga a resposta ao disparo. Ver CampaignReplyLinker. */
  inReplyTo?: string;
  references?: string;
}

// Converte "Nome <email@ex.com>" → "email@ex.com"
function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

// Prefixo que usamos para o campo `phone` de contatos/conversas de e-mail
// Permite identificar conversas de e-mail sem mudar o schema existente
export const EMAIL_PHONE_PREFIX = 'email:';
export function emailToPhone(email: string): string {
  return `${EMAIL_PHONE_PREFIX}${email}`;
}

// Rate-limit: no máximo 10 e-mails por hora por remetente (ADR 021 D8)
const RATE_LIMIT_COUNT = Number(process.env.EMAIL_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hora

interface RateBucket {
  count: number;
  windowStart: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');
  private rateBuckets = new Map<string, RateBucket>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly agent: ConversationAgentService,
    private readonly notifications: NotificationsService,
    private readonly emailReply: EmailReplyService,
    private readonly autonomy: AutonomyService,
    private readonly replyLinker: CampaignReplyLinker,
  ) {}

  /** Normaliza o payload Mailgun (form-encoded) para uma estrutura limpa. */
  normalize(body: Record<string, string>): NormalizedEmail {
    const from = body['from'] ?? body['From'] ?? '';
    const subject = body['subject'] ?? body['Subject'] ?? '(sem assunto)';
    // Mailgun envia "stripped-text" (texto sem assinatura) ou "body-plain"
    const bodyText = (body['stripped-text'] ?? body['body-plain'] ?? '').trim();

    // Validação SPF/DKIM — headers injetados pelo Mailgun antes de chamar o webhook
    const spfHeader = (body['X-Mailgun-Spf'] ?? '').toLowerCase();
    const dkimHeader = (body['X-Mailgun-Dkim-Check-Result'] ?? '').toLowerCase();
    const spfOk = spfHeader === 'pass' || spfHeader === '';   // empty = dev/sem config
    const dkimOk = dkimHeader === 'yes' || dkimHeader === '';

    return {
      from,
      fromAddress: extractEmail(from),
      subject,
      bodyText,
      spfOk,
      dkimOk,
      inReplyTo: body['In-Reply-To'] ?? body['in-reply-to'],
      references: body['References'] ?? body['references'],
    };
  }

  /** Verifica e incrementa o rate-limit por remetente. */
  private checkRateLimit(email: string): boolean {
    const now = Date.now();
    const bucket = this.rateBuckets.get(email);
    if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
      this.rateBuckets.set(email, { count: 1, windowStart: now });
      return true; // OK
    }
    if (bucket.count >= RATE_LIMIT_COUNT) {
      return false; // Excedido
    }
    bucket.count++;
    return true;
  }

  /** Pipeline completo: recebe e-mail → classifica → responde. */
  async process(rawBody: Record<string, string>, tenantId = 'default') {
    const n = this.normalize(rawBody);

    // Validação SPF/DKIM (D8 — rejeitar se explicitamente FAIL)
    const spfFail = (rawBody['X-Mailgun-Spf'] ?? '').toLowerCase() === 'fail';
    const dkimFail = (rawBody['X-Mailgun-Dkim-Check-Result'] ?? '').toLowerCase() === 'no';
    if (spfFail || dkimFail) {
      this.logger.warn(`E-mail rejeitado por falha SPF/DKIM: ${n.fromAddress} spf=${rawBody['X-Mailgun-Spf']} dkim=${rawBody['X-Mailgun-Dkim-Check-Result']}`);
      return { ignored: true, reason: 'spf_dkim_fail' };
    }

    if (!n.fromAddress || !n.fromAddress.includes('@')) {
      return { ignored: true, reason: 'invalid_from' };
    }

    // DEDUP por Message-ID — mesma trava que o WhatsApp já tinha e o e-mail não.
    //
    // Em 08/08/2026 a resposta do Uelder entrou TRÊS vezes: duas no mesmo
    // milissegundo (dois polls do IMAP rodando ao mesmo tempo) e uma terceira 18s
    // depois. As duas primeiras dispararam a Lia em paralelo e ela mandou DUAS
    // respostas diferentes para o mesmo lead, com 33ms de diferença.
    //
    // A trava é o INSERT: a violação da unique é a prova de que outro processo (ou
    // outra passada) já pegou esta mensagem. Verificar antes com um SELECT deixaria
    // a janela de corrida aberta, que é exatamente o que aconteceu.
    const dedupeId = normalizarMessageId(rawBody['Message-ID'] ?? rawBody['message-id']);
    if (dedupeId) {
      try {
        await this.prisma.processedMessage.create({ data: { messageId: `email:${dedupeId}` } });
      } catch {
        this.logger.warn(`E-mail de ${n.fromAddress} já processado (Message-ID ${dedupeId}) — ignorado`);
        return { ignored: true, reason: 'duplicada' };
      }
    }
    if (!n.bodyText) {
      return { ignored: true, reason: 'empty_body' };
    }

    // Rate-limit por remetente (D8)
    if (!this.checkRateLimit(n.fromAddress)) {
      this.logger.warn(`Rate-limit atingido para ${n.fromAddress} — e-mail ignorado`);
      return { ignored: true, reason: 'rate_limit' };
    }

    // 1) Upsert contato por e-mail (chave: tenantId + email)
    // Usa synthetic phone = "email:<addr>" para compatibilidade com o pipeline
    const syntheticPhone = emailToPhone(n.fromAddress);
    const contact = await this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: syntheticPhone } },
      update: { email: n.fromAddress, source: 'email' },
      create: {
        tenantId,
        phone: syntheticPhone,
        email: n.fromAddress,
        source: 'email',
        nameSource: 'pushname',
        tags: [],
      },
    });

    // 2) Contato opted_out → NÃO responde (LGPD)
    if (contact.status === 'opted_out') {
      this.logger.warn(`Contato opted_out enviou e-mail (${n.fromAddress}) — IA NÃO responde`);
      return { ignored: true, reason: 'opted_out' };
    }

    // 3) Acha ou cria conversa aberta
    let conv = await this.prisma.aiConversation.findFirst({
      where: {
        tenantId,
        phone: syntheticPhone,
        status: { in: ['open', 'waiting_customer', 'waiting_internal', 'escalated', 'closed'] as any },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!conv) {
      conv = await this.conversations.create(tenantId, {
        contactId: contact.id,
        phone: syntheticPhone,
        sourceChannel: 'email',
      });
    } else if ((conv.status as string) === 'closed') {
      this.logger.log(`Conversa de e-mail ${conv.id} reaberta — ${n.fromAddress}`);
      await this.prisma.aiConversation.update({
        where: { id: conv.id },
        data: { status: 'open' as any, endedAt: null, lastActivityAt: new Date() },
      });
      conv = { ...conv, status: 'open' as any, endedAt: null };
    }

    // 3.1) Esta resposta veio de uma campanha? O casamento é por Message-ID, então
    //      funciona mesmo quando o lead responde de um endereço diferente do que
    //      recebeu o disparo — caso em que a conversa acima é NOVA e, sem isto, a
    //      campanha exibiria "0 respostas" para sempre. Ver CampaignReplyLinker
    //      (inclusive por que a identidade NÃO é fundida).
    const campanha = await this.replyLinker.link(tenantId, n.fromAddress, {
      inReplyTo: n.inReplyTo,
      references: n.references,
    });

    // 4) Grava mensagem inbound — SEM o histórico citado.
    //
    // O cliente de e-mail devolve a mensagem anterior inteira embaixo da resposta,
    // com ">" na frente de cada linha. Uma resposta de duas palavras chegava ao
    // Inbox como quarenta linhas de citação — incluindo o nosso rodapé e o link de
    // descadastro com token, que não têm por que ficar dentro da conversa.
    //
    // O que foi cortado vai para `bodyCompleto`: nada se perde, só sai da frente.
    // O fio já tem a mensagem anterior logo acima — é justamente o que a citação
    // repete.
    const limpo = stripQuotedReply(n.bodyText);

    await this.conversations.addMessage(tenantId, conv.id, {
      direction: 'inbound',
      content: limpo,
      metadata: {
        channel: 'email',
        subject: n.subject,
        from: n.from,
        // Identidade da mensagem: é o que permite responder DENTRO da thread do
        // lead (cabeçalho In-Reply-To). Sem isto, cada resposta nossa abre um fio
        // novo no cliente dele. Ver EmailOutboundListener.
        ...(dedupeId ? { messageId: dedupeId } : {}),
        ...(limpo !== n.bodyText ? { bodyCompleto: n.bodyText } : {}),
        // Contexto do disparo: o analista precisa saber o que foi perguntado antes
        // desta resposta, e quando ela chega de outro endereço não há como deduzir.
        ...(campanha
          ? {
              campaignId: campanha.campaignId,
              campaignName: campanha.campaignName,
              ...(campanha.enderecoDiferente ? { respostaDeOutroEndereco: campanha.targetEmail } : {}),
            }
          : {}),
      },
    });

    // 5) Autonomia por canal (ADR 012): só responde sozinha se a Lia do E-MAIL
    //    estiver ligada (master AND email). Com ela OFF, a mensagem fica salva
    //    no inbox para um humano responder — não dispara resposta automática.
    if (!this.autonomy.isEnabled('email')) {
      this.logger.log(`Autonomia de e-mail OFF — mensagem de ${n.fromAddress} salva, SEM resposta automática.`);

      // AVISA. Sem isto, "a Lia está desligada, a gente responde na mão" é o mesmo
      // que não responder: a mensagem entra no Inbox e ninguém fica sabendo que
      // ela chegou. Lead de prospecção que responde e leva dois dias para ser
      // atendido é pior do que lead que nunca foi abordado — ele já demonstrou
      // interesse, e o silêncio depois disso é o que vira reclamação de spam.
      //
      // Best-effort: falhar em avisar não pode desfazer a mensagem já gravada.
      // Do texto LIMPO: um aviso que mostrasse a citação diria "> HiperTMS > bom
      // dia" e não o que a pessoa acabou de escrever, que é a única coisa que
      // interessa para decidir se vale correr.
      const trecho = limpo.replace(/\s+/g, ' ').slice(0, 160);
      await this.notifications
        .create(tenantId, {
          type: 'info',
          title: `📧 Resposta de e-mail para responder à mão`,
          body: `${n.from} — "${n.subject}"\n${trecho}${limpo.length > 160 ? '…' : ''}`,
          link: `/inbox/${conv.id}`,
        })
        .catch((e: any) =>
          this.logger.warn(`Falha ao notificar resposta de ${n.fromAddress}: ${e?.message}`),
        );

      return { ok: true, email: n.fromAddress, autonomy: 'email_off' as const, conversationId: conv.id };
    }

    // 6) Processa com a Lia (mesmo pipeline do WhatsApp).
    //
    // O que vai para o modelo é o corpo SEM o histórico citado. A mensagem completa
    // já foi gravada acima e continua visível no inbox — aqui o recorte é proposital:
    // o trecho citado é texto que o remetente controla por inteiro e pode forjar
    // ("nossa mensagem anterior" concedendo desconto). Ver shared/ai/untrusted-input.ts.
    const agentResult = await this.agent.handle(tenantId, {
      message: limpo,
      conversationId: conv.id,
    });

    // 7) O envio físico NÃO acontece aqui.
    //
    // Até 2026-08-07 este ponto chamava o SMTP diretamente, e isso tinha dois
    // defeitos. O primeiro: enviava `agentResult.draft` mesmo quando a Lia NÃO
    // auto-enviou (supervisora reprovou, takeover humano, kill switch) — o lead
    // recebia um e-mail que não existia na thread do Inbox. O segundo, e mais
    // grave, é que ele mascarava o buraco do canal: quem respondia pelo Inbox não
    // passava por aqui, caía na rota do WhatsApp em `addMessage()` e a resposta
    // nunca saía.
    //
    // Agora existe um caminho único: `addMessage()` decide o despacho por canal e
    // emite 'conversation.outbound.email' → EmailOutboundListener → SMTP. Vale
    // igual para a resposta da Lia e para a resposta escrita por uma pessoa.
    return {
      ok: true,
      email: n.fromAddress,
      conversationId: conv.id,
      agent: agentResult.route?.agent,
      replied: agentResult.autoSent === true,
    };
  }
}
