/**
 * human-activity.listener.ts — o robô cala quando a pessoa fala.
 *
 * ## O que isto fecha
 *
 * A cadência de follow-up parava em dois casos: o lead respondeu, ou pediu opt-out.
 * Faltava o terceiro, que é o mais comum na operação real — **o vendedor trabalhou o
 * lead**. Sem ele, o vendedor conversava com o lead na quarta e o sistema mandava
 * sozinho "passando pra saber se você viu minha mensagem" na quinta, como se ninguém
 * tivesse falado com ele. O lead conclui que é robô, ou que o vendedor não anotou.
 *
 * O takeover humano (ADR 035) já calava a LIA na conversa, mas o follow-up é outro
 * relógio, com outro gatilho, e não consultava nada disso.
 *
 * ## Por que ouvinte, e não uma chamada direta
 *
 * `FollowUpModule` importa `ConversationsModule`. Injetar o `FollowUpService` dentro
 * do `ConversationsService` fecharia o ciclo — e ciclo de módulo aqui custa o BOOT,
 * não a compilação. O evento inverte a dependência: quem sabe que um humano falou
 * avisa, e quem se importa escuta.
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FollowUpService } from './followup.service';

/** Um humano mandou a primeira mensagem numa conversa (ADR 035 — takeover). */
export interface HumanSpokeEvent {
  tenantId: string;
  conversationId: string;
  phone: string;
}

@Injectable()
export class HumanActivityListener {
  private readonly logger = new Logger('FollowUpHumanActivity');

  constructor(private readonly followup: FollowUpService) {}

  @OnEvent('human.spoke')
  async aoFalarComOLead(ev: HumanSpokeEvent): Promise<void> {
    try {
      // Por CONVERSA e por TELEFONE: a cadência é chaveada por conversa, mas o mesmo
      // lead pode ter sido agendado noutra conversa (linha diferente, campanha
      // anterior). Parar só a desta deixaria a outra falando por cima do vendedor.
      await this.followup.stop(ev.conversationId, 'vendedor assumiu a conversa');
      if (ev.phone) {
        await this.followup.stopByPhone(ev.tenantId, ev.phone, 'vendedor assumiu a conversa');
      }
    } catch (e) {
      // Best-effort: falhar aqui não pode derrubar o envio da mensagem do vendedor,
      // que já aconteceu. Mas some do log NUNCA (REGRA 3) — cadência que continua
      // rodando por baixo é justamente o defeito que este arquivo existe para evitar.
      this.logger.warn(
        `Não consegui parar a cadência de ${ev.phone} (conv=${ev.conversationId}): ${(e as Error).message}`,
      );
    }
  }
}
