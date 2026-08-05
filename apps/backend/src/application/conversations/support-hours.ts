/**
 * support-hours.ts — quando o time humano de suporte está disponível.
 *
 * ## Por que existe
 *
 * A Lia atende 24/7 (correto — é o que o negócio quer), mas o humano é de
 * segunda a sexta. Sem essa noção, duas coisas saíam erradas:
 *
 *  1. Escalar às 2h da manhã dizia "em breve alguém entrará em contato". "Em
 *     breve" eram 6 horas. O cliente ficava atualizando o chat esperando uma
 *     resposta que não vinha.
 *  2. O SLA contava a noite e o fim de semana inteiros. Um chamado crítico
 *     (SLA 1h) que entrava sábado estourava no sábado mesmo — o time chegava
 *     na segunda com alerta de violação que era impossível cumprir. Alerta
 *     impossível de cumprir vira alerta ignorado.
 *
 * Funções puras, sem I/O — testadas isoladamente (mesmo padrão de
 * `sender-health.ts` e `phone-eligibility.ts`).
 *
 * Fuso: Brasília (UTC-3) fixo. O Brasil não tem horário de verão desde 2019, e
 * depender do TZ do processo daria resultado diferente em produção (container
 * em UTC) e na máquina do dev.
 */

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Hora de abertura/fechamento do time humano (BRT). */
function startHour(): number {
  return Number(process.env.SUPPORT_START_HOUR ?? 8);
}
function endHour(): number {
  return Number(process.env.SUPPORT_END_HOUR ?? 18);
}

/** Instante → relógio de parede BRT (ler com os getters UTC). */
function toWall(d: Date): Date {
  return new Date(d.getTime() - BRT_OFFSET_MS);
}
/** Relógio de parede BRT → instante real. */
function fromWall(d: Date): Date {
  return new Date(d.getTime() + BRT_OFFSET_MS);
}

/** Início do dia (00:00 BRT) que contém `d`. */
function startOfDay(d: Date): Date {
  const w = toWall(d);
  w.setUTCHours(0, 0, 0, 0);
  return fromWall(w);
}

/**
 * Janela de atendimento do dia que contém `d`, ou null em sábado/domingo.
 * Feriado NÃO é tratado — exigiria calendário nacional + municipal, e o custo
 * de errar é pequeno (um alerta de SLA a mais num feriado).
 */
function windowOf(d: Date): { open: Date; close: Date } | null {
  const w = toWall(d);
  const dow = w.getUTCDay(); // 0 = domingo, 6 = sábado
  if (dow === 0 || dow === 6) return null;
  const open = new Date(w);
  open.setUTCHours(startHour(), 0, 0, 0);
  const close = new Date(w);
  close.setUTCHours(endHour(), 0, 0, 0);
  return { open: fromWall(open), close: fromWall(close) };
}

/** O time humano está atendendo neste instante? */
export function isWithinSupportHours(d: Date = new Date()): boolean {
  const win = windowOf(d);
  if (!win) return false;
  return d >= win.open && d < win.close;
}

/**
 * Tempo ÚTIL entre dois instantes, em milissegundos — ignora noites e fins de
 * semana. É o relógio honesto para SLA: o time só pode responder quando está
 * trabalhando.
 */
export function businessMsBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  let cursor = startOfDay(from);
  const fim = to.getTime();
  // Guarda de segurança: 400 dias. Um ticket parado mais que isso já estourou
  // qualquer SLA — não vale varrer o histórico inteiro para saber disso.
  for (let i = 0; i < 400 && cursor.getTime() < fim; i++) {
    const win = windowOf(cursor);
    if (win) {
      const a = Math.max(from.getTime(), win.open.getTime());
      const b = Math.min(fim, win.close.getTime());
      if (b > a) total += b - a;
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return total;
}

/** Horas úteis entre dois instantes. */
export function businessHoursBetween(from: Date, to: Date): number {
  return businessMsBetween(from, to) / (60 * 60 * 1000);
}

/**
 * Quando o time volta a atender, a partir de `d`. Devolve o próprio `d` se já
 * estiver dentro do horário.
 */
export function nextOpening(d: Date = new Date()): Date {
  if (isWithinSupportHours(d)) return d;
  let cursor = d;
  for (let i = 0; i < 14; i++) {
    const win = windowOf(cursor);
    if (win && d < win.open) return win.open;
    // já passou do expediente (ou é fim de semana): tenta o próximo dia
    cursor = new Date(startOfDay(cursor).getTime() + 24 * 60 * 60 * 1000);
  }
  return cursor; // inalcançável na prática (sempre há um dia útil em 14 dias)
}

/**
 * Frase pronta para o cliente sobre quando o time volta — "hoje", "amanhã" ou
 * o dia da semana. Vale dizer a verdade: "em breve" quando faltam 8 horas
 * corrói mais confiança do que o próprio tempo de espera.
 */
export function nextOpeningLabel(d: Date = new Date()): string {
  const abre = nextOpening(d);
  const diaAgora = startOfDay(d).getTime();
  const diaAbre = startOfDay(abre).getTime();
  const diffDias = Math.round((diaAbre - diaAgora) / (24 * 60 * 60 * 1000));
  const hora = `${String(toWall(abre).getUTCHours()).padStart(2, '0')}h`;

  if (diffDias === 0) return `hoje às ${hora}`;
  if (diffDias === 1) return `amanhã às ${hora}`;
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return `${dias[toWall(abre).getUTCDay()]} às ${hora}`;
}

/** Texto da janela de atendimento, para a mensagem ao cliente. */
export function supportHoursLabel(): string {
  return `de segunda a sexta, das ${startHour()}h às ${endHour()}h`;
}
