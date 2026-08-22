/**
 * engagement-gate.ts — o disparo em massa e o funil não se falavam (21/08/2026).
 *
 * Auditoria confirmou, nos dois workers: os filtros de pré-envio cobrem LGPD,
 * blocklist, cliente TMS e telefone inelegível — nenhum pergunta se um HUMANO já
 * respondeu do outro lado. Uma cadência de N toques (Toque 1 → Toque 2 → Toque 3,
 * cada um uma campanha separada, sem motor de agendamento automático) continuava
 * mandando o próximo toque para quem já tinha respondido ao anterior — inclusive
 * para quem já está sendo trabalhado por um SDR ou já disse que não tem interesse.
 *
 * ## Por que o sinal NÃO é `Opportunity.stage`
 *
 * A oportunidade nasce na IMPORTAÇÃO, antes de qualquer disparo — é o que dá base
 * ao funil por lote (contar "quantos leads este lote trouxe"). Gatear pelo estágio
 * dela faria o Toque 1 nunca sair: a oportunidade já existe, em `new`, no momento
 * em que o primeiro disparo roda. E `new` também é o estágio de um lead que acabou
 * de responder e ainda não foi triado pelo SDR — as duas situações são
 * indistinguíveis só pelo estágio.
 *
 * ## Por que o sinal NÃO é `CampaignTarget.repliedAt`
 *
 * Esse campo só é escrito pelo linker de e-mail (`campaign-reply-linker.ts`,
 * casado por Message-ID). Não existe gravação equivalente para WhatsApp em
 * nenhum lugar do backend — checar por ele aqui teria o lado cego bem no canal
 * mais caro de errar (ban de número).
 *
 * ## O sinal usado: mensagem de ENTRADA em qualquer conversa do telefone
 *
 * `AiConversation` é criada com o mesmo `phone` como chave nos dois canais — o
 * e-mail vira telefone sintético via `emailToPhone` (ver `conversation-market.ts`
 * e `registrarNaConversa`) — e populada por qualquer resposta que o lead mandar,
 * em WhatsApp ou e-mail. Um `AiMessage.direction = 'inbound'' preso a essa
 * conversa é o único fato que hoje cobre os dois canais ao mesmo tempo, sem
 * depender de um campo que só um dos dois grava.
 *
 * ## O que isto NÃO faz
 *
 * Não escopa por mercado. `AiConversation.productCode` é o mercado da ÚLTIMA
 * campanha que tocou a conversa (ADR 037) — muda com o tempo, não é uma chave
 * estável para filtrar "só silenciar a cadência deste produto". Uma resposta
 * sobre pneus também pausa a cadência de TMS do mesmo telefone. O custo de
 * mandar um toque a mais para quem respondeu sobre outro produto é menor que o
 * de continuar mandando para quem já respondeu sobre este.
 */

/** O que a checagem precisa do Prisma — só a forma, para o teste mockar sem banco. */
export interface EngagementPrismaLike {
  aiMessage?: {
    findMany(args: any): Promise<{ conversation: { phone: string } }[]>;
  };
}

/**
 * Quais destes telefones já mandaram pelo menos uma mensagem de entrada.
 *
 * Em lote, para uma campanha inteira de uma vez — não uma consulta por alvo.
 * `distinct: ['conversationId']` deixa a resposta do tamanho de "quantas
 * conversas responderam", não "quantas mensagens elas trocaram".
 */
export async function telefonesQueJaResponderam(
  prisma: EngagementPrismaLike,
  tenantId: string,
  phones: readonly string[],
): Promise<Set<string>> {
  const alvo = [...new Set(phones.filter(Boolean))];
  // `aiMessage` é OPCIONAL na interface de propósito: no NestJS real, `this.prisma`
  // é o PrismaClient inteiro e sempre o tem — isto só degrada em dublê de teste
  // que não se importou de mockar o modelo. Degradar para "ninguém respondeu" é
  // o lado seguro (o gate simplesmente não bloqueia, como se não existisse),
  // nunca o oposto.
  if (!alvo.length || !prisma.aiMessage) return new Set();

  const linhas = await prisma.aiMessage.findMany({
    where: {
      tenantId,
      direction: 'inbound',
      conversation: { phone: { in: alvo } },
    },
    select: { conversation: { select: { phone: true } } },
    distinct: ['conversationId'],
  });

  return new Set(linhas.map((l) => l.conversation.phone));
}

/** Um telefone só, para a checagem no TICK (defesa em profundidade — ver sender.service.ts). */
export async function jaRespondeu(
  prisma: EngagementPrismaLike,
  tenantId: string,
  phone: string,
): Promise<boolean> {
  if (!phone) return false;
  const r = await telefonesQueJaResponderam(prisma, tenantId, [phone]);
  return r.has(phone);
}
