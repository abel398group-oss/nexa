/**
 * MonitorConfigPage — /settings/monitor
 * Monitor Proativo: alertas automáticos do TMS por setor.
 *
 * Funcionalidades:
 *  - Tags removíveis para WhatsApp e E-mail por setor (RecipientTagsInput)
 *  - Auto-fill de telefone/e-mail a partir do cadastro do usuário (GET /monitor/prefill)
 *  - Default Dom-Sáb (todos os dias) para novos setores
 *  - Plan gate: exibe banner + bloqueia edição quando plano não permite
 *  - Override de plano: visível apenas para platform admins
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { useAuth } from '@/app/providers/AuthContext';
import { Button, PageContainer, PageHeader, Breadcrumb, Icon, useConfirm, Modal } from '@/shared/ui';
import { SkeletonList } from '@/components/ui/Skeleton';
import { RecipientTagsInput, type Recipient } from '@/components/ui/RecipientTagsInput';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SectorKey = 'fiscal' | 'logistic' | 'frota' | 'finance';

/** Estado interno de um setor — usa recipients[] em vez de strings CSV. */
interface SectorDetail {
  /** Destinatários (WhatsApp + e-mail combinados). */
  recipients: Recipient[];
  sendHour: number;
  sendMinute: number;
  /** Dias da semana de envio (0=dom … 6=sáb). */
  sendDays: number[];
}

/** Shape do sectorConfig vindo do backend (pode ter campos legados ou recipients[]). */
interface BackendSectorDetail {
  phone?: string;
  email?: string;
  recipients?: Recipient[];
  sendHour?: number;
  sendMinute?: number;
  sendDays?: number[];
}

/**
 * Converte SectorDetail em payload para o backend.
 * Mantém phone/email = primeiro de cada canal (retrocompat já existente no backend).
 * Sempre envia recipients[] — o backend usa esse campo prioritariamente.
 */
function sectorToPayload(d: SectorDetail): BackendSectorDetail & { recipients: Recipient[] } {
  const waFirst  = d.recipients.find((r) => r.channel === 'whatsapp')?.contact ?? '';
  const emlFirst = d.recipients.find((r) => r.channel === 'email')?.contact ?? '';
  return {
    ...d,
    phone: waFirst,
    email: emlFirst,
    recipients: d.recipients,
  };
}

const ALL_DAYS  = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS  = [1, 2, 3, 4, 5];
const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_TITLES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type SectorConfigMap = Record<SectorKey, SectorDetail>;

// ─── T6: contatos com horário próprio ───────────────────────────────────────
// Um contato (1 WhatsApp e/ou N e-mails) marca em quais setores recebe alerta
// e até 3 horários próprios — independente do horário dos cards de setor acima.
// Quando presente, tem prioridade no backend sobre o sectorConfig legado.

interface ContactSendTime {
  hour: number;
  minute: number;
}

interface ContactRecipient {
  id: string;
  whatsapp?: string;
  emails: string[];
  sectors: SectorKey[];
  sendTimes: ContactSendTime[];
  sendDays: number[];
}

const MAX_CONTACT_TIMES = 3;
const DEFAULT_CONTACT_TIME: ContactSendTime = { hour: 8, minute: 0 };

interface ContactModalState {
  editId: string | null;
  whatsapp: string;
  emails: string[];
  sectors: SectorKey[];
  sendTimes: ContactSendTime[];
  sendDays: number[];
  error: string | null;
  /** true enquanto o PUT de salvar o contato está em voo (ver saveContactModal). */
  saving?: boolean;
}

interface MonitorConfig {
  enabled: boolean;
  sendHour: number;
  sendMinute: number;
  notificationPhone: string | null;
  recipients: unknown[];
  sendWeekends: boolean;
  channel: string;
  fiscalEnabled: boolean;
  logisticEnabled: boolean;
  frotaEnabled: boolean;
  financeEnabled: boolean;
  sectorConfig?: Record<string, BackendSectorDetail> | null;
  /** T6: contatos com horário próprio — fonte de verdade quando presente (ver ConsolidationService). */
  contacts?: ContactRecipient[];
  /** Computed by backend: true if tenant plan allows Monitor (or override active). */
  planAllowed?: boolean;
  /** True if platform admin enabled override for this tenant. */
  monitorOverride?: boolean;
  /** Number of unique WhatsApp numbers currently configured across all sectors. */
  waNumbersUsed?: number;
  /** Maximum WhatsApp numbers allowed by the current plan + extras. */
  waNumbersLimit?: number;
}

interface AlertState {
  id: string;
  severity: 'CRITICAL' | 'OVERDUE' | 'DUE_SOON' | 'INFO';
  category: string;
  title: string;
  description?: string;
  status: string;
  notifiedAt?: string;
  notifyCount: number;
}

interface NotificationLog {
  id: string;
  channel: 'whatsapp' | 'email';
  content: string;
  sentAt: string;
  success: boolean;
  error: string | null;
}

// ─── Setores ─────────────────────────────────────────────────────────────────

const SECTORS: Array<{
  key: SectorKey;
  enabledKey: keyof MonitorConfig;
  label: string;
  sub: string;
  emoji: string;
  borderClass: string;
  headerClass: string;
  badgeClass: string;
}> = [
  {
    key: 'fiscal',
    enabledKey: 'fiscalEnabled',
    label: 'Fiscal',
    sub: 'CT-e · MDF-e',
    emoji: '📄',
    borderClass: 'border-l-4 border-l-blue-500',
    headerClass: 'bg-blue-500/10',
    badgeClass: 'bg-blue-500/20 text-blue-400',
  },
  {
    key: 'logistic',
    enabledKey: 'logisticEnabled',
    label: 'Logística',
    sub: 'embarques · coletas',
    emoji: '🚚',
    borderClass: 'border-l-4 border-l-orange-500',
    headerClass: 'bg-orange-500/10',
    badgeClass: 'bg-orange-500/20 text-orange-400',
  },
  {
    key: 'frota',
    enabledKey: 'frotaEnabled',
    label: 'Frota',
    sub: 'manutenções · vencimentos',
    emoji: '🔧',
    borderClass: 'border-l-4 border-l-purple-500',
    headerClass: 'bg-purple-500/10',
    badgeClass: 'bg-purple-500/20 text-purple-400',
  },
  {
    key: 'finance',
    enabledKey: 'financeEnabled',
    label: 'Financeiro',
    sub: 'vencimentos · cobranças',
    emoji: '💰',
    borderClass: 'border-l-4 border-l-emerald-500',
    headerClass: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/20 text-emerald-400',
  },
];

/**
 * Standby (2026-07): grade "Alertas por setor" (horário padrão + 4 cards por setor)
 * tirada de tela a pedido do Abel — a tela de contatos (T6) cobre o fluxo principal
 * agora. Código mantido intacto (não removido) porque a intenção é reativar essa
 * grade depois, possivelmente lado a lado com os contatos. Reative trocando para `true`.
 */
const SECTOR_GRID_ENABLED = false;

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'badge-error',
  OVERDUE:  'badge-warning',
  DUE_SOON: 'badge-info',
  INFO:     'badge-ghost',
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Crítico',
  OVERDUE:  'Atrasado',
  DUE_SOON: 'A vencer',
  INFO:     'Info',
};

const CATEGORY_LABEL: Record<string, string> = {
  fiscal: 'Fiscal', logistic: 'Logística', frota: 'Frota', finance: 'Financeiro',
};

// ─── SectorNotifStrip ────────────────────────────────────────────────────────
// Strip colapsável no rodapé de cada card de setor.

function SectorNotifStrip({ sectorKey }: { sectorKey: SectorKey }) {
  const [expanded, setExpanded] = useState(false);

  const { data: logs = [], isLoading } = useQuery<NotificationLog[]>({
    queryKey: ['monitor-notif-strip', sectorKey],
    queryFn: () =>
      api.get(`/monitor/notification-logs?sector=${sectorKey}&limit=5`).then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return null;

  const last = logs[0];

  const dotClass = !last ? 'bg-base-300' : last.success ? 'bg-success' : 'bg-error';

  const lastLabel = last
    ? (() => {
        const d = new Date(last.sentAt);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        return sameDay
          ? `hoje ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      })()
    : 'nenhum envio';

  return (
    <div className="border-t border-base-200">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-base-200/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? 'Fechar histórico' : 'Ver histórico de envios'}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
          <span className="text-xs text-base-content/50">
            último envio:{' '}
            <span className="text-base-content/70">{lastLabel}</span>
          </span>
        </div>
        <span className="text-base-content/30 text-[10px]">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-base-200">
          {logs.length === 0 ? (
            <p className="px-5 py-3 text-xs text-base-content/40">
              Nenhum envio registrado para este setor.
            </p>
          ) : (
            logs.map((log) => {
              const time = new Date(log.sentAt).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              });
              const channelIcon = log.channel === 'whatsapp' ? '💬' : '📧';
              const preview =
                log.content.split('\n').find((l) => l.trim()) ?? log.content.slice(0, 60);
              return (
                <div key={log.id} className="flex items-center gap-2.5 px-5 py-2.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${log.success ? 'bg-success' : 'bg-error'}`}
                  />
                  <span className="text-xs shrink-0">{channelIcon}</span>
                  <p className="text-xs text-base-content/60 truncate flex-1">{preview}</p>
                  <span className="text-[10px] text-base-content/40 shrink-0">{time}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const DEFAULT_CONFIG: MonitorConfig = {
  enabled: false,
  sendHour: 7,
  sendMinute: 0,
  notificationPhone: null,
  recipients: [],
  sendWeekends: true,
  channel: 'whatsapp',
  fiscalEnabled: true,
  logisticEnabled: true,
  frotaEnabled: true,
  financeEnabled: true,
  sectorConfig: null,
  planAllowed: false,
  monitorOverride: false,
};

/** Cria sectorConfig vazio com dias Dom-Sáb por padrão. */
const makeSectorConfig = (defaultHour = 7, defaultMinute = 0): SectorConfigMap => ({
  fiscal:   { recipients: [], sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
  logistic: { recipients: [], sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
  frota:    { recipients: [], sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
  finance:  { recipients: [], sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
});

// ─── Componente ──────────────────────────────────────────────────────────────

export function MonitorConfigPage() {
  const [cfg, setCfg]       = useState<MonitorConfig>(DEFAULT_CONFIG);
  const [sectors, setSectors] = useState<SectorConfigMap>(makeSectorConfig());
  const [saving, setSaving] = useState(false);

  // T6: contatos com horário próprio (até 3 horários, opcional, tem prioridade no backend).
  const [contacts, setContacts] = useState<ContactRecipient[]>([]);
  const [contactModal, setContactModal] = useState<ContactModalState | null>(null);
  /** Aba ativa da lista de contatos: 'all' ou um setor específico (filtro, "lista única, canal misto"). */
  const [contactTab, setContactTab] = useState<'all' | SectorKey>('all');

  /** Horário padrão: referência para "Aplicar a todos" e badge "personalizado". */
  const [defaultSchedule, setDefaultSchedule] = useState<{
    sendHour: number;
    sendMinute: number;
    sendDays: number[];
  }>({ sendHour: 7, sendMinute: 0, sendDays: ALL_DAYS });

  const toast           = useToast();
  const confirm         = useConfirm();
  const qc              = useQueryClient();
  const { user }        = useAuth();
  const isPlatformAdmin = user?.tenantId === null || user?.tenantId === undefined;

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: config, isLoading: loadingConfig } = useQuery<MonitorConfig>({
    queryKey: ['monitor-config'],
    queryFn: () => api.get('/monitor/config').then((r) => r.data),
  });

  const { data: prefill } = useQuery<{ email: string | null; phone: string | null }>({
    queryKey: ['monitor-prefill'],
    queryFn: () => api.get('/monitor/prefill').then((r) => r.data),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!config) return;
    setCfg({ ...DEFAULT_CONFIG, ...config });
    setContacts(Array.isArray(config.contacts) ? config.contacts : []);

    const sc          = config.sectorConfig as Record<string, BackendSectorDetail> | null | undefined;
    const h           = config.sendHour ?? 7;
    const m           = config.sendMinute ?? 0;
    const legacyDays  = (config.sendWeekends ?? true) ? ALL_DAYS : WEEKDAYS;

    /**
     * Constrói SectorDetail a partir do payload do backend.
     * Prioridade: recipients[] → migra phone/email legados (e CSV antigo) → vazio.
     */
    const withRecipients = (detail?: BackendSectorDetail): SectorDetail => {
      const recips: Recipient[] = Array.isArray(detail?.recipients) ? detail!.recipients! : [];

      // Migração legada: sem recipients[] mas tem phone/email (string ou CSV)
      if (recips.length === 0 && detail) {
        if (detail.phone) {
          detail.phone
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((contact) => recips.push({ contact, channel: 'whatsapp' }));
        }
        if (detail.email) {
          detail.email
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((contact) => recips.push({ contact, channel: 'email' }));
        }
      }

      return {
        recipients: recips,
        sendHour:   detail?.sendHour ?? h,
        sendMinute: detail?.sendMinute ?? m,
        sendDays:   detail?.sendDays?.length ? detail.sendDays : legacyDays,
      };
    };

    setSectors({
      fiscal:   withRecipients(sc?.fiscal),
      logistic: withRecipients(sc?.logistic),
      frota:    withRecipients(sc?.frota),
      finance:  withRecipients(sc?.finance),
    });

    // Inicializa o horário padrão a partir do global do backend.
    // sendDays não existe no nível global → padrão ALL_DAYS.
    setDefaultSchedule({
      sendHour:   config.sendHour   ?? 7,
      sendMinute: config.sendMinute ?? 0,
      sendDays:   ALL_DAYS,
    });
  }, [config]);

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery<AlertState[]>({
    queryKey: ['monitor-alerts'],
    queryFn: () => api.get('/monitor/alerts').then((r) => r.data),
    refetchInterval: 60_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  async function saveConfig() {
    if (!planAllowed) {
      toast.error('Upgrade necessário para usar o Monitor Proativo.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...Object.fromEntries(
          Object.entries(cfg).filter(([k, v]) =>
            v !== null &&
            v !== undefined &&
            // Campos read-only do GET que o DTO do PUT não aceita (forbidNonWhitelisted).
            // REGRAS-SQUAD Regra 1: todo campo novo no GET entra aqui OU no DTO.
            !['sectorConfig', 'planAllowed', 'monitorOverride', 'waNumbersUsed', 'waNumbersLimit'].includes(k),
          ),
        ),
        // BUGFIX (2026-07): com a grade "Alertas por setor" em standby
        // (SECTOR_GRID_ENABLED=false), o estado local `sectors` fica parado — ainda
        // carrega os números antigos que vieram no último GET, mas o usuário não
        // consegue mais editá-los. Reenviar esse `sectorConfig` congelado a cada save
        // fazia o backend contar os números antigos + os novos contatos juntos no
        // limite de WhatsApp do plano, bloqueando o save do contato com 400 mesmo sem
        // nenhum número novo de fato ter sido adicionado além do necessário. Enquanto
        // a grade estiver oculta, não reenviamos sectorConfig — o backend preserva o
        // que já está salvo e só deriva phone/email a partir de `contacts`.
        ...(SECTOR_GRID_ENABLED
          ? {
              sectorConfig: {
                fiscal:   sectorToPayload(sectors.fiscal),
                logistic: sectorToPayload(sectors.logistic),
                frota:    sectorToPayload(sectors.frota),
                finance:  sectorToPayload(sectors.finance),
              },
            }
          : {}),
        // T6: só envia contatos que tenham pelo menos 1 canal e 1 setor — evita
        // mandar rascunhos inválidos que o backend descartaria silenciosamente.
        contacts: contacts.filter((c) => (c.whatsapp || c.emails.length > 0) && c.sectors.length > 0),
      };
      await api.put('/monitor/config', payload);
      qc.invalidateQueries({ queryKey: ['monitor-config'] });
      toast.success('Configurações salvas!');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Erro ao salvar configurações.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  const snooze = useMutation({
    mutationFn: (id: string) => api.post(`/monitor/alerts/${id}/snooze`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitor-alerts'] }); toast.success('Alerta adiado por 24h.'); },
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/monitor/alerts/${id}/resolve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitor-alerts'] }); toast.success('Alerta resolvido.'); },
  });

  const syncNow = useMutation({
    mutationFn: () => api.post('/monitor/sync'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success(`Sincronizado: ${res.data.synced} ativo(s), ${res.data.resolved} resolvido(s).`);
    },
    onError: () => toast.error('Falha ao sincronizar.'),
  });

  const testNotify = useMutation({
    mutationFn: () => api.post('/monitor/test'),
    onSuccess: (res) => {
      if (res.data.sent) toast.success(`✅ Teste enviado para ${res.data.phone}!`);
      else toast.error(`Falha: ${res.data.reason ?? 'erro desconhecido'}`);
    },
    onError: () => toast.error('Erro ao enviar teste.'),
  });

  const seedAlerts = useMutation({
    mutationFn: () => api.post('/monitor/seed-test'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success(`🧪 ${res.data.seeded} alerta(s) de teste criados!`);
    },
    onError: () => toast.error('Erro ao criar alertas de teste.'),
  });

  const notifyNow = useMutation({
    mutationFn: () => api.post('/monitor/notify-now'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success(`📨 Notificações disparadas: ${res.data.alerts} alerta(s).`);
    },
    onError: () => toast.error('Erro ao disparar notificações.'),
  });

  const toggleOverride = useMutation({
    mutationFn: (enabled: boolean) => api.post('/monitor/config/override', { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitor-config'] });
      toast.success('Override de plano atualizado.');
    },
    onError: () => toast.error('Erro ao alterar override.'),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const planAllowed    = cfg.planAllowed ?? false;
  const waNumbersUsed  = cfg.waNumbersUsed  ?? 0;
  const waNumbersLimit = cfg.waNumbersLimit ?? 0;
  const atWaLimit      = planAllowed && waNumbersLimit > 0 && waNumbersUsed >= waNumbersLimit;

  /**
   * Retorna true quando o setor tem hora/minuto/dias diferentes do horário padrão.
   * Usado para exibir o badge "personalizado" em cada card de setor.
   */
  function isSectorCustomized(sc: SectorDetail): boolean {
    if (sc.sendHour !== defaultSchedule.sendHour) return true;
    if (sc.sendMinute !== defaultSchedule.sendMinute) return true;
    const a = [...(sc.sendDays ?? ALL_DAYS)].sort((x, y) => x - y).join(',');
    const b = [...defaultSchedule.sendDays].sort((x, y) => x - y).join(',');
    return a !== b;
  }

  /** Liga/desliga um dia no horário padrão (mínimo 1 dia). */
  function toggleDefaultDay(day: number) {
    setDefaultSchedule((s) => {
      const next = s.sendDays.includes(day)
        ? s.sendDays.filter((d) => d !== day)
        : [...s.sendDays, day].sort((a, b) => a - b);
      if (next.length === 0) return s;
      return { ...s, sendDays: next };
    });
  }

  /** Copia defaultSchedule para os 4 setores (com confirmação). */
  async function applyScheduleToAll() {
    const ok = await confirm({
      title: 'Aplicar horário padrão a todos os setores?',
      message:
        'Isso substitui os horários individuais dos 4 setores. ' +
        'Você ainda pode ajustar qualquer setor individualmente depois.',
      confirmLabel: 'Aplicar a todos',
      variant: 'warning',
    });
    if (!ok) return;
    setSectors((s) => {
      const updated = { ...s };
      for (const key of Object.keys(updated) as SectorKey[]) {
        updated[key] = { ...updated[key], ...defaultSchedule };
      }
      return updated;
    });
    // Mantém cfg global em sincronia (sendHour/sendMinute vão no payload)
    set('sendHour', defaultSchedule.sendHour);
    set('sendMinute', defaultSchedule.sendMinute);
  }

  const set = <K extends keyof MonitorConfig>(key: K, val: MonitorConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: val }));

  const setSectorField = (
    key: SectorKey,
    field: 'sendHour' | 'sendMinute',
    val: number,
  ) => setSectors((s) => ({ ...s, [key]: { ...s[key], [field]: val } }));

  const setSectorRecipients = (key: SectorKey, recipients: Recipient[]) =>
    setSectors((s) => ({ ...s, [key]: { ...s[key], recipients } }));

  /** Liga/desliga um dia do setor. Impede deixar zero dias (mínimo 1). */
  const toggleSectorDay = (key: SectorKey, day: number) =>
    setSectors((s) => {
      const current = s[key].sendDays ?? ALL_DAYS;
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      if (next.length === 0) return s;
      return { ...s, [key]: { ...s[key], sendDays: next } };
    });

  /**
   * Auto-fill: adiciona telefone/e-mail do cadastro nos setores que ainda não
   * têm nenhum destinatário do canal correspondente.
   */
  function fillAllSectorsFromPrefill() {
    if (!prefill) return;
    setSectors((s) => {
      const updated = { ...s };
      for (const key of Object.keys(updated) as SectorKey[]) {
        const existing = updated[key].recipients;
        const hasWa    = existing.some((r) => r.channel === 'whatsapp');
        const hasEmail = existing.some((r) => r.channel === 'email');
        const toAdd: Recipient[] = [];
        if (!hasWa    && prefill.phone) toAdd.push({ contact: prefill.phone, channel: 'whatsapp' });
        if (!hasEmail && prefill.email) toAdd.push({ contact: prefill.email, channel: 'email' });
        if (toAdd.length > 0) {
          updated[key] = {
            ...updated[key],
            recipients: [...existing, ...toAdd].slice(0, 10),
          };
        }
      }
      return updated;
    });
    toast.success('Dados pré-preenchidos a partir do seu cadastro.');
  }

  // ─── T6: CRUD de contatos ───────────────────────────────────────────────────

  function openNewContact() {
    setContactModal({
      editId: null,
      whatsapp: '',
      emails: [],
      sectors: [],
      sendTimes: [DEFAULT_CONTACT_TIME],
      sendDays: WEEKDAYS,
      error: null,
    });
  }

  function openEditContact(c: ContactRecipient) {
    setContactModal({
      editId: c.id,
      whatsapp: c.whatsapp ?? '',
      emails: c.emails,
      sectors: c.sectors,
      sendTimes: c.sendTimes.length ? c.sendTimes : [DEFAULT_CONTACT_TIME],
      sendDays: c.sendDays?.length ? c.sendDays : WEEKDAYS,
      error: null,
    });
  }

  function toggleContactSector(key: SectorKey) {
    setContactModal((m) => {
      if (!m) return m;
      const has = m.sectors.includes(key);
      return { ...m, sectors: has ? m.sectors.filter((s) => s !== key) : [...m.sectors, key], error: null };
    });
  }

  function toggleContactDay(day: number) {
    setContactModal((m) => {
      if (!m) return m;
      const next = m.sendDays.includes(day)
        ? m.sendDays.filter((d) => d !== day)
        : [...m.sendDays, day].sort((a, b) => a - b);
      if (next.length === 0) return m;
      return { ...m, sendDays: next };
    });
  }

  function addContactTime() {
    setContactModal((m) => (m && m.sendTimes.length < MAX_CONTACT_TIMES ? { ...m, sendTimes: [...m.sendTimes, DEFAULT_CONTACT_TIME] } : m));
  }

  function removeContactTime(idx: number) {
    setContactModal((m) => (m && m.sendTimes.length > 1 ? { ...m, sendTimes: m.sendTimes.filter((_, i) => i !== idx) } : m));
  }

  function updateContactTime(idx: number, field: 'hour' | 'minute', val: number) {
    setContactModal((m) => (m ? { ...m, sendTimes: m.sendTimes.map((t, i) => (i === idx ? { ...t, [field]: val } : t)) } : m));
  }

  function updateContactEmails(items: Recipient[]) {
    setContactModal((m) => (m ? { ...m, emails: items.map((i) => i.contact), error: null } : m));
  }

  /**
   * BUGFIX (2026-07): salvar/remover um contato só atualizava o estado local
   * `contacts` — só ia pro banco se o usuário clicasse no "Salvar" principal da
   * página depois. Se ele não clicasse (ou não percebesse que precisava), o
   * contato "sumia" ao atualizar a página porque nunca tinha sido persistido.
   * Agora cada operação grava direto no backend (payload mínimo, só `contacts`,
   * sem reenviar sectorConfig — ver nota em saveConfig).
   */
  async function persistContacts(next: ContactRecipient[]): Promise<boolean> {
    try {
      const filtered = next.filter((c) => (c.whatsapp || c.emails.length > 0) && c.sectors.length > 0);
      await api.put('/monitor/config', { contacts: filtered });
      setContacts(next);
      qc.invalidateQueries({ queryKey: ['monitor-config'] });
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Erro ao salvar contato.';
      toast.error(msg);
      return false;
    }
  }

  async function saveContactModal() {
    if (!contactModal) return;
    const digits = contactModal.whatsapp.replace(/\D/g, '');

    if (!digits && contactModal.emails.length === 0) {
      setContactModal({ ...contactModal, error: 'Informe um WhatsApp ou pelo menos um e-mail.' });
      return;
    }
    if (digits && digits.length < 12) {
      setContactModal({ ...contactModal, error: 'Telefone inválido — use DDI + DDD + número (ex: 5511999999999).' });
      return;
    }
    if (contactModal.sectors.length === 0) {
      setContactModal({ ...contactModal, error: 'Selecione ao menos um setor.' });
      return;
    }
    const dup = digits && contacts.some((c) => c.id !== contactModal.editId && c.whatsapp === digits);
    if (dup) {
      setContactModal({ ...contactModal, error: 'Esse WhatsApp já está cadastrado em outro contato.' });
      return;
    }

    const saved: ContactRecipient = {
      id: contactModal.editId ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      whatsapp: digits || undefined,
      emails: contactModal.emails,
      sectors: contactModal.sectors,
      sendTimes: contactModal.sendTimes,
      sendDays: contactModal.sendDays,
    };

    const next = contactModal.editId
      ? contacts.map((c) => (c.id === contactModal.editId ? saved : c))
      : [...contacts, saved];

    setContactModal({ ...contactModal, error: null, saving: true });
    const ok = await persistContacts(next);
    if (!ok) {
      setContactModal({ ...contactModal, error: 'Não foi possível salvar — veja o erro acima e tente de novo.', saving: false });
      return;
    }
    toast.success('Contato salvo!');
    setContactModal(null);
  }

  async function removeContact(c: ContactRecipient) {
    const ok = await confirm({
      title: 'Remover contato',
      message: `${c.whatsapp || c.emails[0] || 'Este contato'} deixará de receber os alertas configurados nele.`,
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (!ok) return;
    const next = contacts.filter((x) => x.id !== c.id);
    const success = await persistContacts(next);
    if (success) toast.success('Contato removido.');
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: 'Início', to: '/dashboard' },
              { label: 'Configurações' },
              { label: 'Monitor Proativo' },
            ]}
          />
        }
        title="Monitor Proativo"
        subtitle="Configure horários e canais de alerta por setor do TMS."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => syncNow.mutate()} loading={syncNow.isPending} title="Busca eventos atuais do TMS">
              <Icon name="refresh" className="h-4 w-4" /> Sincronizar
            </Button>
            {isPlatformAdmin && (
              <>
                <Button variant="ghost" onClick={() => seedAlerts.mutate()} loading={seedAlerts.isPending} title="Cria alertas de teste em todos os setores">
                  <Icon name="pulse" className="h-4 w-4" /> Seed alertas
                </Button>
                <Button variant="ghost" onClick={() => notifyNow.mutate()} loading={notifyNow.isPending} title="Dispara notificações agora para todos os setores">
                  <Icon name="send" className="h-4 w-4" /> Notificar agora
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() => testNotify.mutate()}
              loading={testNotify.isPending}
              title="Envia mensagem simples de teste para o primeiro canal configurado"
            >
              <Icon name="zap" className="h-4 w-4" /> Testar canal
            </Button>
            <Button onClick={saveConfig} loading={saving} disabled={!planAllowed}>
              <Icon name="check" className="h-4 w-4" /> Salvar
            </Button>
          </div>
        }
      />

      {loadingConfig ? (
        <SkeletonList />
      ) : (
        <div className="space-y-6">

          {/* ─── Banner de plano bloqueado ───────────────────────────────── */}
          {!planAllowed && (
            <div className="card px-6 py-5 border border-warning/40 bg-warning/5 flex items-start gap-4">
              <span className="text-2xl shrink-0">🔒</span>
              <div>
                <p className="text-sm font-semibold text-base-content">
                  Monitor Proativo disponível em todos os planos do HiperTMS. Ative uma assinatura para usar.
                </p>
                <p className="text-xs text-base-content/60 mt-1">
                  Entre em contato com o suporte para ativar sua assinatura e habilitar os alertas automáticos por WhatsApp e e-mail.
                </p>
              </div>
            </div>
          )}

          {/* ─── Override de plano (só platform admin) ───────────────────── */}
          {isPlatformAdmin && (
            <div className="card px-6 py-4 border border-dashed border-warning/60 bg-warning/5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-warning">Admin Override — plano</p>
                <p className="text-xs text-base-content/50 mt-0.5">
                  Habilita o Monitor para este tenant independentemente do plano contratado.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <span className="text-xs text-base-content/50">
                  {cfg.monitorOverride ? 'Override ativo' : 'Override inativo'}
                </span>
                <input
                  type="checkbox"
                  className="toggle toggle-warning toggle-sm"
                  checked={!!cfg.monitorOverride}
                  onChange={(e) => toggleOverride.mutate(e.target.checked)}
                  disabled={toggleOverride.isPending}
                />
              </label>
            </div>
          )}

          {/* ─── Configurações gerais ────────────────────────────────────── */}
          <div className={`card ${!planAllowed ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-base-200">
              <div>
                <p className="text-sm font-semibold text-base-content">Monitoramento ativo</p>
                <p className="text-xs text-base-content/50 mt-0.5">
                  Quando ativado, cada setor dispara alertas no telefone/e-mail e horário configurados abaixo.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-base-content/50">{cfg.enabled ? 'Ativo' : 'Inativo'}</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={cfg.enabled}
                  onChange={(e) => set('enabled', e.target.checked)}
                />
              </label>
            </div>
          </div>

          {/* ─── Grid de setores (standby — ver SECTOR_GRID_ENABLED) ───────── */}
          {SECTOR_GRID_ENABLED && (
          <div className={`transition-opacity ${cfg.enabled && planAllowed ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-base-content/40">
                Alertas por setor
              </p>
              {prefill && (prefill.phone || prefill.email) && (
                <button
                  type="button"
                  className="text-xs text-brand-500 hover:text-brand-400 transition-colors flex items-center gap-1"
                  onClick={fillAllSectorsFromPrefill}
                  title="Preenche com seus dados de cadastro nos setores em branco"
                >
                  <Icon name="users" className="h-3 w-3" />
                  Usar dados do meu cadastro
                </button>
              )}
            </div>

            {/* ─── Horário padrão ───────────────────────────────────────────── */}
            <div className="card px-5 py-4 mb-4 border border-base-200">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-base-content">Horário padrão (todos os setores)</p>
                  <p className="text-xs text-base-content/50 mt-0.5">
                    Horário base para os alertas. "Aplicar a todos" copia para os 4 setores; cada setor ainda pode ter horário individual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applyScheduleToAll}
                  className="shrink-0 rounded-md border border-base-300 bg-white px-3 py-1.5 text-xs font-medium text-base-content/70 shadow-sm hover:border-brand-500 hover:text-brand-600 transition-colors"
                >
                  Aplicar a todos os setores
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Hora */}
                <select
                  className="select select-bordered select-sm"
                  value={defaultSchedule.sendHour}
                  onChange={(e) =>
                    setDefaultSchedule((s) => ({ ...s, sendHour: Number(e.target.value) }))
                  }
                  aria-label="Hora padrão"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                  ))}
                </select>

                {/* Minuto */}
                <select
                  className="select select-bordered select-sm w-28"
                  value={defaultSchedule.sendMinute}
                  onChange={(e) =>
                    setDefaultSchedule((s) => ({ ...s, sendMinute: Number(e.target.value) }))
                  }
                  aria-label="Minuto padrão"
                >
                  {MINUTES.map((mm) => (
                    <option key={mm} value={mm}>{String(mm).padStart(2, '0')}min</option>
                  ))}
                </select>

                {/* Dias */}
                <div className="flex items-center gap-1.5">
                  {ALL_DAYS.map((day) => {
                    const active = defaultSchedule.sendDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        title={DAY_TITLES[day]}
                        aria-pressed={active}
                        onClick={() => toggleDefaultDay(day)}
                        className={`h-7 w-7 rounded-full text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-brand-500 text-white'
                            : 'bg-base-200 text-base-content/40 hover:bg-base-300'
                        }`}
                      >
                        {DAY_LABELS[day]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SECTORS.map((sector) => {
                const enabled = !!cfg[sector.enabledKey];
                const sc      = sectors[sector.key];
                const waRecips    = sc.recipients.filter((r) => r.channel === 'whatsapp');
                const emailRecips = sc.recipients.filter((r) => r.channel === 'email');

                return (
                  <div
                    key={sector.key}
                    className={`card overflow-hidden ${sector.borderClass}`}
                  >
                    {/* Cabeçalho colorido */}
                    <div className={`flex items-center justify-between gap-3 px-5 py-4 ${sector.headerClass} border-b border-base-200`}>
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${sector.badgeClass}`}>
                          {sector.emoji}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-base-content">{sector.label}</p>
                            {isSectorCustomized(sc) && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                personalizado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-base-content/50">{sector.sub}</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-base-content/40">
                          {enabled ? 'Ativo' : 'Inativo'}
                        </span>
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={enabled}
                          onChange={(e) => set(sector.enabledKey, e.target.checked as any)}
                        />
                      </label>
                    </div>

                    {/* Corpo */}
                    <div className={`px-5 py-5 space-y-5 transition-opacity ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>

                      {/* Horário */}
                      <div>
                        <p className="text-xs font-medium text-base-content/60 mb-2">
                          Horário do alerta (Brasília)
                        </p>
                        <div className="flex gap-2">
                          <select
                            className="select select-bordered select-sm flex-1"
                            value={sc.sendHour}
                            onChange={(e) => setSectorField(sector.key, 'sendHour', Number(e.target.value))}
                          >
                            {HOURS.map((h) => (
                              <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                            ))}
                          </select>
                          <select
                            className="select select-bordered select-sm w-28"
                            value={sc.sendMinute}
                            onChange={(e) => setSectorField(sector.key, 'sendMinute', Number(e.target.value))}
                          >
                            {MINUTES.map((mm) => (
                              <option key={mm} value={mm}>{String(mm).padStart(2, '0')}min</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Contador de números WhatsApp — visível só quando o plano tem limite */}
                      {planAllowed && waNumbersLimit > 0 && (
                        <div className="flex items-center justify-between text-xs text-base-content/50">
                          <span>📱 Números WhatsApp no plano</span>
                          <span className={atWaLimit ? 'font-semibold text-warning' : ''}>
                            {waNumbersUsed} / {waNumbersLimit}
                          </span>
                        </div>
                      )}

                      {/* Bloco de upsell — só no primeiro setor ao atingir o limite */}
                      {atWaLimit && sector.key === 'fiscal' && (
                        <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning/90">
                          <p className="font-semibold mb-0.5">Limite de números atingido</p>
                          <p>
                            Adicione mais números por{' '}
                            <span className="font-medium">R$ 29,90/número/mês</span> em{' '}
                            <a
                              href="https://app.hipertms.com.br/configuracoes/assinatura"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:opacity-80"
                            >
                              Configurações → Assinatura
                            </a>{' '}
                            no HiperTMS.
                          </p>
                        </div>
                      )}

                      {/* WhatsApp — RecipientTagsInput */}
                      {/* N3.4: disabled only when sector is off; removal always allowed.
                          Additions are blocked in onChange when tenant is at the WA limit. */}
                      <RecipientTagsInput
                        channel="whatsapp"
                        label="📱 WhatsApp (com DDI)"
                        value={waRecips}
                        onChange={(newWa) => {
                          // Block only ADDITION when at limit; removal is always allowed.
                          if (newWa.length > waRecips.length && atWaLimit) return;
                          setSectorRecipients(sector.key, [
                            ...newWa,
                            ...emailRecips,
                          ]);
                        }}
                        disabled={!enabled}
                        max={10}
                      />

                      {/* E-mail — RecipientTagsInput */}
                      <RecipientTagsInput
                        channel="email"
                        label="✉️ E-mail (opcional — canal dual)"
                        value={emailRecips}
                        onChange={(newEmail) =>
                          setSectorRecipients(sector.key, [
                            ...waRecips,
                            ...newEmail,
                          ])
                        }
                        disabled={!enabled}
                        max={10}
                      />

                      {/* Dias de envio */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium text-base-content/60">Dias de envio</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-[11px] text-base-content/40 hover:text-base-content/70 transition-colors"
                              onClick={() => setSectors((s) => ({ ...s, [sector.key]: { ...s[sector.key], sendDays: WEEKDAYS } }))}
                            >
                              Dias úteis
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-base-content/40 hover:text-base-content/70 transition-colors"
                              onClick={() => setSectors((s) => ({ ...s, [sector.key]: { ...s[sector.key], sendDays: ALL_DAYS } }))}
                            >
                              Todos
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          {ALL_DAYS.map((day) => {
                            const active = (sc.sendDays ?? ALL_DAYS).includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                title={DAY_TITLES[day]}
                                aria-pressed={active}
                                onClick={() => toggleSectorDay(sector.key, day)}
                                className={`h-7 w-7 rounded-full text-[11px] font-semibold transition-colors ${
                                  active
                                    ? 'bg-brand-500 text-white'
                                    : 'bg-base-200 text-base-content/40 hover:bg-base-300'
                                }`}
                              >
                                {DAY_LABELS[day]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Histórico de envios do setor */}
                    <SectorNotifStrip sectorKey={sector.key} />
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* ─── T6: Contatos com horário próprio — lista única, canal misto ── */}
          <div className={`transition-opacity ${cfg.enabled && planAllowed ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                <div>
                  <p className="text-sm font-semibold text-base-content">Contatos com horário próprio</p>
                  <p className="text-xs text-base-content/50 mt-0.5">
                    Opcional. Cada contato pode ter até 3 horários independentes por dia (ex.: 08h, 13h, 18h)
                    e escolher em quais setores recebe alerta. Contatos cadastrados aqui têm prioridade
                    sobre o horário dos cards de setor acima.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={openNewContact}>
                  <Icon name="plus" className="h-3.5 w-3.5" /> Novo contato
                </Button>
              </div>

              {/* Abas: Todos + um por setor */}
              <div className="flex flex-wrap items-center gap-1 mt-3 mb-1">
                <button
                  type="button"
                  aria-pressed={contactTab === 'all'}
                  onClick={() => setContactTab('all')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    contactTab === 'all'
                      ? 'bg-brand-500 text-white'
                      : 'text-base-content/50 hover:bg-base-200'
                  }`}
                >
                  Todos
                </button>
                {SECTORS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={contactTab === s.key}
                    onClick={() => setContactTab(s.key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      contactTab === s.key
                        ? 'bg-brand-500 text-white'
                        : 'text-base-content/50 hover:bg-base-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {(() => {
                const filtered = contacts.filter((c) => contactTab === 'all' || c.sectors.includes(contactTab));

                if (contacts.length === 0) {
                  return <p className="text-xs text-base-content/40 mt-3">Nenhum contato cadastrado.</p>;
                }
                if (filtered.length === 0) {
                  return <p className="text-xs text-base-content/40 mt-3">Nenhum contato neste setor.</p>;
                }

                return (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest text-base-content/40">
                          <th className="text-left font-semibold pb-2 pr-3">Contato</th>
                          <th className="text-left font-semibold pb-2 pr-3">Canal</th>
                          <th className="text-left font-semibold pb-2 pr-3">Setores</th>
                          <th className="text-left font-semibold pb-2 pr-3">Horários</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-base-200">
                        {filtered.map((c) => {
                          const idLabel = c.whatsapp || c.emails[0] || 'contato';
                          return (
                            <tr key={c.id}>
                              <td className="py-2.5 pr-3 min-w-0">
                                {c.whatsapp && <p className="text-sm font-medium text-base-content truncate">{c.whatsapp}</p>}
                                {c.emails.map((e) => (
                                  <p key={e} className="text-sm font-medium text-base-content truncate">{e}</p>
                                ))}
                              </td>
                              <td className="py-2.5 pr-3">
                                <div className="flex flex-wrap gap-1">
                                  {c.whatsapp && (
                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-400">
                                      WhatsApp
                                    </span>
                                  )}
                                  {c.emails.length > 0 && (
                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-base-300 text-base-content/60">
                                      E-mail
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 pr-3">
                                <div className="flex flex-wrap gap-1">
                                  {c.sectors.map((key) => {
                                    const meta = SECTORS.find((s) => s.key === key);
                                    return (
                                      <span
                                        key={key}
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta?.badgeClass ?? ''}`}
                                      >
                                        {meta?.label ?? key}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="py-2.5 pr-3">
                                <span className="text-[10px] text-base-content/40">
                                  {c.sendTimes
                                    .map((t) => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`)
                                    .join(' · ')}
                                </span>
                              </td>
                              <td className="py-2.5">
                                <div className="flex gap-1 justify-end shrink-0">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs"
                                    title="Editar"
                                    aria-label={`Editar ${idLabel}`}
                                    onClick={() => openEditContact(c)}
                                  >
                                    <Icon name="edit" className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-xs text-error"
                                    title="Remover"
                                    aria-label={`Remover ${idLabel}`}
                                    onClick={() => removeContact(c)}
                                  >
                                    <Icon name="trash" className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {contacts.length > 0 && (
                <p className="text-[11px] text-base-content/40 mt-3">
                  {planAllowed && waNumbersLimit > 0
                    ? `${waNumbersUsed} de ${waNumbersLimit} números de WhatsApp · e-mails ilimitados`
                    : 'E-mails ilimitados'}
                </p>
              )}
            </div>
          </div>

          {/* Alertas ativos */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-base-content/40 mb-4">
              Alertas ativos
              {alerts.length > 0 && (
                <span className="badge badge-neutral badge-sm ml-2 normal-case tracking-normal">
                  {alerts.length}
                </span>
              )}
            </p>

            {loadingAlerts ? (
              <SkeletonList />
            ) : alerts.length === 0 ? (
              <div className="card px-6 py-10 text-center text-base-content/40 text-sm">
                Nenhum alerta aberto no momento ✅
              </div>
            ) : (
              <div className="card divide-y divide-base-200">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start justify-between gap-3 px-5 py-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <span
                        className={`badge badge-sm mt-0.5 shrink-0 ${
                          SEVERITY_BADGE[alert.severity] ?? 'badge-ghost'
                        }`}
                      >
                        {SEVERITY_LABEL[alert.severity] ?? alert.severity}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-base-content truncate">{alert.title}</p>
                        {alert.description && (
                          <p className="text-xs text-base-content/50 mt-0.5 truncate">{alert.description}</p>
                        )}
                        <p className="text-xs text-base-content/40 mt-1">
                          {CATEGORY_LABEL[alert.category] ?? alert.category}
                          {alert.notifiedAt &&
                            ` · notificado ${new Date(alert.notifiedAt).toLocaleDateString('pt-BR')}`}
                          {alert.status === 'snoozed' && ' · adiado'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        className="btn btn-ghost btn-xs"
                        title="Adiar 24h"
                        onClick={() => snooze.mutate(alert.id)}
                      >
                        <Icon name="clock" className="h-3 w-3" />
                      </button>
                      <button
                        className="btn btn-ghost btn-xs text-success"
                        title="Marcar como resolvido"
                        onClick={() => resolve.mutate(alert.id)}
                      >
                        <Icon name="check" className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── T6: Modal de cadastro/edição de contato ───────────────────── */}
      <Modal
        open={!!contactModal}
        onClose={() => setContactModal(null)}
        title={contactModal?.editId ? 'Editar contato' : 'Novo contato'}
        size="xl"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setContactModal(null)} disabled={!!contactModal?.saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveContactModal} loading={!!contactModal?.saving} disabled={!!contactModal?.saving}>
              Salvar contato
            </Button>
          </>
        }
      >
        {contactModal && (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-base-content/70 mb-1.5">WhatsApp (com DDI, opcional)</p>
              <input
                type="tel"
                inputMode="numeric"
                className="h-11 w-full rounded-md border border-base-300 bg-white px-4 text-sm text-base-content shadow-sm outline-none transition-colors placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30"
                placeholder="5511999999999"
                value={contactModal.whatsapp}
                onChange={(e) => setContactModal({ ...contactModal, whatsapp: e.target.value, error: null })}
                aria-label="WhatsApp do contato"
              />
            </div>

            <div className="border-t border-base-200 pt-6">
              <RecipientTagsInput
                channel="email"
                label="E-mails (ilimitado)"
                value={contactModal.emails.map((e) => ({ contact: e, channel: 'email' as const }))}
                onChange={updateContactEmails}
                max={999}
              />
            </div>

            <div className="border-t border-base-200 pt-6">
              <p className="text-sm font-medium text-base-content/70 mb-2">Recebe alertas de</p>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map((s) => {
                  const active = contactModal.sectors.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleContactSector(s.key)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        active ? `border-transparent ${s.badgeClass}` : 'border-base-300 text-base-content/50 hover:bg-base-200'
                      }`}
                    >
                      {s.emoji} {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-base-200 pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-base-content/70">Horários de envio (até 3)</p>
                {contactModal.sendTimes.length < MAX_CONTACT_TIMES && (
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-500 hover:text-brand-400 transition-colors"
                    onClick={addContactTime}
                  >
                    + adicionar horário
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {contactModal.sendTimes.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="select select-bordered h-11 w-24"
                      aria-label={`Hora do horário ${i + 1}`}
                      value={t.hour}
                      onChange={(e) => updateContactTime(i, 'hour', Number(e.target.value))}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                      ))}
                    </select>
                    {/* TEMP (teste do Abel) — minuto de volta por enquanto. Remover junto com esta nota. */}
                    <select
                      className="select select-bordered h-11 w-24"
                      aria-label={`Minuto do horário ${i + 1}`}
                      value={t.minute}
                      onChange={(e) => updateContactTime(i, 'minute', Number(e.target.value))}
                    >
                      {MINUTES.map((mm) => (
                        <option key={mm} value={mm}>{String(mm).padStart(2, '0')}min</option>
                      ))}
                    </select>
                    {contactModal.sendTimes.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remover horário ${i + 1}`}
                        className="text-base-content/30 hover:text-error transition-colors"
                        onClick={() => removeContactTime(i)}
                      >
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-base-200 pt-6">
              <p className="text-sm font-medium text-base-content/70 mb-2">Dias de envio</p>
              <div className="flex gap-2">
                {ALL_DAYS.map((day) => {
                  const active = contactModal.sendDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      title={DAY_TITLES[day]}
                      aria-pressed={active}
                      onClick={() => toggleContactDay(day)}
                      className={`h-9 w-9 rounded-full text-xs font-semibold transition-colors ${
                        active ? 'bg-brand-500 text-white' : 'bg-base-200 text-base-content/40 hover:bg-base-300'
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>

            {contactModal.error && (
              <p role="alert" className="text-sm text-error">
                {contactModal.error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
