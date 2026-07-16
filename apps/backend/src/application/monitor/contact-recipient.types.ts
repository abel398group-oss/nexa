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

/** T8: opção de resumo de fechamento por contato. Ausente/valor inválido = 'off'. */
export type ClosingReportKind = 'off' | 'biweekly' | 'monthly';
export const CLOSING_REPORT_KINDS: ClosingReportKind[] = ['off', 'biweekly', 'monthly'];

/** T8.6: opção de anexar o bloco "💰 SEU CAIXA" ao último digest do dia. Ausente/valor inválido = 'off'. */
export type CashViewMode = 'off' | 'lastSlot';
export const CASH_VIEW_MODES: CashViewMode[] = ['off', 'lastSlot'];

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
   * Data (YYYY-MM-DD) do último digest enviado com sucesso, por horário.
   *
   * T7 (2026-07-16): 1 envio por horário consolida TODOS os setores assinados —
   * chave `all|HH:MM` (ver `unifiedDigestSlotKey`), não mais uma por (setor, horário).
   *
   * Chaves antigas `${sector}|HH:MM` (ver `digestSlotKey`, pré-T7) continuam sendo
   * LIDAS por compatibilidade no dia do deploy — ConsolidationService trata uma
   * chave antiga de HOJE no mesmo horário como "já enviado" pro slot unificado,
   * pra nenhum contato receber o mesmo alerta duas vezes na virada do formato.
   * Não são mais ESCRITAS a partir do T7 — ficam inertes e podem ser removidas
   * do dado num cleanup futuro (não urgente).
   */
  lastDigestDate?: Record<string, string>;
  /**
   * T8 (2026-07-16): resumo de fechamento quinzenal/mensal (receita × custo ×
   * margem, vendas e caixa) — 'off' (default) | 'biweekly' (dias 16 e 1º às 07h)
   * | 'monthly' (só dia 1º às 07h). Independente dos `sendTimes` de pendências
   * (T7). Contato NOVO sem o campo = 'off' — ninguém nasce recebendo sem
   * escolher. Contato EXISTENTE editado sem reenviar o campo PRESERVA o valor
   * anterior (não reseta) — só um valor enviado fora do enum vira 'off' (ver
   * `sanitizeContacts`/`resolveOptionalEnum`; bug corrigido em 2026-07-16, uma
   * edição parcial vinda do TMS estava desligando o fechamento sem o usuário
   * ter mudado nada).
   *
   * TODO(fechamento-por-plano): hoje disponível em todos os planos sem gate —
   * se algum dia precisar restringir por plano, seguir o mesmo padrão de
   * `maxContactTimes()` em monitor-plan-limits.const.ts (decisão futura, não
   * implementar agora — ver doc T8).
   */
  closingReport?: ClosingReportKind;
  /**
   * T8.6 (2026-07-16): anexa o bloco "💰 SEU CAIXA" ao digest de pendências (T7)
   * só no ÚLTIMO horário do dia deste contato. 'off' (default) | 'lastSlot'.
   * Mesma semântica de preservação de `closingReport` acima: contato novo sem o
   * campo = 'off'; contato existente editado sem reenviar o campo preserva o
   * valor anterior (ver `sanitizeContacts`/`resolveOptionalEnum`).
   */
  cashView?: CashViewMode;
  /**
   * Data (YYYY-MM-DD) do último resumo de fechamento enviado com sucesso —
   * dedup do `ClosingReportService`, independente de `lastDigestDate` (T7, que
   * é por HH:MM). Reivindicado ANTES de enviar (claim-before-send, mesmo padrão).
   */
  lastClosingDate?: string;
}

/**
 * Monta a chave de dedup/catch-up de um (setor, horário) — pré-T7, ver `lastDigestDate`.
 * `sector` aceita `string` solto (não só `AlertSectorKey`) porque o único uso atual
 * (compat T7 em ConsolidationService) lê a partir de `SectorMeta.key`, que é `string`
 * — é só formatação de chave, não faz sentido travar o tipo aqui.
 */
export function digestSlotKey(sector: AlertSectorKey | string, time: ContactSendTime): string {
  return `${sector}|${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/**
 * T7: monta a chave de dedup/catch-up de um horário unificado (todos os setores
 * assinados juntos num envio só) — ver `lastDigestDate`.
 */
export function unifiedDigestSlotKey(time: ContactSendTime): string {
  return `all|${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/** Contato tem pelo menos um canal de envio configurado. */
export function contactHasChannel(c: Pick<ContactRecipient, 'whatsapp' | 'emails'>): boolean {
  return !!c.whatsapp?.trim() || (Array.isArray(c.emails) && c.emails.some((e) => e?.trim()));
}

/**
 * Saneia uma lista de contatos antes de persistir: gera `id` quando ausente,
 * cap de horários (3) e normaliza dias, remove contatos sem canal ou sem setor.
 * Preserva `lastDigestDate`/`lastClosingDate` existente quando o contato já
 * tinha `id` (edição). `closingReport`/`cashView` seguem o mesmo princípio via
 * `resolveOptionalEnum`: ausente em edição preserva o valor anterior, ausente
 * em contato novo vira 'off', presente-mas-inválido sempre vira 'off'.
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

      // T8-FIX (bug real, 2026-07-16): campo AUSENTE (`undefined`) em contato
      // EXISTENTE preserva o valor anterior — mesmo princípio de `lastDigestDate`/
      // `lastClosingDate` logo abaixo. Antes desta correção, um PUT parcial (ex.:
      // o TMS editando só sectors/sendTimes de um contato, sem reenviar
      // closingReport/cashView) resetava fechamento e caixa pra 'off' mesmo sem o
      // usuário ter mudado nada — mesma classe de bug do incidente de contrato
      // T6. Só um valor PRESENTE mas fora do enum vira 'off'; contato NOVO (sem
      // `prior`) sem o campo também cai em 'off' (ninguém nasce ligado sem escolher).
      const closingReport = resolveOptionalEnum(c.closingReport, CLOSING_REPORT_KINDS, prior?.closingReport, 'off');
      const cashView = resolveOptionalEnum(c.cashView, CASH_VIEW_MODES, prior?.cashView, 'off');

      const contact: ContactRecipient = {
        id,
        whatsapp,
        emails,
        sectors,
        sendTimes: sendTimes.length ? sendTimes : DEFAULT_SEND_TIMES,
        sendDays: sendDays.length ? sendDays : DEFAULT_SEND_DAYS,
        lastDigestDate: prior?.lastDigestDate,
        closingReport,
        cashView,
        lastClosingDate: prior?.lastClosingDate,
      };
      return contact;
    })
    .filter((c) => contactHasChannel(c) && c.sectors.length > 0);
}

/**
 * T7.2: valida que nenhum contato exceda o teto de horários (`sendTimes.length`)
 * permitido pro plano do tenant — ver `maxContactTimes()` em `monitor-plan-limits.const.ts`.
 *
 * Roda ANTES de `sanitizeContacts()`, que hoje só corta silenciosamente
 * (`.slice(0, MAX_SEND_TIMES_PER_CONTACT)`) sem avisar quem chamou — um cliente
 * (bug no front, chamada direta da API, etc.) que mande 5 horários simplesmente
 * tinha 2 descartados sem erro. Este helper transforma isso num 400 explícito.
 *
 * Não depende do Nest de propósito (é chamado tanto pelo MonitorController quanto
 * pelo MonitorService/proxy TMS — cada um decide qual exception lançar com a
 * mensagem retornada). Retorna `null` quando tudo está dentro do teto.
 */
export function validateContactSendTimesLimit(contacts: unknown, max: number): string | null {
  if (!Array.isArray(contacts)) return null;
  for (const c of contacts) {
    if (!c || typeof c !== 'object') continue;
    const sendTimes = (c as { sendTimes?: unknown }).sendTimes;
    if (Array.isArray(sendTimes) && sendTimes.length > max) {
      return (
        `Cada contato pode ter no máximo ${max} horário(s) de envio. ` +
        `Um dos contatos enviados tem ${sendTimes.length} — remova algum antes de salvar.`
      );
    }
  }
  return null;
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

/**
 * Resolve um campo enum opcional durante o `sanitizeContacts`: valor AUSENTE
 * (`undefined`) em edição preserva o que já estava salvo (`prior`) — nunca reseta
 * o que o caller não mandou, mesmo princípio de `lastDigestDate`/`lastClosingDate`.
 * Valor PRESENTE mas fora do enum vira `fallback`. Sem `prior` válido (contato
 * novo, ou `prior` que por algum motivo já estava corrompido) também cai no
 * `fallback` quando o campo está ausente.
 */
function resolveOptionalEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  prior: T | undefined,
  fallback: T,
): T {
  if (raw === undefined) {
    return prior !== undefined && allowed.includes(prior) ? prior : fallback;
  }
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

function cryptoRandomId(): string {
  // Evita import de 'node:crypto' só para isso; randomUUID já é global no runtime do Nest (Node 19+).
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
