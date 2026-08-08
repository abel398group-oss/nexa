/**
 * Aviso de handoff por e-mail para o vendedor que recebeu o lead.
 *
 * ## Por que é um listener e não uma chamada direta
 *
 * A primeira versão injetava EmailReplyService dentro do SellersService. Compilou e
 * passou nos testes — e o Nest não subiu: `SellersModule → EmailModule →
 * AgentsModule → SellersModule`. Ciclo de módulos.
 *
 * Poderia ser resolvido com forwardRef, mas evento é a resposta certa aqui: avisar
 * alguém não é responsabilidade de quem atribui o lead. O SellersService atribui e
 * anuncia; quem sabe mandar e-mail escuta. É o mesmo desenho do
 * SupportEscalationListener.
 *
 * O aviso complementa o WhatsApp, não substitui: lead quente que cai 22h de sexta
 * dependia de alguém ver a mensagem no celular. E-mail espera na caixa.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailReplyService } from './email-reply.service';

export interface SellerHandoffEvent {
  tenantId: string;
  sellerName: string;
  /** Endereço de aviso do vendedor. Vazio/ausente → nada acontece. */
  sellerEmail?: string | null;
  kind: 'hot_lead' | 'human_request';
  conversationId: string;
  contactPhone: string;
  summary?: string;
  leadScore?: number;
  /** Linha com o deep link do inbox, montada por quem conhece a URL do app. */
  attendLine: string;
}

@Injectable()
export class SellerHandoffListener {
  private readonly logger = new Logger('SellerHandoffMail');

  constructor(private readonly emailReply: EmailReplyService) {}

  @OnEvent('seller.handoff')
  async onHandoff(e: SellerHandoffEvent): Promise<void> {
    const para = e.sellerEmail?.trim();
    if (!para) return;

    const assunto =
      e.kind === 'human_request'
        ? `Cliente pediu atendimento — ${e.contactPhone}`
        : `Lead quente atribuído a você — ${e.contactPhone}`;

    // Texto puro e curto: alerta operacional para o time, não peça de marketing.
    // Vai por sendAlertEmail justamente para não levar rodapé de descadastro.
    const corpo =
      (e.kind === 'human_request'
        ? 'O cliente pediu para falar com uma pessoa.'
        : `Lead quente (score ${e.leadScore ?? '-'}).`) +
      `\n\nContato: ${e.contactPhone}\n` +
      (e.summary ? `Resumo: ${e.summary}\n` : '') +
      `\n${e.attendLine}\n\n` +
      'Responder a este e-mail NÃO fala com o cliente — o atendimento é pelo inbox.';

    try {
      await this.emailReply.sendAlertEmail(para, assunto, corpo, e.tenantId);
      this.logger.log(`Handoff → ${e.sellerName}: aviso por e-mail para ${para}`);
    } catch (err: any) {
      // O lead JÁ está atribuído. Deixar uma falha de SMTP subir trocaria
      // "vendedor não recebeu o aviso" por "ninguém sabe que o lead existe".
      this.logger.warn(`Handoff → ${e.sellerName}: falha ao avisar ${para}: ${err?.message}`);
    }
  }
}
