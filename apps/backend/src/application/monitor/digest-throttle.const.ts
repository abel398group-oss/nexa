/**
 * digest-throttle.const.ts — severity-based frequency throttle for the
 * WhatsApp digest (2026-07-20, Abel's decision, inspired by the TMS
 * certificate-expiry cron that modulates FREQUENCY by urgency).
 *
 * Problem: high-volume rules (shipment.*, quote.*, installment.due_soon)
 * emit one event per document, flooding the WhatsApp digest until people
 * stop reading — and then they also miss the alerts that matter.
 *
 * Design:
 *   CRITICAL, OVERDUE → every digest (never throttled)
 *   DUE_SOON          → at most once every DUE_SOON_DAYS per contact
 *   INFO              → at most once every INFO_DAYS per contact
 *
 * Channel asymmetry: the throttle applies to WHATSAPP ONLY — e-mail always
 * carries the full set (reading e-mail is cheap; WhatsApp interrupts).
 *
 * Per-CONTACT cycle (not calendar-based like the TMS cron) because each
 * contact has its own sendTimes/sendDays — a contact whose digest only runs
 * on Tuesdays would never see DUE_SOON if the window were "Mondays only".
 * State lives in ContactRecipient.lastBandInclude (JSON, no migration) and
 * is preserved across TMS edits by sanitizeContacts.
 *
 * Escalation safety: the filter reads the CURRENT AlertState severity at
 * build time (sync updates severity on every ingest — monitor.service.ts
 * upsert). A DUE_SOON that worsens to OVERDUE mid-week lands in the
 * "every digest" band automatically — the throttle sticks to the band,
 * never to the event.
 */

/** Days each throttled severity waits between WhatsApp inclusions (per contact). */
export const DIGEST_THROTTLE_DAYS: Record<string, number> = {
  DUE_SOON: Number(process.env.DIGEST_THROTTLE_DUE_SOON_DAYS ?? 7),
  INFO: Number(process.env.DIGEST_THROTTLE_INFO_DAYS ?? 28),
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Should this severity band be included in the WhatsApp digest being built now?
 * Non-throttled severities (CRITICAL, OVERDUE, unknown) → always true.
 * Throttled: true when never included before or the cycle has elapsed.
 * `lastIncluded` is a YYYY-MM-DD string from ContactRecipient.lastBandInclude.
 */
export function isBandDue(severity: string, lastIncluded: string | undefined, now: Date): boolean {
  const days = DIGEST_THROTTLE_DAYS[severity];
  if (days === undefined || days <= 0) return true;
  if (!lastIncluded) return true;
  const last = new Date(`${lastIncluded}T00:00:00`);
  if (Number.isNaN(last.getTime())) return true; // dado corrompido → não esconder alerta
  return now.getTime() - last.getTime() >= days * DAY_MS;
}
