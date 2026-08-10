/**
 * EmailSentIngestService — a metade que faltava do histórico.
 *
 * O poller lia só a INBOX. Isso capturava o que o LEAD escreve e perdia o que a
 * pessoa do comercial responde quando ela responde de fora do Nexa — do webmail,
 * do celular, do Outlook. O histórico ficava com as perguntas e sem as respostas.
 *
 * Isso importa agora porque o histórico não é enfeite: é o material com que a Lia
 * vai aprender a responder este canal (10/08/2026, a Lia do e-mail está desligada
 * de propósito enquanto a equipe responde à mão). Meia conversa não ensina nada —
 * pior, ensinaria errado, porque o que sobra é só a objeção sem a réplica.
 *
 * DUAS REGRAS QUE DEFINEM O QUE ENTRA
 * ───────────────────────────────────
 * 1. Só CONVERSA QUE JÁ EXISTE. Este serviço preenche a metade que falta de um fio
 *    aberto por um disparo ou por uma resposta de lead; ele nunca cria conversa.
 *    A caixa de prospecção pode receber e-mail para colega, contador, fornecedor —
 *    e cada um desses viraria um "lead" no funil e no material de treino. Um lead
 *    falso custa mais caro que uma mensagem não registrada.
 * 2. NADA QUE O PRÓPRIO NEXA MANDOU. O disparo e a resposta pelo Inbox já gravam a
 *    mensagem na conversa na hora do envio; reencontrá-las na pasta de enviados
 *    duplicaria tudo. A trava é o Message-ID, registrado no envio — mesma tabela e
 *    mesmo prefixo do dedup de entrada (ver EmailReplyService.send).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { emailToPhone } from './email.service';
import { normalizeEmail, isSendableEmail } from './email-address';
import { normalizarMessageId } from './campaign-reply-linker';
import { stripQuotedReply } from '@/shared/ai/untrusted-input';

export interface SentEmail {
  /** Destinatário (cabeçalho To). Pode vir como "Nome <a@b.com>". */
  to: string;
  subject: string;
  bodyText: string;
  messageId?: string;
  sentAt?: Date;
}

export type SentIngestResult =
  | { ok: true; conversationId: string }
  | { ignored: true; reason: 'sem_destinatario' | 'sem_corpo' | 'duplicada' | 'sem_conversa' };

/** "Nome <a@b.com>" → "a@b.com". Vários destinatários: fica com o primeiro. */
export function primeiroDestinatario(raw: string): string {
  const primeiro = (raw ?? '').split(',')[0] ?? '';
  const m = primeiro.match(/<([^>]+)>/);
  return normalizeEmail(m ? m[1] : primeiro);
}

@Injectable()
export class EmailSentIngestService {
  private readonly logger = new Logger('EmailSentIngest');

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  async ingest(tenantId: string, msg: SentEmail): Promise<SentIngestResult> {
    const para = primeiroDestinatario(msg.to);
    if (!isSendableEmail(para)) return { ignored: true, reason: 'sem_destinatario' };

    // Sem o histórico citado, pelo mesmo motivo da entrada: o cliente de e-mail
    // devolve a mensagem anterior inteira embaixo da resposta, e no fio ela já
    // está logo acima. `bodyCompleto` guarda o original.
    const bruto = (msg.bodyText ?? '').trim();
    const corpo = stripQuotedReply(bruto);
    if (!corpo) return { ignored: true, reason: 'sem_corpo' };

    // Trava de duplicata: o INSERT é a prova. Falha = ou o Nexa mandou este e-mail
    // (registrou no envio), ou uma passada anterior já o ingeriu. Verificar antes
    // com um SELECT deixaria a janela de corrida aberta entre dois polls — foi
    // assim que a Lia respondeu duas vezes ao mesmo lead em 08/08/2026.
    const id = normalizarMessageId(msg.messageId);
    if (id) {
      try {
        await this.prisma.processedMessage.create({ data: { messageId: `email:${id}` } });
      } catch {
        return { ignored: true, reason: 'duplicada' };
      }
    }

    // Regra 1: só entra em conversa que já existe. `closed` entra na busca porque
    // a resposta escrita depois do fechamento pertence àquele fio, não a um novo.
    const conv = await this.prisma.aiConversation.findFirst({
      where: { tenantId, phone: emailToPhone(para) },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });

    if (!conv) {
      this.logger.debug(
        `Enviado para ${para} sem conversa correspondente — ignorado (não criamos lead a partir da caixa de saída)`,
      );
      return { ignored: true, reason: 'sem_conversa' };
    }

    await this.conversations.addMessage(tenantId, conv.id, {
      direction: 'outbound',
      content: corpo,
      // `alreadyDelivered`: o e-mail JÁ saiu, pelo cliente de quem escreveu. Sem
      // isto o despacho do addMessage mandaria o mesmo texto de novo pelo SMTP —
      // o lead receberia a resposta duas vezes.
      alreadyDelivered: true,
      metadata: {
        channel: 'email',
        subject: msg.subject,
        ...(corpo !== bruto ? { bodyCompleto: bruto } : {}),
        // De onde veio: distingue, no histórico, o que foi escrito fora do Nexa.
        // Quando formos treinar a Lia com estas conversas, é a marca que diz
        // "isto aqui é resposta humana de verdade".
        source: 'imap_sent',
        ...(msg.sentAt ? { sentAt: msg.sentAt.toISOString() } : {}),
      },
    });

    this.logger.log(`Resposta escrita fora do Nexa registrada no histórico → ${para} (conv=${conv.id.slice(0, 8)})`);
    return { ok: true, conversationId: conv.id };
  }
}
