/**
 * campaign-reply-linker.ts — liga a resposta de e-mail ao disparo que a provocou.
 *
 * ## O problema
 *
 * A conversa de e-mail é indexada pelo REMETENTE (`email:<endereço>`). Quando o lead
 * responde do mesmo endereço que recebeu, tudo cai na conversa certa. Quando responde
 * de outro — assinou com o e-mail pessoal, o corporativo redireciona, a secretária
 * responde — o Nexa cria uma conversa NOVA, sem ligação com a campanha:
 *
 *   • o alvo original nunca conta como "respondeu" → a campanha exibe 0 respostas
 *     para sempre, e o freio de engajamento (sender-health) lê uma taxa falsa;
 *   • o analista abre a conversa nova e vê a resposta sem saber o que foi perguntado.
 *
 * Observado em 08/08/2026 num teste real do Abel.
 *
 * ## A âncora
 *
 * O único fio que sobrevive à troca de endereço é o `Message-ID`. Todo cliente de
 * e-mail decente copia o Message-ID da mensagem original no `In-Reply-To` (e acumula a
 * thread em `References`) — RFC 5322 §3.6.4. Guardamos o Message-ID de cada envio no
 * alvo e casamos na volta.
 *
 * ## O que este módulo NÃO faz, de propósito
 *
 * Ele NÃO funde as identidades: a mensagem continua na conversa do endereço que
 * realmente escreveu. `In-Reply-To` é um header que o remetente controla livremente —
 * quem souber o Message-ID de um e-mail nosso poderia, se a gente fundisse, injetar
 * texto na conversa de OUTRO lead e fazer a Lia responder aquilo para ele. Message-ID
 * é praticamente imprevisível (uuid aleatório), mas "difícil de adivinhar" não é
 * controle de acesso, e a diferença entre atribuir métrica e conceder identidade é
 * grande demais para depender disso.
 *
 * Então o casamento serve para: marcar o alvo como respondido, e anexar o contexto da
 * campanha à mensagem inbound (o Inbox mostra de onde ela veio). Nada mais.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

/**
 * Forma canônica de um Message-ID: sem os sinais `<>` e sem espaço em volta.
 *
 * Os dois lados TÊM que passar por aqui. O nodemailer devolve
 * `<uuid@hipertms.com.br>` COM os sinais e o header da resposta também os traz — se um
 * lado normalizasse e o outro não, a comparação nunca casaria e o recurso todo seria
 * um no-op silencioso. Devolve `null` quando não sobra nada utilizável, para nunca
 * gravar string vazia (que casaria com qualquer outra string vazia).
 */
export function normalizarMessageId(bruto?: string | null): string | null {
  if (!bruto) return null;
  const limpo = bruto.trim().replace(/^</, '').replace(/>$/, '').trim();
  return limpo.length > 0 ? limpo : null;
}

/** Contexto do disparo que originou a resposta. */
export interface CampaignReplyLink {
  campaignId: string;
  campaignName: string;
  targetId: string;
  /** Endereço que RECEBEU o disparo — pode ser diferente de quem respondeu. */
  targetEmail: string | null;
  /** true quando a resposta veio de um endereço diferente do que recebeu. */
  enderecoDiferente: boolean;
}

/**
 * Extrai os Message-IDs citados por uma resposta, do mais recente para o mais antigo.
 *
 * `In-Reply-To` aponta para a mensagem respondida e é o candidato mais forte.
 * `References` traz a thread inteira e entra depois, porque cliente que responde a uma
 * resposta nossa mantém o disparo original só em References. A ordem importa: o
 * primeiro que casar ganha.
 *
 * Aceita os dois headers com ou sem os sinais de menor/maior e tolera múltiplos IDs na
 * mesma linha (separados por espaço, o que a RFC permite).
 */
export function extrairMessageIds(headers: {
  inReplyTo?: string | null;
  references?: string | string[] | null;
}): string[] {
  const bruto = [
    ...normalizarLista(headers.inReplyTo),
    // References vem em ordem cronológica; a mensagem mais próxima está no fim.
    ...normalizarLista(headers.references).reverse(),
  ];
  return [...new Set(bruto)];
}

function normalizar(v?: string | string[] | null): string[] {
  if (!v) return [];
  const texto = Array.isArray(v) ? v.join(' ') : v;
  // Casa <id@dominio> e também ids soltos sem os sinais.
  const comSinais = [...texto.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]);
  if (comSinais.length) return comSinais;
  return texto
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

/** Nada aqui pode sobrar em forma não canônica. Ver normalizarMessageId. */
function normalizarLista(v?: string | string[] | null): string[] {
  return normalizar(v)
    .map((id) => normalizarMessageId(id))
    .filter((id): id is string => id !== null);
}

@Injectable()
export class CampaignReplyLinker {
  private readonly logger = new Logger('CampaignReplyLink');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Acha o disparo que originou esta resposta e marca o alvo como respondido.
   *
   * Nunca lança: uma falha aqui não pode impedir a resposta do lead de entrar no
   * Inbox. O pior caso é a métrica ficar como está hoje.
   */
  async link(
    tenantId: string,
    fromAddress: string,
    headers: { inReplyTo?: string | null; references?: string | string[] | null },
  ): Promise<CampaignReplyLink | null> {
    try {
      const ids = extrairMessageIds(headers);
      if (ids.length === 0) return null;

      const alvos = await this.prisma.campaignTarget.findMany({
        where: { tenantId, messageId: { in: ids } },
        select: {
          id: true,
          email: true,
          messageId: true,
          repliedAt: true,
          campaign: { select: { id: true, name: true } },
        },
      });
      if (alvos.length === 0) return null;

      // Respeita a ordem de `ids` (In-Reply-To antes de References): o banco devolve
      // na ordem dele, que não tem relação com qual citação é a mais próxima.
      const alvo =
        ids.map((id) => alvos.find((a: any) => a.messageId === id)).find(Boolean) ?? alvos[0];
      if (!alvo?.campaign) return null;

      const enderecoDiferente =
        !!alvo.email && alvo.email.toLowerCase() !== fromAddress.toLowerCase();

      // Só a PRIMEIRA resposta marca a data — as seguintes são a mesma conversa, e
      // sobrescrever daria "respondeu" sempre com a data da última mensagem.
      if (!alvo.repliedAt) {
        await this.prisma.campaignTarget.update({
          where: { id: alvo.id },
          data: { repliedAt: new Date() },
        });
      }

      if (enderecoDiferente) {
        this.logger.log(
          `Resposta de ${fromAddress} atribuída à campanha "${alvo.campaign.name}" — ` +
          `o disparo foi para ${alvo.email}. A conversa fica no remetente real ` +
          '(identidade não é fundida por header — ver campaign-reply-linker.ts).',
        );
      } else {
        this.logger.debug(
          `Resposta de ${fromAddress} atribuída à campanha "${alvo.campaign.name}"`,
        );
      }

      return {
        campaignId: alvo.campaign.id,
        campaignName: alvo.campaign.name,
        targetId: alvo.id,
        targetEmail: alvo.email,
        enderecoDiferente,
      };
    } catch (e: any) {
      this.logger.warn(`Falha ao atribuir resposta de ${fromAddress}: ${e?.message}`);
      return null;
    }
  }
}
