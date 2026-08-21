import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { normalizePhone } from '@/shared/utils/phone.util';

// Score a partir do qual o lead é "alta prioridade" e fura a regra da ADR 034
// (WhatsApp só com "Estou fora" ligado). Ver deveNotificarWhatsapp().
const HIGH_PRIORITY_SCORE = Number(process.env.SELLER_WHATSAPP_ALWAYS_SCORE ?? 80);

@Injectable()
export class SellersService {
  private readonly logger = new Logger('Sellers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly waha: WahaClientService,
    private readonly events: EventEmitter2,
  ) {}

  async list(tenantId: string, search?: string) {
    const where: any = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    const sellers = await this.prisma.seller.findMany({ where, orderBy: { createdAt: 'asc' } });
    const ids = sellers.map((s: any) => s.id);
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { sellerId: { in: ids } }, select: { sellerId: true, email: true } })
      : [];
    const map = new Map(users.map((u: any) => [u.sellerId, u.email]));
    return sellers.map((s: any) => ({ ...s, loginEmail: map.get(s.id) ?? null })); // mostra se tem login
  }

  // cria vendedor; se vier email+senha, cria também o LOGIN (role=vendedor) vinculado
  async create(tenantId: string, dto: { name: string; phone: string; email?: string; password?: string }) {
    const phone = normalizePhone(dto.phone) || (dto.phone || '').replace(/\D/g, '');

    // Dois cliques no "Salvar" criavam DOIS vendedores com o mesmo telefone, os
    // dois com 201 (achado em 11/08/2026 disparando as duas requisições em
    // paralelo). O estrago não é a linha repetida: é o handoff saindo duas vezes
    // para a mesma pessoa, e a distribuição de lote contando o vendedor em dobro.
    //
    // O telefone é a chave natural — é por ele que o vendedor recebe. A checagem
    // vive aqui, e não só no DTO, porque o DTO não consulta o banco.
    const jaExiste = await this.prisma.seller.findFirst({
      where: { tenantId, phone },
      select: { id: true, name: true },
    });
    if (jaExiste) {
      throw new BadRequestException(
        `Já existe um vendedor com este telefone: "${jaExiste.name}". Edite o cadastro dele em vez de criar outro.`,
      );
    }
    // O e-mail vira o endereço de AVISO de handoff mesmo sem senha. Antes ele só
    // servia para criar login: cadastrar vendedor sem senha jogava o e-mail fora.
    let seller;
    try {
      seller = await this.prisma.seller.create({
        data: { tenantId, name: dto.name, phone, email: dto.email?.trim() || null } as any,
      });
    } catch (e: any) {
      // O índice único (tenant_id, phone) é quem de fato barra a corrida do duplo
      // clique — a checagem acima não consegue, porque as duas requisições
      // consultam antes de qualquer uma gravar. Este catch existe só para
      // traduzir a recusa dele: sem ele o operador recebia 500 e não descobria
      // que o vendedor já estava cadastrado. Mesmo tratamento de UsersService.
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Já existe um vendedor com este telefone. Edite o cadastro dele em vez de criar outro.',
        );
      }
      throw e;
    }
    if (dto.email && dto.password) {
      const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (!exists) {
        await this.prisma.user.create({
          data: {
            tenantId,
            email: dto.email,
            passwordHash: await bcrypt.hash(dto.password, 10),
            name: dto.name,
            role: 'vendedor',
            sellerId: seller.id,
            permissions: ['dashboard', 'inbox', 'contacts', 'opportunities'], // acesso fixo do vendedor; opportunities com escopo "so os meus" no controller (F6+)
          },
        });
      }
    }
    return seller;
  }

  setActive(tenantId: string, id: string, active: boolean) {
    return this.prisma.seller.updateMany({ where: { id, tenantId }, data: { active } });
  }

  // ADR 034 ("Estou fora"): true → handoff também vai pro WhatsApp do vendedor
  // (com deep link do inbox); false → só o sino do portal notifica.
  setOutOfOffice(tenantId: string, id: string, outOfOffice: boolean) {
    return this.prisma.seller.updateMany({ where: { id, tenantId }, data: { outOfOffice } as any });
  }

  /**
   * "Ausente até" — férias, atestado, afastamento (módulo 1).
   *
   * Enquanto durar, o vendedor não entra na distribuição de lote nem na lista de
   * closers. `null` marca a volta, para quem voltou antes do previsto.
   *
   * NÃO confundir com `setOutOfOffice` logo acima: aquele é da ADR 034 e decide se o
   * handoff também avisa no WhatsApp dele. Os dois nomes se parecem e fazem coisas
   * diferentes — mexer no errado tira o vendedor do lugar errado.
   */
  setAway(tenantId: string, id: string, awayUntil: Date | null) {
    return this.prisma.seller.updateMany({
      where: { id, tenantId },
      data: { awayUntil } as any,
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: { name?: string; phone?: string; email?: string; password?: string },
  ) {
    const seller = await this.prisma.seller.findFirst({ where: { id, tenantId } });
    if (!seller) throw new NotFoundException('Vendedor não encontrado');

    const phone = dto.phone ? normalizePhone(dto.phone) || dto.phone.replace(/\D/g, '') : undefined;
    const data: any = {
      ...(dto.name ? { name: dto.name } : {}),
      ...(phone ? { phone } : {}),
      // mesmo campo do cadastro: é para onde vai o aviso de lead quente
      ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
    };
    if (Object.keys(data).length) {
      await this.prisma.seller.update({ where: { id }, data }); // só atualiza se houver mudança
    }

    // gerencia o LOGIN vinculado (criar / trocar e-mail / resetar senha)
    if (dto.email || dto.password) {
      const user = await this.prisma.user.findFirst({ where: { sellerId: id } });
      try {
        if (user) {
          const data: any = {};
          if (dto.email) data.email = dto.email.trim();
          if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
          if (Object.keys(data).length) await this.prisma.user.update({ where: { id: user.id }, data });
        } else if (dto.email && dto.password) {
          await this.prisma.user.create({
            data: {
              tenantId,
              email: dto.email.trim(),
              passwordHash: await bcrypt.hash(dto.password, 10),
              name: dto.name ?? seller?.name ?? 'Vendedor',
              role: 'vendedor',
              sellerId: id,
              permissions: ['dashboard', 'inbox', 'contacts', 'opportunities'], // F6+: vendedor ve SEUS leads (escopo no controller)
            },
          });
        } else if (dto.email && !dto.password) {
          throw new BadRequestException('Para criar o login, informe e-mail E senha.');
        }
      } catch (e: any) {
        if (e?.code === 'P2002') throw new BadRequestException('Esse e-mail já está em uso por outro usuário.');
        throw e;
      }
    }
    return this.prisma.seller.findFirst({ where: { id, tenantId } });
  }

  async remove(tenantId: string, id: string) {
    const seller = await this.prisma.seller.findFirst({ where: { id, tenantId } });
    if (!seller) throw new NotFoundException('Vendedor não encontrado');
    // desvincula pra não quebrar FK (conversas atribuídas e login do vendedor)
    await this.prisma.aiConversation.updateMany({ where: { assignedSellerId: id }, data: { assignedSellerId: null } });
    await this.prisma.user.updateMany({ where: { sellerId: id }, data: { sellerId: null } });
    // notificações têm cascade; remove o vendedor
    await this.prisma.seller.delete({ where: { id } });
    return { ok: true };
  }

  // Exclusão em lote — desvincula conversas/login e remove (escopado por tenant).
  async deleteMany(tenantId: string, ids: string[]) {
    if (!ids?.length) return { deleted: 0 };
    const owned = await this.prisma.seller.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true } });
    const ownedIds = owned.map((o: any) => o.id);
    if (!ownedIds.length) return { deleted: 0 };
    await this.prisma.aiConversation.updateMany({ where: { assignedSellerId: { in: ownedIds } }, data: { assignedSellerId: null } });
    await this.prisma.user.updateMany({ where: { sellerId: { in: ownedIds } }, data: { sellerId: null } });
    const r = await this.prisma.seller.deleteMany({ where: { id: { in: ownedIds }, tenantId } });
    return { deleted: r.count };
  }

  // Round-robin balanceado: escolhe o vendedor ativo com MENOS atribuições E
  // incrementa o contador na mesma instrucao (SELECT ... FOR UPDATE SKIP LOCKED).
  // Pick + increment separados (um SELECT, depois um UPDATE em outra query/
  // transacao) permitiam duas conversas virando lead quente ao mesmo tempo
  // lerem o mesmo "menos atribuido" antes de qualquer uma incrementar,
  // desbalanceando o round-robin sob concorrencia.
  private async pickAndClaimSeller(tenantId: string, productCode?: string | null) {
    /**
     * Duas regras entraram aqui em 21/08/2026, e as duas já valiam na passagem do
     * SDR — o rodízio da IA era o único caminho que as ignorava.
     *
     * AUSÊNCIA: quem está de férias ou afastado não recebe. Lead quente entregue a
     * quem não vai abrir o inbox esfria duas semanas sem ninguém perceber, e é o
     * pior destino possível justamente para o lead que mais vale.
     *
     * MERCADO: vendedor que não trabalha aquele produto não recebe lead dele. Sem
     * isto a separação por mercado do módulo 1 vale na tela do SDR e não vale
     * quando a própria Lia distribui — o que é pior que não ter separação, porque
     * ninguém desconfia.
     *
     * O filtro de mercado só LIGA quando o tenant usa mercados (existe ao menos uma
     * linha em `seller_markets`). É o mesmo precedente do `MarketScopeService`: a
     * regra entra em vigor quando alguém a adota, e quem nunca vinculou vendedor a
     * mercado continua com o comportamento de sempre em vez de parar de receber
     * lead da noite para o dia.
     */
    const usaMercados =
      !!productCode &&
      (await this.prisma.sellerMarket.count({ where: { tenantId } })) > 0;

    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE sellers SET assigned_count = assigned_count + 1
      WHERE id = (
        SELECT id FROM sellers
        WHERE tenant_id = ${tenantId}
          AND active = true
          -- away_until é a data de VOLTA: no passado significa que já voltou.
          AND (away_until IS NULL OR away_until <= now())
          AND (
            ${!usaMercados}::boolean
            OR EXISTS (
              SELECT 1 FROM seller_markets sm
               WHERE sm.seller_id = sellers.id
                 AND sm.tenant_id = ${tenantId}
                 AND sm.product_code = ${productCode ?? ''}
            )
          )
        ORDER BY assigned_count ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, tenant_id AS "tenantId", name, phone, email, active,
                out_of_office AS "outOfOffice", assigned_count AS "assignedCount",
                created_at AS "createdAt"`;
    return rows[0] ?? null;
  }

  // Atribui a conversa a um vendedor e o notifica no WhatsApp. Dedup por conversa.
  // `kind` (2026-07-20, incidente do spam de marmita): 'hot_lead' = lead de vendas
  // com score alto (template 🔥 com score); 'human_request' = cliente pediu
  // atendente (template 🙋 SEM score — "lead quente score 0" era mentira do
  // template único). Default 'hot_lead' por retrocompat com chamadores antigos.
  async handoff(
    tenantId: string,
    input: {
      conversationId: string;
      contactPhone: string;
      leadScore: number;
      summary?: string;
      kind?: 'hot_lead' | 'human_request';
      /// Mercado do lead. Sem ele o rodízio não tem como respeitar o vínculo de
      /// mercado, e cai no comportamento antigo (qualquer vendedor ativo).
      productCode?: string | null;
    },
  ) {
    const kind = input.kind ?? 'hot_lead';
    // já notificado? → lead re-engajou: avisa o mesmo vendedor sem mudar atribuição
    const existing = await this.prisma.sellerNotification.findUnique({
      where: { conversationId: input.conversationId },
    });
    if (existing) {
      const seller = await this.prisma.seller.findUnique({ where: { id: existing.sellerId } });
      if (seller?.phone) {
        // Vendedor desativado desde a atribuicao original — nao pinga WhatsApp
        // de alguem que nao deveria mais estar atendendo (a conversa continua
        // "dele" no registro; reatribuir é decisao de negocio, fora de escopo aqui).
        if (!seller.active) {
          this.logger.log(`Re-engagement → ${seller.name}: vendedor inativo — sem notificacao`);
          return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: false };
        }
        // ADR 034: WhatsApp só quando o vendedor está "fora" — no PC, o sino do
        // portal (hot_lead, criado pelo ConversationAgent) já cobre. Exceção:
        // lead de alta prioridade (ver deveNotificarWhatsapp).
        if (!this.deveNotificarWhatsapp(seller, kind, input.leadScore)) {
          this.logger.log(
            `Re-engagement → ${seller.name}: "Estou fora" desligado e score ${input.leadScore} < ${HIGH_PRIORITY_SCORE} — só sino do portal`,
          );
          return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: false };
        }
        const msg =
          `👋 *${kind === 'human_request' ? 'Cliente voltou!' : 'Lead voltou!'}*` +
          `${kind === 'hot_lead' ? ` (score ${input.leadScore})` : ''}\n` +
          `Cliente: ${input.contactPhone}\n` +
          (input.summary ? `Resumo: ${input.summary}\n` : '') +
          `Este atendimento já é seu — chegou uma nova mensagem.\n` +
          this.attendLine(input.conversationId);
        const sent = await this.waha.sendText(seller.phone, msg, { origin: 'handoff' });
        this.logger.log(`Re-engagement → ${seller.name} (${seller.phone}); notificado: ${sent.sent}`);
        return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: sent.sent };
      }
      return { assigned: false, reason: 'já atribuído', sellerId: existing.sellerId };
    }

    // escolhe + incrementa o contador atomicamente (evita corrida entre
    // conversas concorrentes — ver comentario em pickAndClaimSeller)
    const seller = await this.pickAndClaimSeller(tenantId, input.productCode);
    if (!seller) {
      // O motivo entra no log: "sem vendedor" agora tem três causas (nenhum ativo,
      // todos ausentes, nenhum vinculado ao mercado) e sem distinguir manda quem for
      // investigar procurar no lugar errado.
      this.logger.warn(
        `Nenhum vendedor disponível p/ handoff (mercado=${input.productCode ?? 'sem mercado'}) ` +
          `— verifique ativos, ausências e vínculo de mercado`,
      );
      return { assigned: false, reason: 'sem vendedor disponível' };
    }

    // atribui conversa + registra dedup (o contador ja foi incrementado acima)
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id: input.conversationId },
        data: { assignedSellerId: seller.id, assignedAt: new Date() },
      }),
      this.prisma.sellerNotification.create({
        data: {
          tenantId,
          sellerId: seller.id,
          conversationId: input.conversationId,
          contactPhone: input.contactPhone,
        },
      }),
    ]);

    // ADR 034: WhatsApp só quando o vendedor está "fora". O texto antigo dizia
    // "Responda pelo WhatsApp" — mas responder ESTA notificação não fala com o
    // cliente (cai no número do Nexa e é descartada pelo gate de números
    // internos). O caminho é sempre o inbox — daí o deep link.
    if (!this.deveNotificarWhatsapp(seller, kind, input.leadScore)) {
      this.logger.log(
        `Handoff → ${seller.name}: "Estou fora" desligado e score ${input.leadScore} < ${HIGH_PRIORITY_SCORE} — só sino do portal`,
      );
      return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: false };
    }
    const msg =
      (kind === 'human_request'
        ? `🙋 *Cliente pediu atendimento*\n`
        : `🔥 *Novo lead quente!* (score ${input.leadScore})\n`) +
      `Cliente: ${input.contactPhone}\n` +
      (input.summary ? `Resumo: ${input.summary}\n` : '') +
      `Atendimento atribuído a você.\n` +
      this.attendLine(input.conversationId);
    const sent = await this.waha.sendText(seller.phone, msg, { origin: 'handoff' });
    this.anunciarHandoff(seller, kind, input, tenantId);

    this.logger.log(`Handoff → ${seller.name} (${seller.phone}); notificado: ${sent.sent}`);
    return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: sent.sent };
  }

  /**
   * Anuncia o handoff. Quem sabe mandar e-mail escuta (SellerHandoffListener).
   *
   * Evento e não chamada direta: injetar o serviço de e-mail aqui fechava o ciclo
   * SellersModule -> EmailModule -> AgentsModule -> SellersModule e o Nest não subia.
   * O ciclo foi o sintoma; o desenho certo é este — avisar alguém não é
   * responsabilidade de quem atribui o lead.
   *
   * Não é aguardado de propósito: o lead JÁ está atribuído e o handoff não pode
   * ficar preso esperando SMTP.
   */
  private anunciarHandoff(
    seller: { name: string; email?: string | null },
    kind: 'hot_lead' | 'human_request',
    input: { conversationId: string; contactPhone: string; summary?: string; leadScore?: number },
    tenantId: string,
  ): void {
    this.events.emit('seller.handoff', {
      tenantId,
      sellerName: seller.name,
      sellerEmail: seller.email ?? null,
      kind,
      conversationId: input.conversationId,
      contactPhone: input.contactPhone,
      summary: input.summary,
      leadScore: input.leadScore,
      attendLine: this.attendLine(input.conversationId),
    });
  }

  /** ADR 034: default true (comportamento pré-ADR) quando o campo ainda não existe no client/banco. */
  private isOutOfOffice(seller: { outOfOffice?: boolean } | Record<string, any>): boolean {
    return (seller as any).outOfOffice !== false;
  }

  /**
   * A notificação vai pro WhatsApp do vendedor? (2026-08-08)
   *
   * A ADR 034 mandava WhatsApp só com "Estou fora" ligado — no PC, o sino do
   * portal cobriria. O furo apareceu na auditoria: vendedor com o status
   * desligado que não vive no painel simplesmente não fica sabendo, e é o lead
   * mais caro da fila que espera.
   *
   * Alta prioridade fura o silêncio. Um lead com score muito alto justifica o
   * ping mesmo com o vendedor "no PC"; abaixo disso a ADR 034 continua valendo,
   * senão volta o spam que a ADR foi escrita para resolver.
   */
  private deveNotificarWhatsapp(
    seller: Record<string, any>,
    kind: 'hot_lead' | 'human_request',
    leadScore: number,
  ): boolean {
    if (this.isOutOfOffice(seller)) return true;
    return kind === 'hot_lead' && leadScore >= HIGH_PRIORITY_SCORE;
  }

  /**
   * ADR 034: linha final da notificação — deep link direto pra conversa no
   * inbox (abre no navegador do celular). Sem NEXA_APP_URL configurada, cai
   * no texto sem link (nunca inventar URL).
   */
  private attendLine(conversationId: string): string {
    const base = (process.env.NEXA_APP_URL ?? '').trim().replace(/\/$/, '');
    return base
      ? `👉 Atender agora: ${base}/inbox?c=${conversationId}`
      : `👉 Atenda pelo painel Nexa (Inbox).`;
  }
}
