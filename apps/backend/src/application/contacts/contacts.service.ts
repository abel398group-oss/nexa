import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PaginationQueryDto, Paginated } from '@/shared/dto/pagination.dto';
import { CreateContactDto, UpdateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, q: PaginationQueryDto): Promise<Paginated<any>> {
    const where: any = { tenantId };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
        { company: { contains: q.search, mode: 'insensitive' } },
      ];
    }
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

  async findOne(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    return contact;
  }

  async create(tenantId: string, dto: CreateContactDto) {
    // upsert por (tenantId, phone) — não duplica
    return this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone: dto.phone } },
      update: { ...dto, tags: dto.tags ?? undefined },
      create: { tenantId, ...dto, tags: dto.tags ?? [] },
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
      await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId, phone: c.phone } },
        update: {},
        create: { tenantId, ...c, tags: c.tags ?? [] },
      });
      created++;
    }
    return { imported: created };
  }
}
