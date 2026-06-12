import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ContactsService } from '@/application/contacts/contacts.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { FollowUpService } from '@/application/followup/followup.service';
import { WahaClientService } from '@/shared/waha/waha-client.service';
import { TmsLookupService } from '@/infra/tms/tms-lookup.service';

// Config anti-ban (env com defaults)
const BUSINESS_START = Number(process.env.SENDER_BUSINESS_START ?? 7); // 7h
const BUSINESS_END = Number(process.env.SENDER_BUSINESS_END ?? 19); // 19h
// delay entre envios: aleatório 30-90s (anti-ban) — varia a cada envio
const DELAY_MIN_MS = Number(process.env.SENDER_DELAY_MIN_MS ?? 30000);
const DELAY_MAX_MS = Number(process.env.SENDER_DELAY_MAX_MS ?? 90000);
// limite diário efetivo por fase de aquecimento (G7) — número novo começa baixo e cresce
const WARMUP_DAILY = [10, 15, 20, 30];

@Injectable()
export class SenderService {
  private readonly logger = new Logger('Sender');
  private lastSentAt = 0;
  private nextDelayMs = DELAY_MIN_MS; // sorteado a cada envio

  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
    private readonly followup: FollowUpService,
    private readonly waha: WahaClientService,
    private readonly tmsLookup: TmsLookupService,
  ) {}

  // ---------- número do pool ----------
  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  private thisHour(): string {
    return `${this.today()}-${String(new Date().getHours()).padStart(2, '0')}`;
  }

  // limite diário efetivo considerando aquecimento (G7)
  effectiveDailyLimit(n: { dailyLimit: number; warmupStage: number }): number {
    const warm = WARMUP_DAILY[Math.min(n.warmupStage, WARMUP_DAILY.length - 1)];
    return Math.min(n.dailyLimit, warm);
  }

  async ensureNumber(tenantId: string) {
    let n = await this.prisma.senderNumber.findFirst({ where: { tenantId, active: true } });
    if (!n) {
      n = await this.prisma.senderNumber.create({
        data: { tenantId, phone: process.env.WAHA_SENDER_PHONE ?? '5512997880659', sessionName: process.env.WAHA_SESSION ?? 'default' },
      });
    }
    // reseta contador diário se virou o dia
    if (n.dayStamp !== this.today()) {
      n = await this.prisma.senderNumber.update({ where: { id: n.id }, data: { sentToday: 0, dayStamp: this.today() } });
    }
    // reseta contador horário se virou a hora
    if (n.hourStamp !== this.thisHour()) {
      n = await this.prisma.senderNumber.update({ where: { id: n.id }, data: { sentThisHour: 0, hourStamp: this.thisHour() } });
    }
    return n;
  }

  listNumbers(tenantId: string) {
    return this.prisma.senderNumber.findMany({ where: { tenantId } });
  }

  // ---------- campanhas ----------
  async createCampaign(
    tenantId: string,
    dto: {
      name: string; template: string; phones?: { phone: string; name?: string }[]; fromContacts?: boolean;
      link?: string; mediaUrl?: string; mediaName?: string; sendLimit?: number;
    },
  ) {
    let targets = dto.phones ?? [];
    if (dto.fromContacts) {
      const contacts = await this.prisma.contact.findMany({
        where: { tenantId, status: 'active' }, // nunca dispara p/ opted_out (LGPD)
        select: { phone: true, name: true },
      });
      targets = contacts.map((c) => ({ phone: c.phone, name: c.name ?? undefined }));
    }
    // dedup por telefone
    const seen = new Set<string>();
    targets = targets.filter((t) => (seen.has(t.phone) ? false : seen.add(t.phone)));

    // quantos foram PULADOS por opt-out (transparência LGPD)
    let skippedOptOut = 0;
    if (dto.fromContacts) {
      skippedOptOut = await this.prisma.contact.count({ where: { tenantId, status: 'opted_out' } });
    } else if (targets.length) {
      skippedOptOut = await this.prisma.contact.count({
        where: { tenantId, status: 'opted_out', phone: { in: targets.map((t) => t.phone) } },
      });
      // remove da lista quem está opted_out (mesmo em envio manual)
      const optedOut = await this.prisma.contact.findMany({
        where: { tenantId, status: 'opted_out', phone: { in: targets.map((t) => t.phone) } },
        select: { phone: true },
      });
      const blocked = new Set(optedOut.map((o) => o.phone));
      targets = targets.filter((t) => !blocked.has(t.phone));
    }

    // ── Filtro TMS: consulta o lote no banco do HiperTMS (read-only) ──────────
    // Clientes já cadastrados no TMS não recebem campanha de prospecção.
    // Se TMS_DB_URL não estiver configurado, tmsMap fica vazio e nenhum lead é bloqueado.
    const tmsMap = await this.tmsLookup.batchLookup(targets.map((t) => t.phone));
    const tmsBlocked = targets.filter((t) => tmsMap.has(TmsLookupService.normalize(t.phone)));
    const tmsAllowed = targets.filter((t) => !tmsMap.has(TmsLookupService.normalize(t.phone)));
    const skippedTms = tmsBlocked.length;

    // Marca os clientes TMS com a tag 'tms_cliente' no Nexa (só leitura do TMS — escrita só no Nexa)
    for (const t of tmsBlocked) {
      const info = tmsMap.get(TmsLookupService.normalize(t.phone));
      await this.prisma.contact.upsert({
        where: { tenantId_phone: { tenantId, phone: t.phone } },
        update: { tags: { push: 'tms_cliente' } },
        create: {
          tenantId,
          phone: t.phone,
          name: t.name ?? info?.name ?? undefined,
          source: 'tms_import',
          tags: ['tms_cliente'],
        },
      }).catch(() => null); // não bloqueia se falhar
    }

    if (skippedTms > 0) {
      this.logger.log(`Campanha "${dto.name}": ${skippedTms} lead(s) já são clientes TMS — pulados e marcados`);
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        template: dto.template,
        link: dto.link || null,
        mediaUrl: dto.mediaUrl || null,
        mediaName: dto.mediaName || null,
        sendLimit: dto.sendLimit && dto.sendLimit > 0 ? dto.sendLimit : null,
        targets: {
          create: [
            // leads que podem receber a campanha
            ...tmsAllowed.map((t) => ({ tenantId, phone: t.phone, name: t.name })),
            // clientes TMS: criados como skipped para aparecer no relatório
            ...tmsBlocked.map((t) => ({ tenantId, phone: t.phone, name: t.name, status: 'skipped', error: 'tms_cliente' })),
          ],
        },
      },
      include: { _count: { select: { targets: true } } },
    });
    return { ...campaign, included: tmsAllowed.length, skippedOptOut, skippedTms };
  }

  async listCampaigns(tenantId: string) {
    const camps = await this.prisma.campaign.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    const withCounts = await Promise.all(
      camps.map(async (c) => {
        const grouped = await this.prisma.campaignTarget.groupBy({
          by: ['status'],
          where: { campaignId: c.id },
          _count: true,
        });
        const counts = grouped.reduce((a, g) => ({ ...a, [g.status]: g._count }), {} as Record<string, number>);
        return { ...c, counts };
      }),
    );
    return withCounts;
  }

  // Detalhe de uma campanha: a campanha + destinatários (com status) + contagem.
  async campaignDetail(tenantId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, tenantId } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    const targets = await this.prisma.campaignTarget.findMany({
      where: { campaignId: id },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    const counts = targets.reduce(
      (a, t) => ({ ...a, [t.status]: (a[t.status] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    return { campaign, targets, counts };
  }

  async setStatus(tenantId: string, id: string, status: 'running' | 'paused') {
    return this.prisma.campaign.updateMany({
      where: { id, tenantId },
      data: { status, ...(status === 'running' ? { startedAt: new Date() } : {}) },
    });
  }

  async removeCampaign(tenantId: string, id: string) {
    // alvos têm cascade; apaga a campanha (e o histórico de envios dela)
    const r = await this.prisma.campaign.deleteMany({ where: { id, tenantId } });
    return { ok: r.count > 0 };
  }

  // ---------- worker de disparo ----------
  // BUG-06 fix: getHours() retorna UTC em containers Linux → usar UTC-3 explicitamente
  private withinBusinessHours(): boolean {
    const h = (new Date().getUTCHours() - 3 + 24) % 24;
    return h >= BUSINESS_START && h < BUSINESS_END;
  }

  @Interval(15000) // tenta a cada 15s; o delay real entre envios é controlado abaixo
  async tick() {
    try {
      // Recuperação de travamento: alvos presos em 'sending' por mais de 5 min
      // indicam crash do worker no meio do envio — volta para 'queued' para reprocessar.
      // sentAt é null quando ainda não foi enviado (ficou preso em 'sending' sem enviar)
      // ou sentAt muito antigo (>5min) — ambos indicam travamento.
      await this.prisma.campaignTarget.updateMany({
        where: {
          status: 'sending',
          OR: [
            { sentAt: null },
            { sentAt: { lt: new Date(Date.now() - 5 * 60_000) } },
          ],
        },
        data: { status: 'queued' },
      });

      // fecha campanhas 'running' que já não têm alvo na fila (terminaram)
      await this.prisma.campaign.updateMany({
        where: { status: 'running', targets: { none: { status: 'queued' } } },
        data: { status: 'done' },
      });

      if (!this.withinBusinessHours()) return;

      // pega uma campanha rodando com alvo na fila
      const campaign = await this.prisma.campaign.findFirst({
        where: { status: 'running', targets: { some: { status: 'queued' } } },
        orderBy: { createdAt: 'asc' },
      });
      if (!campaign) return;

      // respeita o limite de quantidade da campanha (sendLimit) — checado ANTES do delay
      if (campaign.sendLimit) {
        const enviados = await this.prisma.campaignTarget.count({ where: { campaignId: campaign.id, status: 'sent' } });
        if (enviados >= campaign.sendLimit) {
          await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'done' } });
          this.logger.log(`Campanha ${campaign.name}: limite de ${campaign.sendLimit} envios atingido`);
          return;
        }
      }

      if (Date.now() - this.lastSentAt < this.nextDelayMs) return; // respeita delay anti-ban (30-90s)

      const number = await this.ensureNumber(campaign.tenantId);
      const dailyCap = this.effectiveDailyLimit(number);
      if (number.sentToday >= dailyCap) {
        this.logger.warn(`Limite diário atingido (${dailyCap}, warmup stage ${number.warmupStage}) — pausa hoje`);
        return;
      }
      if (number.sentThisHour >= number.hourlyLimit) {
        this.logger.warn(`Limite por hora atingido (${number.hourlyLimit}) — aguardando próxima hora`);
        return;
      }

      const target = await this.prisma.campaignTarget.findFirst({
        where: { campaignId: campaign.id, status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (!target) {
        await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'done' } });
        return;
      }

      // CLAIM ATÔMICO (idempotência): só prossegue quem conseguir marcar queued→sending.
      // Evita "mesma campanha enviada 2x" se dois ciclos do worker se sobrepuserem.
      const claim = await this.prisma.campaignTarget.updateMany({
        where: { id: target.id, status: 'queued' },
        data: { status: 'sending' },
      });
      if (claim.count === 0) return; // outro tick já pegou este alvo

      // pula opt-outs (LGPD)
      const contact = await this.contacts.create(campaign.tenantId, { phone: target.phone, name: target.name ?? undefined, source: 'outbound' });
      if (contact.status === 'opted_out') {
        await this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'skipped', error: 'opted_out' } });
        return;
      }

      let text = this.render(campaign.template, target.name);
      if (campaign.link) text += `\n\n${campaign.link}`; // anexa o link no texto
      // anexo como LINK público (WAHA grátis não envia arquivo; link funciona).
      // MEDIA_PUBLIC_BASE = base pública que o cliente acessa (ex.: túnel/domínio).
      const mediaBase = process.env.MEDIA_PUBLIC_BASE;
      if (campaign.mediaUrl && mediaBase) {
        const idx = campaign.mediaUrl.indexOf('/uploads/');
        if (idx >= 0) {
          const publicUrl = mediaBase.replace(/\/$/, '') + campaign.mediaUrl.slice(idx);
          text += `\n\n📎 ${campaign.mediaName || 'Material'}: ${publicUrl}`;
        }
      }
      try {
        // acha/cria conversa e envia (addMessage outbound dispara o WAHA + aparece no inbox)
        let conv = await this.prisma.aiConversation.findFirst({ where: { tenantId: campaign.tenantId, phone: target.phone, status: 'open' } });
        if (!conv) {
          conv = await this.conversations.create(campaign.tenantId, { contactId: contact.id, phone: target.phone, sourceChannel: 'whatsapp' });
        }
        await this.conversations.addMessage(campaign.tenantId, conv.id, { direction: 'outbound', content: text, intent: 'outbound_campaign' });

        // anexo (PDF/Word) — envia o arquivo logo após o texto
        if (campaign.mediaUrl) {
          await this.waha.sendFile(target.phone, campaign.mediaUrl, campaign.mediaName ?? 'arquivo', '');
        }

        await this.prisma.$transaction([
          this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'sent', sentAt: new Date() } }),
          this.prisma.senderNumber.update({
            where: { id: number.id },
            data: { sentToday: { increment: 1 }, sentThisHour: { increment: 1 } },
          }),
        ]);
        // agenda follow-up (24h/72h) caso o lead não responda
        await this.followup.schedule(campaign.tenantId, { conversationId: conv.id, phone: target.phone, name: target.name });
        this.lastSentAt = Date.now();
        this.nextDelayMs = DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)); // sorteia 30-90s p/ o próximo
        this.logger.log(`Disparo p/ ${target.phone} (campanha ${campaign.name}) [${number.sentToday + 1}/${number.dailyLimit} hoje; próx em ${Math.round(this.nextDelayMs / 1000)}s]`);
      } catch (e: any) {
        await this.prisma.campaignTarget.update({ where: { id: target.id }, data: { status: 'failed', error: String(e?.message).slice(0, 200) } });
      }
    } catch (e: any) {
      this.logger.error(`tick falhou: ${e?.message}`);
    }
  }

  // saudação por horário (Brasília) — business-rules §10
  // BUG-06 fix: usar hora UTC-3 (Brasília) — getHours() retorna UTC em containers Linux.
  static greeting(): string {
    const h = (new Date().getUTCHours() - 3 + 24) % 24;
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  // rodapé de opt-out (LGPD) — business-rules §4/§8
  static OPT_OUT_FOOTER = '\n\n_Responda SAIR para não receber mais mensagens._';

  private render(template: string, name?: string | null): string {
    const first = (name ?? '').split(' ')[0] || 'tudo bem';
    let txt = template
      .replace(/\{\{\s*nome\s*\}\}/gi, first)
      .replace(/\{\{\s*saudacao\s*\}\}/gi, SenderService.greeting());
    // BUG-09 fix: verificação anterior /sair/i causava falso positivo em frases como
    // "Saia na frente da concorrência" — o footer não era adicionado, violando LGPD.
    // Agora verifica o texto exato do rodapé.
    if (!txt.includes('Responda SAIR')) txt += SenderService.OPT_OUT_FOOTER;
    return txt;
  }
}
