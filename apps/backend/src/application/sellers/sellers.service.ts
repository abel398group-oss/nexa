import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { normalizePhone } from '@/shared/utils/phone.util';

@Injectable()
export class SellersService {
  private readonly logger = new Logger('Sellers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly waha: WahaClientService,
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
    const seller = await this.prisma.seller.create({ data: { tenantId, name: dto.name, phone } });
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

  async update(
    tenantId: string,
    id: string,
    dto: { name?: string; phone?: string; email?: string; password?: string },
  ) {
    const seller = await this.prisma.seller.findFirst({ where: { id, tenantId } });
    if (!seller) throw new NotFoundException('Vendedor não encontrado');

    const phone = dto.phone ? normalizePhone(dto.phone) || dto.phone.replace(/\D/g, '') : undefined;
    const data: any = { ...(dto.name ? { name: dto.name } : {}), ...(phone ? { phone } : {}) };
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
  private async pickAndClaimSeller(tenantId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      UPDATE sellers SET assigned_count = assigned_count + 1
      WHERE id = (
        SELECT id FROM sellers
        WHERE tenant_id = ${tenantId} AND active = true
        ORDER BY assigned_count ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, tenant_id AS "tenantId", name, phone, active,
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
        // portal (hot_lead, criado pelo ConversationAgent) já cobre.
        if (!this.isOutOfOffice(seller)) {
          this.logger.log(
            `Re-engagement → ${seller.name}: "Estou fora" desligado — só sino do portal (sem WhatsApp)`,
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
        const sent = await this.waha.sendText(seller.phone, msg);
        this.logger.log(`Re-engagement → ${seller.name} (${seller.phone}); notificado: ${sent.sent}`);
        return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: sent.sent };
      }
      return { assigned: false, reason: 'já atribuído', sellerId: existing.sellerId };
    }

    // escolhe + incrementa o contador atomicamente (evita corrida entre
    // conversas concorrentes — ver comentario em pickAndClaimSeller)
    const seller = await this.pickAndClaimSeller(tenantId);
    if (!seller) {
      this.logger.warn('Nenhum vendedor ativo p/ handoff');
      return { assigned: false, reason: 'sem vendedor ativo' };
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
    if (!this.isOutOfOffice(seller)) {
      this.logger.log(
        `Handoff → ${seller.name}: "Estou fora" desligado — só sino do portal (sem WhatsApp)`,
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
    const sent = await this.waha.sendText(seller.phone, msg);

    this.logger.log(`Handoff → ${seller.name} (${seller.phone}); notificado: ${sent.sent}`);
    return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: sent.sent };
  }

  /** ADR 034: default true (comportamento pré-ADR) quando o campo ainda não existe no client/banco. */
  private isOutOfOffice(seller: { outOfOffice?: boolean } | Record<string, any>): boolean {
    return (seller as any).outOfOffice !== false;
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
