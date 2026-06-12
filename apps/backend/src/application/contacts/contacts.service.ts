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

  async findOne(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
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

  async update(tenantId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(tenantId, id);
    return this.prisma.contact.update({ where: { id }, data: { ...dto } });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id); // valida que é do tenant
    await this.prisma.contact.delete({ where: { id } });
    return { ok: true };
  }

  // reativa um contato que tinha optado por sair (uso MANUAL pelo admin, com consentimento)
  async reactivate(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.contact.update({ where: { id }, data: { status: 'active', optOutAt: null } });
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
