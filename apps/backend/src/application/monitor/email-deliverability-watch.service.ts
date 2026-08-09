/**
 * EmailDeliverabilityWatchService — termômetro de reputação do remetente.
 *
 * O disparo de e-mail tinha todas as travas de RITMO (intervalo, limite diário,
 * preaquecimento) e nenhuma de RESULTADO. Ninguém olhava a taxa de devolução nem a
 * de descadastro, então a resposta para "estamos queimando o domínio?" só chegaria
 * pelo pior caminho possível: os e-mails pararem de ser entregues.
 *
 * As duas métricas e os limiares são os das próprias provedoras:
 *
 *  • DEVOLUÇÃO (bounce) — Gmail/Outlook começam a desconfiar acima de 2%, e acima
 *    de 5% tratam o remetente como lista suja. Só devolução PERMANENTE conta: a
 *    temporária é normal e o servidor de origem ainda vai retentar.
 *  • DESCADASTRO — não é a taxa de reclamação de spam (essa só o Google Postmaster
 *    informa, e requer verificação do domínio lá), mas é o melhor sinal que temos
 *    dentro de casa: o Google exige reclamação abaixo de 0,10%, e descadastro em
 *    massa antecede reclamação em massa.
 *
 * SÓ LEITURA + 1 aviso. Não pausa campanha sozinho — quem decide parar é o operador,
 * porque a causa pode ser uma lista específica, não o domínio. Espelha o
 * ScaleWatchService, inclusive no dedup de 1 aviso por dia por métrica.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AdminAlertService } from './admin-alert.service';

/** Janela de análise: 7 dias. Curta o bastante para reagir, longa para ter amostra. */
const JANELA_DIAS = 7;

export interface DeliverabilitySnapshot {
  /** E-mails de campanha efetivamente enviados na janela. */
  enviados: number;
  /** Devoluções permanentes (alvos `failed` cujo motivo veio de DSN 5.x.x). */
  devolvidos: number;
  /** Descadastros no mesmo período. */
  descadastros: number;
  bouncePct: number;
  optOutPct: number;
  nivel: 'verde' | 'amarelo' | 'vermelho';
  janelaDias: number;
}

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);
const umaCasa = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class EmailDeliverabilityWatchService {
  private readonly logger = new Logger('EmailDeliverability');
  /** Último dia (YYYY-MM-DD) em que cada métrica avisou — dedup 1x/dia. */
  private readonly ultimoAviso = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAlert: AdminAlertService,
  ) {}

  private get habilitado(): boolean {
    return (process.env.EMAIL_DELIVERABILITY_WATCH ?? 'true').toLowerCase() === 'true';
  }

  private get bounceAlerta(): number {
    return Number(process.env.EMAIL_BOUNCE_WARN_PCT ?? 2);
  }

  private get bounceCritico(): number {
    return Number(process.env.EMAIL_BOUNCE_CRIT_PCT ?? 5);
  }

  private get optOutAlerta(): number {
    return Number(process.env.EMAIL_OPTOUT_WARN_PCT ?? 1);
  }

  /**
   * Amostra mínima para concluir qualquer coisa.
   *
   * Sem isto, o primeiro e-mail da vida que devolvesse produziria "100% de
   * devolução" e um alerta vermelho. Alerta que dispara à toa deixa de ser lido —
   * e aí o alerta verdadeiro também passa batido.
   */
  private get amostraMinima(): number {
    return Number(process.env.EMAIL_DELIVERABILITY_MIN_SAMPLE ?? 20);
  }

  /** Foto dos últimos 7 dias. Pública para teste e para uso futuro num endpoint. */
  async snapshot(agora: Date = new Date()): Promise<DeliverabilitySnapshot> {
    const desde = new Date(agora.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000);
    const deEmail = { campaign: { channel: 'email' } };

    const [enviados, devolvidos, descadastros] = await Promise.all([
      this.prisma.campaignTarget.count({
        where: { ...deEmail, status: 'sent', sentAt: { gte: desde } },
      }),
      // A devolução chega DEPOIS do envio e vira `failed` com motivo "bounce ..."
      // (ver EmailBounceService.record). Falha de SMTP na saída também é `failed`,
      // mas com outro motivo — por isso o filtro é pelo texto, não só pelo status:
      // erro de conexão nosso não é problema de reputação.
      this.prisma.campaignTarget.count({
        where: { ...deEmail, status: 'failed', error: { startsWith: 'bounce ' }, sentAt: { gte: desde } },
      }),
      this.prisma.contact.count({ where: { status: 'opted_out', optOutAt: { gte: desde } } }),
    ]);

    // Denominador: tudo que saiu de fato (entregue + devolvido). O devolvido saiu.
    const total = enviados + devolvidos;
    const bouncePct = umaCasa(pct(devolvidos, total));
    const optOutPct = umaCasa(pct(descadastros, total));

    const nivel: DeliverabilitySnapshot['nivel'] =
      total < this.amostraMinima ? 'verde'
      : bouncePct >= this.bounceCritico ? 'vermelho'
      : bouncePct >= this.bounceAlerta || optOutPct >= this.optOutAlerta ? 'amarelo'
      : 'verde';

    return {
      enviados,
      devolvidos,
      descadastros,
      bouncePct,
      optOutPct,
      nivel,
      janelaDias: JANELA_DIAS,
    };
  }

  /** Verificador de hora em hora. Avisa o admin nos dois canais, 1x/dia/métrica. */
  @Interval(60 * 60 * 1000)
  async tick(): Promise<void> {
    if (!this.habilitado) return;

    const snap = await this.snapshot().catch((e: any) => {
      this.logger.warn(`snapshot falhou: ${e?.message}`);
      return null;
    });
    if (!snap || snap.nivel === 'verde') return;

    const hoje = new Date().toISOString().slice(0, 10);
    const avisos: string[] = [];
    const total = snap.enviados + snap.devolvidos;

    if (snap.bouncePct >= this.bounceAlerta && this.ultimoAviso.get('bounce') !== hoje) {
      const critico = snap.bouncePct >= this.bounceCritico;
      avisos.push(
        `${critico ? 'CRÍTICO' : 'Atenção'} — devolução em ${snap.bouncePct}% ` +
        `(${snap.devolvidos} de ${total} nos últimos ${snap.janelaDias} dias). ` +
        `Limite tolerado pelas provedoras: ${this.bounceAlerta}% (crítico ${this.bounceCritico}%). ` +
        (critico
          ? 'Pause as campanhas de e-mail e higienize a lista antes de continuar — acima disso o domínio inteiro vai para o spam.'
          : 'Confira a origem da lista antes do próximo lote.'),
      );
      this.ultimoAviso.set('bounce', hoje);
    }

    if (snap.optOutPct >= this.optOutAlerta && this.ultimoAviso.get('optout') !== hoje) {
      avisos.push(
        `Atenção — descadastro em ${snap.optOutPct}% ` +
        `(${snap.descadastros} de ${total} nos últimos ${snap.janelaDias} dias). ` +
        'Descadastro alto costuma virar reclamação de spam, e o Google exige reclamação ' +
        'abaixo de 0,10%. Revise o público e o texto do primeiro contato.',
      );
      this.ultimoAviso.set('optout', hoje);
    }

    if (!avisos.length) return; // tudo já avisado hoje

    const enviado = await this.adminAlert.notifyAdmin('Nexa — entregabilidade de e-mail', avisos.join('\n\n'));
    if (!enviado.whatsapp && !enviado.email) {
      this.logger.warn(`Entregabilidade no ${snap.nivel} e nenhum canal de admin configurado — só log. ${avisos.join(' | ')}`);
      return;
    }
    this.logger.warn(
      `Entregabilidade ${snap.nivel}: aviso enviado (wa=${enviado.whatsapp} email=${enviado.email}) — ` +
      `bounce ${snap.bouncePct}% · descadastro ${snap.optOutPct}%`,
    );
  }
}
