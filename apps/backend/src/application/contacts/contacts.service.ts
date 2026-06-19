import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';
import { CreateContactDto, UpdateContactDto } from './dto/create-contact.dto';
import { normalizePhone } from '@/shared/utils/phone.util';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, q: PaginationQueryDto, tag?: string): Promise<Paginated<any>> {
    const where: any = { tenantId };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
        { company: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    if (tag) where.tags = { has: tag };
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        take: q.limit,
        skip: q.offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, total };
  }

  // Lista as tags distintas do tenant com a contagem de contatos (para filtros e seletor de público).
  async listTags(tenantId: string): Promise<{ tag: string; count: number }[]> {
    const rows = await this.prisma.contact.findMany({ where: { tenantId }, select: { tags: true } });
    const counts = new Map<string, number>();
    for (const r of rows) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Adiciona ou remove uma tag em vários contatos de uma vez (sem duplicar).
  async bulkTag(tenantId: string, ids: string[], tag: string, mode: 'add' | 'remove' = 'add') {
    const clean = (tag ?? '').trim();
    if (!clean || !ids?.length) return { updated: 0 };
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, tags: true },
    });
    let updated = 0;
    for (const c of contacts) {
      const set = new Set(c.tags ?? []);
      if (mode === 'add') set.add(clean);
      else set.delete(clean);
      await this.prisma.contact.update({ where: { id: c.id }, data: { tags: [...set] } });
      updated++;
    }
    return { updated };
  }

  // Renomeia uma tag em TODOS os contatos do tenant (array_replace + DISTINCT p/ não duplicar).
  async renameTag(tenantId: string, from: string, to: string) {
    const f = (from ?? '').trim();
    const t = (to ?? '').trim();
    if (!f || !t || f === t) return { updated: 0 };
    const r = await this.prisma.$executeRaw`
      UPDATE contacts SET tags = (
        SELECT array_agg(DISTINCT x) FROM unnest(array_replace(tags, ${f}, ${t})) AS x
      )
      WHERE tenant_id = ${tenantId} AND ${f} = ANY(tags)`;
    return { updated: Number(r) };
  }

  // Exclui uma tag de TODOS os contatos do tenant.
  async deleteTag(tenantId: string, tag: string) {
    const t = (tag ?? '').trim();
    if (!t) return { updated: 0 };
    const r = await this.prisma.$executeRaw`
      UPDATE contacts SET tags = array_remove(tags, ${t})
      WHERE tenant_id = ${tenantId} AND ${t} = ANY(tags)`;
    return { updated: Number(r) };
  }

  async findOne(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }

  // Histórico de campanhas que um contato recebeu (via CampaignTarget).
  async campaignsForContact(tenantId: string, id: string) {
    const contact = await this.findOne(tenantId, id);
    const targets = await this.prisma.campaignTarget.findMany({
      where: { tenantId, phone: contact.phone },
      include: { campaign: { select: { id: true, name: true, channel: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return targets.map((t: any) => ({
      campaignId: t.campaignId,
      name: t.campaign?.name ?? '—',
      channel: t.campaign?.channel ?? 'whatsapp',
      status: t.status,
      sentAt: t.sentAt,
      createdAt: t.createdAt,
    }));
  }

  async create(tenantId: string, dto: CreateContactDto) {
    const phone = normalizePhone(dto.phone) || dto.phone; // garante formato canônico
    // upsert por (tenantId, phone) — não duplica
    return this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      update: { ...dto, phone, tags: dto.tags ?? undefined },
      create: { tenantId, ...dto, phone, tags: dto.tags ?? [] },
    });
  }

  // Grava o nome do contato a partir do pushName do WhatsApp respeitando a precedência
  // do nameSource (ADR 020): pushname < tms < manual. Só grava se o nome atual estiver
  // vazio OU também for 'pushname' — nunca sobrescreve um nome do TMS ou manual.
  async applyPushName(tenantId: string, phone: string, pushName: string) {
    const name = (pushName ?? '').trim();
    if (!name) return;
    const p = normalizePhone(phone) || phone;
    const c = await this.prisma.contact.findUnique({ where: { tenantId_phone: { tenantId, phone: p } } });
    if (!c) return;
    const src = (c as any).nameSource ?? 'pushname';
    if (c.name && src !== 'pushname') return; // nome de fonte superior → não toca
    if (c.name === name) return; // sem mudança
    await this.prisma.contact.update({ where: { id: c.id }, data: { name, nameSource: 'pushname' } });
  }

  async update(tenantId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(tenantId, id);
    return this.prisma.contact.update({ where: { id }, data: { ...dto } });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id); // valida que é do tenant
    await this.prisma.contact.delete({ where: { id } });
    return { ok: true };
  }

  // Exclusão em lote: apaga todos os ids do tenant numa única operação (atômica).
  async deleteMany(tenantId: string, ids: string[]) {
    if (!ids?.length) return { deleted: 0 };
    const r = await this.prisma.contact.deleteMany({ where: { id: { in: ids }, tenantId } });
    return { deleted: r.count };
  }

  // reativa um contato que tinha optado por sair (uso MANUAL pelo admin, com consentimento)
  async reactivate(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.contact.update({ where: { id }, data: { status: 'active', optOutAt: null } });
  }

  // marca um contato como descadastrado (opt-out) — não recebe mais disparos (LGPD)
  async optOut(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.contact.update({ where: { id }, data: { status: 'opted_out', optOutAt: new Date() } });
  }

  // Import em lote (CSV já parseado em array). Idempotente por phone.
  async importMany(tenantId: string, contacts: CreateContactDto[]) {
    let created = 0;
    for (const c of contacts) {
      const phone = normalizePhone(c.phone) || c.phone;
      await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId, phone } },
        update: {},
        create: { tenantId, ...c, phone, tags: c.tags ?? [] },
      });
      created++;
    }
    return { imported: created };
  }
}
