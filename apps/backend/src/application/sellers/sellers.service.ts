import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';

@Injectable()
export class SellersService {
  private readonly logger = new Logger('Sellers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly waha: WahaClientService,
  ) {}

  list(tenantId: string) {
    return this.prisma.seller.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  }

  // cria vendedor; se vier email+senha, cria também o LOGIN (role=vendedor) vinculado
  async create(tenantId: string, dto: { name: string; phone: string; email?: string; password?: string }) {
    const seller = await this.prisma.seller.create({ data: { tenantId, name: dto.name, phone: dto.phone } });
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
            permissions: ['dashboard', 'inbox'], // vendedor vê painel + inbox (carteira dele)
          },
        });
      }
    }
    return seller;
  }

  setActive(tenantId: string, id: string, active: boolean) {
    return this.prisma.seller.updateMany({ where: { id, tenantId }, data: { active } });
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
