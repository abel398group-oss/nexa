/**
 * contact-recipient.types.ts — T6 (2026-07): modelo de destinatário por CONTATO.
 *
 * Substitui a ideia de "um horário por setor" por "até 3 horários por contato".
 * Um contato (número de WhatsApp e/ou lista de e-mails) marca em quais setores
 * recebe alerta e em quais horários — cada contato é independente dos demais.
 *
 * `sectorConfig` (per-setor, legado A1) continua sendo a fonte de verdade para
 * tenants que não migraram — ver ConsolidationService.processForTenant. Este
 * arquivo só define o shape do novo formato + helpers puros compartilhados
 * entre controller, service e o scheduler (ConsolidationService).
 */

export type AlertSectorKey = 'fiscal' | 'logistic' | 'frota' | 'finance';

export const CONTACT_SECTOR_KEYS: AlertSectorKey[] = ['fiscal', 'logistic', 'frota', 'finance'];

/** Um horário de envio (granularidade de minuto — a janela do tick de 5min absorve o resto). */
export interface ContactSendTime {
  hour: number;
  minute: number;
}

/** Máximo de horários independentes por contato. */
export const MAX_SEND_TIMES_PER_CONTACT = 3;

/** Sugestão pré-preenchida quando um contato é criado sem horários explícitos. */
export const DEFAULT_SEND_TIMES: ContactSendTime[] = [
  { hour: 8, minute: 0 },
  { hour: 13, minute: 0 },
  { hour: 18, minute: 0 },
];

export const DEFAULT_SEND_DAYS = [1, 2, 3, 4, 5]; // dias úteis

export interface ContactRecipient {
  /** Estável entre saves — usado como chave de dedup/catch-up do scheduler. Gerado no 1º save se ausente. */
  id: string;
  /** Número de WhatsApp (normalizado). Um contato tem no máximo 1 número — para múltiplos números, cadastre outro contato. */
  whatsapp?: string;
  /** E-mails associados a este contato (0..N) — ex.: 1 WhatsApp + 2 e-mails em cópia. */
  emails: string[];
  /** Setores em que este contato recebe alerta. */
  sectors: AlertSectorKey[];
  /** Até 3 horários de envio próprios deste contato (independentes entre si). */
  sendTimes: ContactSendTime[];
  /** Dias da semana de envio (0=dom … 6=sáb). */
  sendDays: number[];
  /**
   * Data (YYYY-MM-DD) do último digest enviado com sucesso, por (setor, horário).
   * Chave: `${sector}|HH:MM` (um dos sendTimes do contato) → data do último envio.
   * Chaveado por horário específico (não só por setor) porque um contato pode ter
   * até 3 horários para o MESMO setor — cada um dispara e deduplica de forma
   * independente ao longo do dia. Sobrevive a restarts (persistido no banco),
   * mesmo mecanismo de catch-up do modo per-sector.
   */
  lastDigestDate?: Record<string, string>;
}

/** Monta a chave de dedup/catch-up de um (setor, horário) — ver `lastDigestDate`. */
export function digestSlotKey(sector: AlertSectorKey, time: ContactSendTime): string {
  return `${sector}|${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/** Contato tem pelo menos um canal de envio configurado. */
export function contactHasChannel(c: Pick<ContactRecipient, 'whatsapp' | 'emails'>): boolean {
  return !!c.whatsapp?.trim() || (Array.isArray(c.emails) && c.emails.some((e) => e?.trim()));
}

/**
 * Saneia uma lista de contatos antes de persistir: gera `id` quando ausente,
 * cap de horários (3) e normaliza dias, remove contatos sem canal ou sem setor.
 * Preserva `lastDigestDate` existente quando o contato já tinha `id` (edição).
 */
export function sanitizeContacts(
  input: unknown,
  existing?: ContactRecipient[] | null,
): ContactRecipient[] {
  if (!Array.isArray(input)) return [];
  const existingById = new Map((existing ?? []).map((c) => [c.id, c]));

  return input
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => {
      const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : cryptoRandomId();
      const whatsapp = typeof c.whatsapp === 'string' && c.whatsapp.trim() ? c.whatsapp.trim() : undefined;
      const emails = Array.isArray(c.emails)
        ? c.emails.filter((e): e is string => typeof e === 'string' && e.includes('@')).map((e) => e.trim())
        : [];
      const sectors = Array.isArray(c.sectors)
        ? (c.sectors.filter((s): s is AlertSectorKey => CONTACT_SECTOR_KEYS.includes(s as AlertSectorKey)) as AlertSectorKey[])
        : [];
      const sendTimesRaw = Array.isArray(c.sendTimes) ? c.sendTimes : [];
      const sendTimes = sendTimesRaw
        .filter(
          (t): t is ContactSendTime =>
            !!t &&
            typeof t === 'object' &&
            Number.isInteger((t as ContactSendTime).hour) &&
            Number.isInteger((t as ContactSendTime).minute) &&
            (t as ContactSendTime).hour >= 0 &&
            (t as ContactSendTime).hour <= 23 &&
            (t as ContactSendTime).minute >= 0 &&
            (t as ContactSendTime).minute <= 59,
        )
        .slice(0, MAX_SEND_TIMES_PER_CONTACT);
      const sendDaysRaw = Array.isArray(c.sendDays) ? c.sendDays : [];
      const sendDays = sendDaysRaw.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);

      const prior = existingById.get(id);

      const contact: ContactRecipient = {
        id,
        whatsapp,
        emails,
        sectors,
        sendTimes: sendTimes.length ? sendTimes : DEFAULT_SEND_TIMES,
        sendDays: sendDays.length ? sendDays : DEFAULT_SEND_DAYS,
        lastDigestDate: prior?.lastDigestDate,
      };
      return contact;
    })
    .filter((c) => contactHasChannel(c) && c.sectors.length > 0);
}

/** Deriva sectorConfig[setor].phone/.email legado a partir do primeiro contato de cada canal por setor.
 *  Não sobrescreve sendHour/sendMinute/sendDays/recipients/lastDigestDate já existentes no sectorConfig —
 *  só os campos phone/email, para consumidores antigos que ainda leem o formato por setor. */
export function deriveSectorConfigFallback(
  contacts: ContactRecipient[],
  existingSectorConfig: Record<string, any> | null | undefined,
): Record<string, any> {
  const out: Record<string, any> = { ...(existingSectorConfig ?? {}) };
  for (const sector of CONTACT_SECTOR_KEYS) {
    const firstWa = contacts.find((c) => c.sectors.includes(sector) && c.whatsapp)?.whatsapp;
    const firstEmail = contacts.find((c) => c.sectors.includes(sector) && c.emails.length)?.emails[0];
    if (firstWa === undefined && firstEmail === undefined) continue;
    out[sector] = {
      ...(out[sector] ?? {}),
      ...(firstWa !== undefined ? { phone: firstWa } : {}),
      ...(firstEmail !== undefined ? { email: firstEmail } : {}),
    };
  }
  return out;
}

function cryptoRandomId(): string {
  // Evita import de 'node:crypto' só para isso; randomUUID já é global no runtime do Nest (Node 19+).
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
