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
            permissions: ['dashboard', 'inbox', 'contacts'], // vendedor (acesso fixo): Painel + Inbox de Vendas (carteira) + Contatos
          },
        });
      }
    }
    return seller;
  }

  setActive(tenantId: string, id: string, active: boolean) {
    return this.prisma.seller.updateMany({ where: { id, tenantId }, data: { active } });
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
              permissions: ['dashboard', 'inbox', 'contacts'],
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

  // Round-robin balanceado: escolhe o vendedor ativo com MENOS atribuições.
  private async pickSeller(tenantId: string) {
    return this.prisma.seller.findFirst({
      where: { tenantId, active: true },
      orderBy: [{ assignedCount: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // Atribui a conversa a um vendedor e o notifica no WhatsApp. Dedup por conversa.
  async handoff(
    tenantId: string,
    input: { conversationId: string; contactPhone: string; leadScore: number; summary?: string },
  ) {
    // já notificado? (dedup)
    const existing = await this.prisma.sellerNotification.findUnique({
      where: { conversationId: input.conversationId },
    });
    if (existing) {
      return { assigned: false, reason: 'já atribuído', sellerId: existing.sellerId };
    }

    const seller = await this.pickSeller(tenantId);
    if (!seller) {
      this.logger.warn('Nenhum vendedor ativo p/ handoff');
      return { assigned: false, reason: 'sem vendedor ativo' };
    }

    // atribui conversa + incrementa contador (round-robin) + registra dedup
    await this.prisma.$transaction([
      this.prisma.aiConversation.update({
        where: { id: input.conversationId },
        data: { assignedSellerId: seller.id, assignedAt: new Date() },
      }),
      this.prisma.seller.update({
        where: { id: seller.id },
        data: { assignedCount: { increment: 1 } },
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

    // notifica o vendedor no WhatsApp dele
    const msg =
      `🔥 *Novo lead quente!* (score ${input.leadScore})\n` +
      `Cliente: ${input.contactPhone}\n` +
      (input.summary ? `Resumo: ${input.summary}\n` : '') +
      `Atendimento atribuído a você. Responda pelo WhatsApp ou pelo Nexa.`;
    const sent = await this.waha.sendText(seller.phone, msg);

    this.logger.log(`Handoff → ${seller.name} (${seller.phone}); notificado: ${sent.sent}`);
    return { assigned: true, sellerId: seller.id, sellerName: seller.name, notified: sent.sent };
  }
}
