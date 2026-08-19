/**
 * sender-warmup.ts — o motor da escada de aquecimento.
 *
 * ## O buraco que isto fecha
 *
 * A escada de aquecimento (`WARMUP_DAILY = [10, 15, 20, 30]`) existia desde sempre e
 * era LIDA a cada envio para decidir o teto do dia. O que nunca existiu foi quem
 * subisse o degrau: `warmupStage` nascia 0 e nenhuma linha do sistema escrevia nele.
 *
 * O efeito não aparece em erro nenhum — o disparo funciona, respeita o limite e
 * registra tudo. Ele só nunca passa de 10 mensagens por dia, por número, para sempre.
 * Com duas linhas e uma base de ~30 mil leads frios, falar com a base uma única vez
 * levaria mais de quatro anos. Não era um limite escolhido; era um botão faltando.
 *
 * ## Por que a decisão mora aqui, pura
 *
 * Subir degrau cedo demais é como o WhatsApp bane chip: volume que cresce sem
 * histórico que o sustente. A regra que decide isso precisa ser lida e discutida sem
 * banco na frente — mesma razão de `sender-health.ts` existir separado do serviço.
 *
 * ## As quatro perguntas, nesta ordem
 *
 * 1. Já está no topo? Então não há o que subir.
 * 2. Passou tempo suficiente no degrau atual? Aquecimento é histórico, e histórico
 *    não se acelera.
 * 3. O número está saudável? Subir volume de um número com engajamento ruim é
 *    acelerar em direção ao bloqueio — o freio de engajamento e a escada olham o
 *    mesmo sinal e precisam concordar.
 * 4. Ele realmente USOU o degrau? Um número que podia mandar 10 por dia e mandou 3
 *    não aqueceu coisa nenhuma: ficou parado com permissão de andar. Subir o teto
 *    dele é dar folga a quem não pediu.
 */

/** Tetos diários por degrau. Espelha `WARMUP_DAILY` do sender — a fonte é o sender. */
export interface EscadaDeAquecimento {
  /** Teto de cada degrau, em mensagens/dia. */
  degraus: number[];
  /** Dias mínimos em um degrau antes de poder subir. */
  diasPorDegrau: number;
  /**
   * Fração do teto que o número precisa ter usado no período para o degrau contar
   * como cumprido. 1 = precisa ter mandado o equivalente a um dia cheio.
   */
  usoMinimoEmDias: number;
}

export function escadaDoEnv(degraus: number[]): EscadaDeAquecimento {
  return {
    degraus,
    diasPorDegrau: Number(process.env.WARMUP_DAYS_PER_STAGE ?? 3),
    usoMinimoEmDias: Number(process.env.WARMUP_MIN_USE_DAYS ?? 1),
  };
}

export interface EstadoDoNumero {
  warmupStage: number;
  /** Quando entrou no degrau atual. `null` = nunca carimbado — cai no `createdAt`. */
  stageSince: Date | null;
  createdAt: Date;
  /** Envios com sucesso atribuídos a este número desde que entrou no degrau. */
  enviadosNoEstagio: number;
  /** Veredito do freio de engajamento para o tenant. */
  saudavel: boolean;
}

export interface VeredictoDeAquecimento {
  avanca: boolean;
  /** Degrau resultante — igual ao atual quando não avança. */
  proximoEstagio: number;
  /** Motivo legível, sempre preenchido: vai para o log, inclusive quando NÃO sobe. */
  motivo: string;
}

/**
 * Decide se um número sobe de degrau. Sem banco, sem relógio interno — `agora` entra
 * como parâmetro para o teste fixar o tempo.
 */
export function decidirAquecimento(
  n: EstadoDoNumero,
  escada: EscadaDeAquecimento,
  agora: Date,
): VeredictoDeAquecimento {
  const atual = n.warmupStage;
  const ultimo = escada.degraus.length - 1;
  const fica = (motivo: string): VeredictoDeAquecimento => ({ avanca: false, proximoEstagio: atual, motivo });

  if (atual >= ultimo) {
    return fica(`já está no último degrau (${escada.degraus[ultimo]}/dia)`);
  }

  // Sem carimbo, o relógio começa no nascimento do número. É o que faz a escada
  // funcionar para os números que já existiam antes desta coluna existir, em vez de
  // travá-los para sempre esperando um carimbo que ninguém pôs.
  const desde = n.stageSince ?? n.createdAt;
  const dias = (agora.getTime() - desde.getTime()) / (24 * 60 * 60 * 1000);
  if (dias < escada.diasPorDegrau) {
    return fica(
      `${dias.toFixed(1)}d no degrau ${atual} — faltam ${(escada.diasPorDegrau - dias).toFixed(1)}d`,
    );
  }

  if (!n.saudavel) {
    return fica(`engajamento reprovado — subir volume agora é acelerar rumo ao bloqueio`);
  }

  const tetoAtual = escada.degraus[atual];
  const usoMinimo = Math.ceil(tetoAtual * escada.usoMinimoEmDias);
  if (n.enviadosNoEstagio < usoMinimo) {
    return fica(
      `mandou ${n.enviadosNoEstagio} de ${usoMinimo} necessários no degrau ${atual} — ` +
        `número parado não aquece`,
    );
  }

  const proximo = atual + 1;
  return {
    avanca: true,
    proximoEstagio: proximo,
    motivo:
      `${dias.toFixed(1)}d no degrau ${atual} com ${n.enviadosNoEstagio} envios e ` +
      `engajamento aprovado → ${escada.degraus[proximo]}/dia`,
  };
}
