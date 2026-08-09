import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ConversationsService } from '@/application/conversations/conversations.service';
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { spin } from '@/application/sender/spintax';
import { firstName, tidyMissingName } from '@/application/sender/name-render';

// Cadência configurável (horas). Default 24h e 72h (a partir do 1º contato).
const STAGE1_HOURS = Number(process.env.FOLLOWUP_STAGE1_HOURS ?? 24);
const STAGE2_HOURS = Number(process.env.FOLLOWUP_STAGE2_HOURS ?? 72);
const BUSINESS_START = Number(process.env.SENDER_BUSINESS_START ?? 7);
const BUSINESS_END = Number(process.env.SENDER_BUSINESS_END ?? 19);

// Espaçamento entre os envios de um mesmo lote (o tick pega até 5 por vez).
const SPACING_MIN_MS = Number(process.env.FOLLOWUP_SPACING_MIN_MS ?? 8000);
const SPACING_MAX_MS = Number(process.env.FOLLOWUP_SPACING_MAX_MS ?? 20000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const OPT_OUT_FOOTER = '\n\n_Responda SAIR para não receber mais mensagens._';

// DISP-018: o rodapé era CONCATENADO na constante, então o follow-up ignorava o
// LGPD_OPT_OUT_FOOTER — desligar a flag tirava o aviso do disparo mas ele voltava
// no follow-up de 24h/72h. Agora os dois canais leem a mesma chave.
// (a leitura é feita a cada envio, não no import, para o .env valer sem rebuild)
function optOutFooter(): string {
  return process.env.LGPD_OPT_OUT_FOOTER === 'false' ? '' : OPT_OUT_FOOTER;
}

/**
 * Textos do follow-up, em spintax (`{a|b|c}` — ver sender/spintax.ts).
 *
 * Eram duas frases fixas, enviadas caractere por caractere iguais para 100% dos
 * leads que não responderam. As campanhas ganharam spintax justamente porque
 * conteúdo idêntico repetido para números que nunca falaram com o remetente é o
 * sinal de spam mais direto que o WhatsApp usa — e o follow-up vai para
 * exatamente o mesmo público, com o mesmo número. Ficou de fora por descuido.
 *
 * Contagem de variantes (spinVariants): estágio 1 = 81, estágio 2 = 243.
 */
const MSG_BASE = {
  1:
    '{Oi|Olá|Opa} {{nome}}, {passando pra saber|passando aqui pra ver|só queria saber} se você ' +
    '{teve a chance de ver|conseguiu ver|chegou a ver} minha mensagem sobre o sistema de gestão de fretes. ' +
    '{Posso ajudar com alguma dúvida|Ficou alguma dúvida que eu possa esclarecer|Alguma dúvida que eu possa tirar}? 🙂',
  2:
    '{Oi|Olá|Opa} {{nome}}! {Última passadinha por aqui|Só uma última mensagem|Passando aqui pela última vez} 😊 ' +
    'Se {tiver interesse no|quiser conhecer o|fizer sentido pra você o} sistema de gestão de fretes do HiperTMS, ' +
    '{é só me chamar quando quiser|me chama quando quiser|estou por aqui}. {Abraço|Um abraço|Abraços}!',
};

// exportado para teste: o rodapé é resolvido na LEITURA (getter), então o spec
// consegue variar LGPD_OPT_OUT_FOOTER sem recarregar o módulo.
export const MSG = {
  get 1() { return MSG_BASE[1] + optOutFooter(); },
  get 2() { return MSG_BASE[2] + optOutFooter(); },
};

/**
 * Monta a mensagem do estágio: `{{nome}}` primeiro, spintax depois.
 *
 * A ordem importa e é a mesma do `SenderService.render`: com o placeholder já
 * resolvido, nenhuma chave remanescente pode ser confundida com grupo de
 * variação. Sem nome, o placeholder some e a frase se recompõe — o fallback
 * antigo era a string "tudo bem", que virava "Oi tudo bem, passando pra saber…".
 *
 * Exportada para teste; `rand` injetável para o spec fixar a variante sorteada.
 */
export function renderFollowUp(stage: 1 | 2, name?: string | null, rand: () => number = Math.random): string {
  const template = (MSG as Record<number, string>)[stage];
  if (!template) return '';
  const first = firstName(name);
  let txt = spin(template.replace(/\{\{\s*nome\s*\}\}/gi, first), rand);
  if (!first) txt = tidyMissingName(txt);
  return txt;
}

@Injectable()
export class FollowUpService {
  private readonly logger = new Logger('FollowUp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly lock: RedisLockService,
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
    // BUG-06 fix: usar hora de Brasília (UTC-3) — new Date().getHours() retorna UTC em containers Linux.
    // A solução definitiva é TZ=America/Sao_Paulo no .env / docker-compose (já adicionado).
    // Este fallback garante o comportamento correto mesmo sem a variável de ambiente.
    const brHour = (new Date().getUTCHours() - 3 + 24) % 24;
    return brHour >= BUSINESS_START && brHour < BUSINESS_END;
  }

  @Interval(20000) // checa a cada 20s
  async tick(): Promise<void> {
    // Multi-instance guard: only one replica runs the tick at a time.
    // TTL acima da duração máxima do tick: 5 alvos espaçados em até 20s dão ~80s,
    // mais o tempo de envio. Com os 60s antigos o lock expirava no meio do lote e
    // outra réplica (ou o próximo @Interval) entrava junto — exatamente o envio
    // duplicado que o lock existe para impedir.
    const release = await this.lock.acquire('lock:followup:tick', 180);
    if (!release) return;
    try {
      await this.tickLocked();
    } finally {
      await release();
    }
  }

  private async tickLocked() {
    try {
      if (!this.withinBusinessHours()) return;
      const due = await this.prisma.followUp.findMany({
        where: { status: 'pending', nextRunAt: { lte: new Date() } },
        take: 5,
      });
      for (const [i, f] of due.entries()) {
        // Espaça os envios do lote. O `take: 5` acima virava 5 mensagens do
        // mesmo número em poucos segundos, a cada 20s — rajada, que é o padrão
        // que o WhatsApp procura. O ritmo aqui é mais folgado que o da campanha
        // (30–90s) porque follow-up é para quem já recebeu uma mensagem nossa.
        if (i > 0) await sleep(SPACING_MIN_MS + Math.random() * (SPACING_MAX_MS - SPACING_MIN_MS));

        // segurança: não segue quem deu opt-out
        const contact = await this.prisma.contact.findFirst({ where: { tenantId: f.tenantId, phone: f.phone } });
        if (contact?.status === 'opted_out') {
          await this.prisma.followUp.update({ where: { id: f.id }, data: { status: 'stopped' } });
          continue;
        }

        const nextStage = f.stage + 1; // 1 ou 2
        const text = renderFollowUp(nextStage as 1 | 2, f.name);
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
            sendOrigin: 'followup',
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
