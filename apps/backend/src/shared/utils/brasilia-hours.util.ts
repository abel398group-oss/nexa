/**
 * brasilia-hours.util.ts — hora de Brasília a partir de um Date, sem depender
 * do fuso do processo.
 *
 * Containers Linux sobem em UTC. `getHours()` só devolve hora de Brasília se
 * `TZ=America/Sao_Paulo` estiver setado — está no compose e no .env hoje, mas é
 * uma dependência invisível: quem subir um deploy novo sem a env ganha uma
 * janela de envio deslocada em 3 horas, sem nenhum erro para denunciar.
 *
 * `sender.service.ts` e `followup.service.ts` já faziam a correção na mão
 * (`(getUTCHours() - 3 + 24) % 24`); `send-window.util.ts` não fazia. Este
 * módulo é o lugar único dessa conta.
 *
 * O Brasil não tem horário de verão desde 2019 (Decreto 9.772/2019), então o
 * offset é fixo. Se voltar, muda aqui e em nenhum outro lugar.
 */

export const BRASILIA_OFFSET_HOURS = -3;

const pad = (n: number) => String(n).padStart(2, '0');

/** Mesmo instante deslocado para que os getters UTC devolvam o relógio de Brasília. */
function shift(now: Date): Date {
  return new Date(now.getTime() + BRASILIA_OFFSET_HOURS * 3_600_000);
}

/** Hora cheia (0–23) em Brasília. */
export function brasiliaHour(now: Date): number {
  return shift(now).getUTCHours();
}

/** `YYYY-MM-DD` do dia em Brasília — vira meia-noite no fuso certo, não no do servidor. */
export function brasiliaDayStamp(now: Date): string {
  const d = shift(now);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `YYYY-MM-DD-HH` da hora corrente em Brasília. */
export function brasiliaHourStamp(now: Date): string {
  return `${brasiliaDayStamp(now)}-${pad(brasiliaHour(now))}`;
}

/**
 * true quando `now` está dentro de [startHour, endHour) no relógio de Brasília.
 * `endHour` é exclusivo: 19 significa "até 18:59".
 */
export function withinBusinessHours(now: Date, startHour: number, endHour: number): boolean {
  const h = brasiliaHour(now);
  return h >= startHour && h < endHour;
}
