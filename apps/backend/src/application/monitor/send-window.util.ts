/**
 * send-window.util.ts — T9 (2026-07-17): janela de envio geral do Monitor.
 *
 * Nada dispara fora da janela configurada (`sendWindowStart`..`sendWindowEnd`,
 * default 06:00–20:00) — digest de pendências, fechamento e visão do caixa
 * (todos respeitam, inclusive catch-up). Imediatos CRITICAL são a exceção
 * parcial: fora da janela, `criticalOutsideWindow` decide entre segurar
 * (`hold`, default — reagenda pra próxima abertura) ou furar (`send` —
 * comportamento pré-T9, dispara na hora).
 *
 * Granularidade de HORA (mesmo padrão do resto do Monitor — sendHour/sendMinute
 * já trabalham em janelas de 5min, não segundos).
 */

export const DEFAULT_SEND_WINDOW_START = 6;
export const DEFAULT_SEND_WINDOW_END = 20;
export const DEFAULT_CRITICAL_OUTSIDE_WINDOW: 'hold' | 'send' = 'hold';

/**
 * true quando `now` está dentro de [startHour, endHour) — endHour é exclusivo (20 = "até 19:59").
 *
 * ATENÇÃO: usa o fuso do PROCESSO (`getHours`), diferente do sender e do
 * follow-up, que corrigem para Brasília na mão. Funciona porque
 * `TZ=America/Sao_Paulo` está no compose e no .env — um deploy sem essa env
 * desloca a janela do Monitor em 3 horas sem nenhum erro. Trocar por
 * `brasiliaHour` (shared/utils/brasilia-hours.util.ts) exige atualizar os
 * testes do monitor, que constroem datas no fuso local; ver nota em
 * docs/infra/.
 */
export function isWithinSendWindow(now: Date, startHour: number, endHour: number): boolean {
  const h = now.getHours();
  return h >= startHour && h < endHour;
}

/**
 * Próximo instante em que a janela abre a partir de `now` — hoje às `startHour`
 * se ainda não passou, ou amanhã às `startHour` caso contrário (cobre tanto
 * "ainda não abriu hoje" quanto "já fechou hoje", com a mesma comparação).
 */
export function nextWindowOpen(now: Date, startHour: number): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 0, 0, 0);
  if (candidate.getTime() > now.getTime()) return candidate;
  candidate.setDate(candidate.getDate() + 1);
  return candidate;
}

/** Formata "HH:MM" (fuso local do servidor) — usado no sufixo "(ocorrido às HH:MM)". */
export function formatHourMinute(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
