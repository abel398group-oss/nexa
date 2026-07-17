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

/** T9 (2026-07-17): nome de exibição do contato — máx. 60 caracteres. */
export const CONTACT_NAME_MAX_LENGTH = 60;

/** T9: flags de canal — usado nas 3 linhas da matriz de entrega (digest/closing/cash). */
export interface ChannelFlags {
  whatsapp: boolean;
  email: boolean;
}

/** T9: matriz "o que enviar em cada canal" — 3 linhas (digest/closing/cash) × 2 colunas (whatsapp/email). */
export interface DeliveryMatrix {
  digest: ChannelFlags;
  closing: ChannelFlags;
  cash: ChannelFlags;
}

export interface ContactRecipient {
  /** Estável entre saves — usado como chave de dedup/catch-up do scheduler. Gerado no 1º save se ausente. */
  id: string;
  /**
   * T9 (2026-07-17): nome de exibição — contato agora é "uma pessoa" (nome +
   * canais), não mais dois módulos separados de WhatsApp/e-mail. Opcional (nem
   * todo contato legado tem) — sanitize: trim, máx. `CONTACT_NAME_MAX_LENGTH`.
   * Ausente em edição preserva o valor anterior (mesmo princípio de
   * closingReport/cashView — ver `sanitizeContacts`).
   */
  name?: string;
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
  /**
   * T9 (2026-07-17): matriz explícita "o que enviar em cada canal". Ausente
   * (contato de antes do T9, ou nunca editado na UI nova) → NÃO assumir 'off'
   * em tudo — usar sempre `effectiveDelivery(contact)`, que deriva o
   * comportamento equivalente ao pré-T9 a partir de `closingReport`/`cashView`/
   * canais do contato. Ausente em edição preserva o valor anterior (mesmo
   * princípio de `closingReport`/`cashView`).
   */
  delivery?: DeliveryMatrix;
}

/**
 * T9: resolve a matriz EFETIVA de entrega por canal pra um contato — ÚNICO
 * ponto de derivação, usado por `ConsolidationService` (digest/cash) e
 * `ClosingReportService` (closing). NUNCA reimplementar esta lógica em outro
 * lugar (regra do doc T9).
 *
 * Com `delivery` explícito (contato editado na UI nova): usa a matriz salva.
 * Sem `delivery` (compat — contato de antes do T9): deriva em runtime, sem
 * migrar nada no banco —
 *   - digest:  true nos canais que o contato TEM (comportamento T7 atual);
 *   - closing: canais do contato SE `closingReport` != 'off'/ausente;
 *   - cash:    canais do contato SE `cashView` === 'lastSlot'.
 * Em ambos os casos, uma trava defensiva final zera qualquer canal que o
 * contato não tenha de fato (ex.: `delivery` salvo antes de remover o
 * WhatsApp do contato) — nunca confia cegamente no JSON persistido.
 */
export function effectiveDelivery(contact: ContactRecipient): DeliveryMatrix {
  const hasWa = !!contact.whatsapp?.trim();
  const hasEmail = Array.isArray(contact.emails) && contact.emails.length > 0;
  const closingOn = contact.closingReport === 'biweekly' || contact.closingReport === 'monthly';
  const cashOn = contact.cashView === 'lastSlot';

  const base: DeliveryMatrix = contact.delivery ?? {
    digest: { whatsapp: hasWa, email: hasEmail },
    closing: { whatsapp: hasWa && closingOn, email: hasEmail && closingOn },
    cash: { whatsapp: hasWa && cashOn, email: hasEmail && cashOn },
  };

  return {
    digest: { whatsapp: base.digest.whatsapp && hasWa, email: base.digest.email && hasEmail },
    closing: { whatsapp: base.closing.whatsapp && hasWa, email: base.closing.email && hasEmail },
    cash: { whatsapp: base.cash.whatsapp && hasWa, email: base.cash.email && hasEmail },
  };
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

      // T9: nome ausente em edição preserva o anterior (mesmo princípio de
      // closingReport/cashView); string enviada (mesmo vazia) é honrada —
      // enviar "" limpa o nome de propósito.
      const name =
        c.name === undefined
          ? prior?.name
          : typeof c.name === 'string'
            ? c.name.trim().slice(0, CONTACT_NAME_MAX_LENGTH) || undefined
            : undefined;

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

      // T9: matriz de entrega — ausente preserva a anterior (mesmo princípio dos
      // campos acima); presente é saneada (booleans + canal que o contato não
      // tem força false). Nunca reimplementar essa derivação fora daqui/effectiveDelivery.
      const delivery = sanitizeDelivery(c.delivery, !!whatsapp, emails.length > 0) ?? prior?.delivery;

      const contact: ContactRecipient = {
        id,
        name,
        whatsapp,
        emails,
        sectors,
        sendTimes: sendTimes.length ? sendTimes : DEFAULT_SEND_TIMES,
        sendDays: sendDays.length ? sendDays : DEFAULT_SEND_DAYS,
        lastDigestDate: prior?.lastDigestDate,
        closingReport,
        cashView,
        lastClosingDate: prior?.lastClosingDate,
        delivery,
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

function sanitizeChannelFlags(raw: unknown): ChannelFlags {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { whatsapp: r.whatsapp === true, email: r.email === true };
}

/**
 * Saneia a matriz de entrega enviada no payload: ausente (`undefined`/`null`)
 * retorna `undefined` (caller decide preservar o `prior`, mesmo padrão de
 * `resolveOptionalEnum`); presente normaliza cada flag pra boolean estrito e
 * força `false` num canal que o contato não tem de fato (`hasWa`/`hasEmail`).
 */
function sanitizeDelivery(raw: unknown, hasWa: boolean, hasEmail: boolean): DeliveryMatrix | undefined {
  if (raw === undefined || raw === null) return undefined;
  const r = typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const digest = sanitizeChannelFlags(r.digest);
  const closing = sanitizeChannelFlags(r.closing);
  const cash = sanitizeChannelFlags(r.cash);
  return {
    digest: { whatsapp: digest.whatsapp && hasWa, email: digest.email && hasEmail },
    closing: { whatsapp: closing.whatsapp && hasWa, email: closing.email && hasEmail },
    cash: { whatsapp: cash.whatsapp && hasWa, email: cash.email && hasEmail },
  };
}

/**
 * T9: valida que TODO contato enviado tenha pelo menos 1 canal (WhatsApp ou
 * algum e-mail) — ANTES de `sanitizeContacts`, que hoje descarta silenciosamente
 * contatos sem canal (mesmo motivo de `validateContactSendTimesLimit`: um corte
 * silencioso vira um contato "sumido" sem explicação nenhuma pro usuário).
 * Retorna `null` quando tudo OK.
 */
export function validateContactHasChannel(contacts: unknown): string | null {
  if (!Array.isArray(contacts)) return null;
  for (const c of contacts) {
    if (!c || typeof c !== 'object') continue;
    const raw = c as Record<string, unknown>;
    const hasWa = typeof raw.whatsapp === 'string' && raw.whatsapp.trim().length > 0;
    const hasEmail =
      Array.isArray(raw.emails) && raw.emails.some((e) => typeof e === 'string' && e.includes('@'));
    if (!hasWa && !hasEmail) {
      const label = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Um dos contatos enviados';
      return `${label} precisa de pelo menos um canal (WhatsApp ou e-mail) — adicione um antes de salvar.`;
    }
  }
  return null;
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
