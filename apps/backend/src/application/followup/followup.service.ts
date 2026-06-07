import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ConversationsService } from '@/application/conversations/conversations.service';

// Cadência configurável (horas). Default 24h e 72h (a partir do 1º contato).
const STAGE1_HOURS = Number(process.env.FOLLOWUP_STAGE1_HOURS ?? 24);
const STAGE2_HOURS = Number(process.env.FOLLOWUP_STAGE2_HOURS ?? 72);
const BUSINESS_START = Number(process.env.SENDER_BUSINESS_START ?? 7);
const BUSINESS_END = Number(process.env.SENDER_BUSINESS_END ?? 19);

const OPT_OUT_FOOTER = '\n\n_Responda SAIR para não receber mais mensagens._';
const MSG = {
  1: 'Oi {{nome}}, passando pra saber se você teve a chance de ver minha mensagem sobre o sistema de gestão de fretes. Posso ajudar com alguma dúvida? 🙂' + OPT_OUT_FOOTER,
  2: 'Oi {{nome}}! Última passadinha por aqui 😊 Se tiver interesse no sistema de gestão de fretes do HiperTMS, é só me chamar quando quiser. Abraço!' + OPT_OUT_FOOTER,
};

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger('FollowUp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  private hoursFromNow(h: number) {
    return new Date(Date.now() + h * 3600 * 1000);
  }

  // Agenda follow-up após o 1º contato (ex.: disparo de campanha).
  async schedule(tenantId: string, input: { conversationId: string; phone: string; name?: string | null }) {
    await this.prisma.followUp.upsert({
      where: { conversationId: input.conversationId },
      update: {}, // se já existe, não reinicia
      create: {
        tenantId,
        conversationId: input.conversationId,
        phone: input.phone,
        name: input.name ?? null,
        stage: 0,
        status: 'pending',
        nextRunAt: this.hoursFromNow(STAGE1_HOURS),
      },
    });
  }

  // Lead respondeu (ou opt-out) → para a cadência.
  async stop(conversationId: string, reason = 'respondeu') {
    await this.prisma.followUp.updateMany({
      where: { conversationId, status: 'pending' },
      data: { status: 'stopped' },
    });
    this.logger.debug(`Follow-up parado p/ conversa ${conversationId} (${reason})`);
  }

  list(tenantId: string) {
    return this.prisma.followUp.findMany({ where: { tenantId }, orderBy: { nextRunAt: 'asc' } });
  }

  private withinBusinessHours(): boolean {
    const h = new Date().getHours();
    return h >= BUSINESS_START && h < BUSINESS_END;
  }

  @Interval(20000) // checa a cada 20s
  async tick() {
    try {
      if (!this.withinBusinessHours()) return;
      const due = await this.prisma.followUp.findMany({
        where: { status: 'pending', nextRunAt: { lte: new Date() } },
        take: 5,
      });
      for (const f of due) {
        // segurança: não segue quem deu opt-out
        const contact = await this.prisma.contact.findFirst({ where: { tenantId: f.tenantId, phone: f.phone } });
        if (contact?.status === 'opted_out') {
          await this.prisma.followUp.update({ where: { id: f.id }, data: { status: 'stopped' } });
          continue;
        }

        const nextStage = f.stage + 1; // 1 ou 2
        const text = (MSG as any)[nextStage]?.replace(/\{\{\s*nome\s*\}\}/gi, (f.name ?? '').split(' ')[0] || 'tudo bem');
        if (!text) {
          await this.prisma.followUp.update({ where: { id: f.id }, data: { status: 'done' } });
          continue;
        }

        try {
          await this.conversations.addMessage(f.tenantId, f.conversationId, {
            direction: 'outbound',
            content: text,
            intent: `followup_${nextStage}`,
            metadata: { followup: true, stage: nextStage },
          });
          const done = nextStage >= 2;
          await this.prisma.followUp.update({
            where: { id: f.id },
            data: {
              stage: nextStage,
              status: done ? 'done' : 'pending',
              // stage2 roda em (72h - 24h) = STAGE2-STAGE1 após o stage1
              nextRunAt: done ? f.nextRunAt : this.hoursFromNow(Math.max(1, STAGE2_HOURS - STAGE1_HOURS)),
            },
          });
          this.logger.log(`Follow-up #${nextStage} enviado p/ ${f.phone}`);
        } catch (e: any) {
          this.logger.warn(`Follow-up falhou p/ ${f.phone}: ${e?.message}`);
        }
      }
    } catch (e: any) {
      this.logger.error(`tick follow-up falhou: ${e?.message}`);
    }
  }
}
