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
  // Usa SQL com unnest() — evita carregar todos os contatos na memória (safe para 50k+ contatos).
  async listTags(tenantId: string): Promise<{ tag: string; count: number }[]> {
    return this.prisma.$queryRaw<{ tag: string; count: number }[]>`
      SELECT tag, COUNT(*)::int AS count
      FROM contacts, unnest(tags) AS tag
      WHERE tenant_id = ${tenantId}
      GROUP BY tag
      ORDER BY count DESC
    `;
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

  // Exporta um único contato como CSV (LGPD — portabilidade de dados).
  // Retorna uma string CSV com cabeçalho; o controller seta os headers HTTP corretos.
  async exportCsv(tenantId: string, id: string): Promise<string> {
    const c = await this.findOne(tenantId, id);
    const row = [
      c.id,
      c.name ?? '',
      c.phone,
      c.email ?? '',
      c.company ?? '',
      c.leadStatus ?? '',
      c.status ?? '',
      (c.tags ?? []).join('|'),
      c.createdAt.toISOString(),
      c.updatedAt.toISOString(),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    const header = '"id","nome","telefone","email","empresa","leadStatus","status","tags","criadoEm","atualizadoEm"';
    return `${header}\n${row}\n`;
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

  // ── Blocklist (2026-08-01, pré go-live): concorrentes NUNCA recebem campanha ──
  // status='blocked' é distinto de 'opted_out' (LGPD): opt-out é pedido do
  // contato; blocked é decisão NOSSA (concorrente, número interno, etc).
  // Reversível pelo painel (unblock). O sender barra em DOIS pontos:
  // criação da campanha (skipped/bloqueado) e tick (se bloquear depois de criada).
  async block(tenantId: string, ids: string[]) {
    if (!ids?.length) return { blocked: 0 };
    const r = await this.prisma.contact.updateMany({
      where: { id: { in: ids }, tenantId },
      data: { status: 'blocked' },
    });
    return { blocked: r.count };
  }

  async unblock(tenantId: string, ids: string[]) {
    if (!ids?.length) return { unblocked: 0 };
    // volta para 'active' apenas quem está 'blocked' — não mexe em opted_out
    const r = await this.prisma.contact.updateMany({
      where: { id: { in: ids }, tenantId, status: 'blocked' },
      data: { status: 'active' },
    });
    return { unblocked: r.count };
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
