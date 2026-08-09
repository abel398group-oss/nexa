/**
 * EmailBounceService — reconhece e processa devolução de e-mail (DSN) e resposta
 * automática, antes que virem "mensagem de lead".
 *
 * Dois problemas que isto resolve, os dois observados em 08/08/2026:
 *
 * 1. `transporter.sendMail()` resolver significa que a FILA do servidor aceitou a
 *    mensagem — não que alguém recebeu. O disparo marcava o alvo como `sent` em
 *    cima desse 250, então o painel mostrava 100% enviado enquanto nada chegava.
 *    A verdade sobre a entrega chega depois, de forma assíncrona, como devolução
 *    na caixa da Lia. Ninguém lia essas devoluções.
 *
 * 2. Pior: o poller de IMAP tratava a devolução como e-mail comum. Um
 *    `mailer-daemon` virava conversa no Inbox e a Lia respondia educadamente a
 *    ele — gastando chamada de IA, poluindo o funil e consumindo o rate-limit do
 *    remetente.
 *
 * Só devolução PERMANENTE (5.x.x) marca o alvo como `failed`. Temporária (4.x.x)
 * é normal — o servidor de origem ainda vai retentar — e só entra no log.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface BounceInfo {
  /** Endereço que falhou, quando o relatório informa. */
  recipient: string | null;
  /** Código de status estendido (RFC 3463), ex.: "5.1.1". */
  status: string | null;
  /** Resposta do servidor remoto, quando presente. */
  diagnostic: string | null;
  /** 5.x.x = definitivo (endereço morto, bloqueio). 4.x.x = temporário. */
  permanent: boolean;
}

/** Classificação do que chegou na caixa — decide se a Lia deve ver a mensagem. */
export type InboundKind = 'bounce' | 'auto_reply' | 'human';

/** Remetentes que nunca são pessoas. */
const REMETENTES_DE_SISTEMA = /(^|[<\s])(mailer-daemon|postmaster|no-?reply|nobody)@/i;

@Injectable()
export class EmailBounceService {
  private readonly logger = new Logger('EmailBounce');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * O que é esta mensagem?
   *
   * `raw` é a fonte completa: os campos do relatório (RFC 3464) vivem numa parte
   * `message/delivery-status` que o parser distribui de formas diferentes conforme
   * o servidor de origem. Ler do texto cru é mais confiável do que apostar na
   * estrutura que o mailparser montou.
   */
  classify(input: { from: string; subject: string; raw: string; headers?: string }): InboundKind {
    const cabecalhos = input.headers ?? input.raw.split(/\r?\n\r?\n/)[0] ?? '';

    // Relatório de entrega formal — o sinal mais forte que existe.
    if (/content-type:\s*multipart\/report/i.test(cabecalhos) && /report-type=["']?delivery-status/i.test(cabecalhos)) {
      return 'bounce';
    }
    if (REMETENTES_DE_SISTEMA.test(input.from)) return 'bounce';
    // Alguns servidores mandam devolução sem relatório formal e sem daemon no From.
    if (/^(undelivered mail returned to sender|mail delivery failed|delivery status notification|returned mail)/i.test(input.subject.trim())) {
      return 'bounce';
    }

    // Férias/ausência: também NÃO é mensagem de lead — responder a um autoresponder
    // é o caminho mais curto para um laço de e-mails entre dois robôs.
    if (/^auto-submitted:\s*auto-(replied|generated)/im.test(cabecalhos)) return 'auto_reply';
    if (/^x-autoreply:|^x-autorespond:/im.test(cabecalhos)) return 'auto_reply';

    return 'human';
  }

  /** Extrai destinatário, código e diagnóstico do relatório. */
  parse(raw: string): BounceInfo {
    const pegar = (re: RegExp) => raw.match(re)?.[1]?.trim() ?? null;

    const recipient = (
      pegar(/^Final-Recipient:\s*(?:rfc822;)?\s*(.+)$/im) ??
      pegar(/^Original-Recipient:\s*(?:rfc822;)?\s*(.+)$/im)
    )?.replace(/^<|>$/g, '') ?? null;

    const status = pegar(/^Status:\s*([245]\.\d+\.\d+)/im);
    const diagnostic = pegar(/^Diagnostic-Code:\s*(?:smtp;)?\s*(.+)$/im);

    // Sem campo Status: cai para o código SMTP solto no corpo. `5xx` é definitivo.
    const codigoSolto = status ? null : pegar(/\b([45]\d\d)[\s-]\d\.\d\.\d/);

    return {
      recipient: recipient && recipient.includes('@') ? recipient.toLowerCase() : null,
      status,
      diagnostic: diagnostic ? diagnostic.slice(0, 300) : null,
      permanent: status ? status.startsWith('5') : codigoSolto ? codigoSolto.startsWith('5') : false,
    };
  }

  /**
   * Registra a devolução em DOIS lugares, e a ordem importa:
   *
   *  1. No CONTATO (`emailBouncedAt`) — é o que impede a próxima campanha de tentar
   *     o mesmo endereço morto. Sem isto, o dedup entre campanhas não protegia nada:
   *     ele só pula quem tem alvo `sent`, e um alvo devolvido vira `failed`, então o
   *     endereço voltava para a fila na campanha seguinte. Taxa de rejeição acima de
   *     2% joga TODOS os e-mails do domínio no spam, não só os desta campanha.
   *  2. No ALVO da campanha (`failed`) — para o painel contar certo.
   *
   * O passo 1 acontece mesmo quando não existe alvo de campanha correspondente: a
   * devolução pode ser de uma resposta de conversa, e o endereço está morto do
   * mesmo jeito.
   *
   * Devolução temporária não altera nada — a mensagem ainda pode ser entregue, e
   * marcar `failed` cedo faria o painel mentir na direção oposta.
   */
  async record(tenantId: string, info: BounceInfo): Promise<void> {
    if (!info.recipient) {
      this.logger.warn(
        `Devolução sem destinatário identificável (status=${info.status ?? '-'}) — nada a marcar. ` +
        `Diagnóstico: ${info.diagnostic ?? '(ausente)'}`,
      );
      return;
    }

    const motivo = `bounce ${info.status ?? '?'}: ${info.diagnostic ?? 'sem diagnóstico'}`.slice(0, 200);

    if (!info.permanent) {
      this.logger.warn(`Devolução TEMPORÁRIA para ${info.recipient} — ${motivo} (alvo mantido, servidor vai retentar)`);
      return;
    }

    // 1) Endereço queimado — nunca mais entra em campanha de e-mail.
    //
    // `insensitive` porque o relatório de devolução devolve o endereço na caixa em
    // que o servidor remoto o escreveu, que não precisa bater com a nossa.
    const marcados = await this.prisma.contact
      .updateMany({
        where: { tenantId, email: { equals: info.recipient, mode: 'insensitive' } },
        data: { emailBouncedAt: new Date(), emailBounceReason: motivo },
      })
      .catch((e: any) => {
        this.logger.error(`Falha ao marcar contato ${info.recipient} como bounced: ${e?.message}`);
        return { count: 0 };
      });

    if (marcados.count === 0) {
      this.logger.warn(
        `Devolução DEFINITIVA para ${info.recipient} — nenhum contato com esse e-mail no tenant ${tenantId}. ` +
        'O endereço NÃO ficou bloqueado; se ele voltar numa planilha, será tentado de novo.',
      );
    }

    // 2) Marca o alvo mais recente que constava como entregue para este endereço.
    const alvo = await this.prisma.campaignTarget
      .findFirst({
        where: { tenantId, email: { equals: info.recipient, mode: 'insensitive' }, status: 'sent' },
        orderBy: { sentAt: 'desc' },
        select: { id: true, campaignId: true },
      })
      .catch(() => null);

    if (!alvo) {
      this.logger.warn(
        `Devolução DEFINITIVA para ${info.recipient} — ${motivo}. Contato marcado ` +
        `(${marcados.count}), mas nenhum alvo de campanha com status "sent" para este endereço ` +
        '(envio pode ter sido resposta de conversa, não campanha).',
      );
      return;
    }

    await this.prisma.campaignTarget
      .update({ where: { id: alvo.id }, data: { status: 'failed', error: motivo } })
      .catch((e: any) => this.logger.warn(`Falha ao marcar alvo ${alvo.id} como failed: ${e?.message}`));

    this.logger.warn(
      `Devolução DEFINITIVA: ${info.recipient} (campanha=${alvo.campaignId}) marcado como failed ` +
      `e contato bloqueado para e-mail — ${motivo}`,
    );
  }
}
