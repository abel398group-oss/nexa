/**
 * sender-health.ts — freio por ENGAJAMENTO no disparo.
 *
 * ## O buraco que isto fecha
 *
 * O anti-ban do sender media tudo que sai (delay, warmup, teto diário/horário) e nada
 * do que volta. Uma lista ruim queimava o número até o teto, todo dia, sem nada frear:
 * o sistema não sabia a diferença entre 300 envios que geraram 40 conversas e 300 que
 * geraram 2 e um monte de bloqueio.
 *
 * Quem decide banir um número é o WhatsApp, e o sinal que ele mais usa é justamente
 * esse: gente que recebe e não responde (ou denuncia). Medir só o que sai é dirigir
 * olhando o velocímetro e ignorando o barulho do motor.
 *
 * ## Como funciona
 *
 * Janela de 24h. Conta quantos alvos foram enviados, quantos responderam e quantos
 * falharam. Abaixo de um piso de resposta OU acima de um teto de falha, o número é
 * desativado e o time avisado.
 *
 * ## Por que exige amostra mínima
 *
 * Com 5 envios e nenhuma resposta a taxa é 0%, e pausar aí seria absurdo — é ruído,
 * não sinal. `minSample` existe para o freio nunca disparar no começo de campanha,
 * que é exatamente quando ninguém respondeu ainda por falta de tempo.
 */

export interface HealthCounts {
  /** Alvos efetivamente enviados na janela. */
  sent: number;
  /** Destes, quantos responderam alguma coisa. */
  replied: number;
  /** Alvos que falharam no envio na mesma janela. */
  failed: number;
}

export interface HealthThresholds {
  /** Envios mínimos para o veredito valer. Abaixo disso, sempre saudável. */
  minSample: number;
  /** Piso de taxa de resposta (0..1). */
  minReplyRate: number;
  /** Teto de taxa de falha (0..1). */
  maxFailureRate: number;
}

export interface HealthAssessment extends HealthCounts {
  replyRate: number;
  failureRate: number;
  healthy: boolean;
  /** Motivo legível quando reprovado — vai para log e para a notificação. */
  reason?: string;
}

export function healthThresholdsFromEnv(): HealthThresholds {
  return {
    minSample: Number(process.env.SENDER_HEALTH_MIN_SAMPLE ?? 30),
    minReplyRate: Number(process.env.SENDER_HEALTH_MIN_REPLY_RATE ?? 0.03),
    maxFailureRate: Number(process.env.SENDER_HEALTH_MAX_FAILURE_RATE ?? 0.3),
  };
}

/**
 * Veredito puro — sem banco, sem relógio, sem I/O. Toda a regra de negócio do freio
 * mora aqui para poder ser testada com números na mão.
 */
export function assessHealth(counts: HealthCounts, t: HealthThresholds): HealthAssessment {
  const sent = Math.max(0, counts.sent);
  const replied = Math.max(0, counts.replied);
  const failed = Math.max(0, counts.failed);

  const replyRate = sent > 0 ? replied / sent : 0;
  const tentativas = sent + failed;
  const failureRate = tentativas > 0 ? failed / tentativas : 0;

  const base = { sent, replied, failed, replyRate, failureRate };

  // Amostra pequena demais: silêncio ainda não é sinal, é falta de tempo.
  if (sent < t.minSample) return { ...base, healthy: true };

  if (failureRate > t.maxFailureRate) {
    return {
      ...base,
      healthy: false,
      reason:
        `taxa de falha de ${pct(failureRate)} nas últimas 24h ` +
        `(${failed} de ${tentativas} tentativas) — acima do teto de ${pct(t.maxFailureRate)}`,
    };
  }

  if (replyRate < t.minReplyRate) {
    return {
      ...base,
      healthy: false,
      reason:
        `apenas ${pct(replyRate)} de resposta nas últimas 24h ` +
        `(${replied} de ${sent} envios) — abaixo do piso de ${pct(t.minReplyRate)}`,
    };
  }

  return { ...base, healthy: true };
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
