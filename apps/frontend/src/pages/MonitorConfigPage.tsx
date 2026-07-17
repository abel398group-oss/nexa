/**
 * MonitorConfigPage — /settings/monitor
 * Monitor Proativo: alertas automáticos do TMS, um contato por pessoa (T9).
 *
 * Funcionalidades:
 *  - Contatos: nome + WhatsApp e/ou e-mails, setores, até 3 horários, matriz de
 *    entrega por canal (pendências/fechamento/caixa × WhatsApp/e-mail) — T9.
 *  - Janela geral de envio (config do Monitor) + hold de críticos fora dela.
 *  - Plan gate: exibe banner + bloqueia edição quando plano não permite.
 *  - Override de plano: visível apenas para platform admins.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { useAuth } from '@/app/providers/AuthContext';
import {
  Button,
  PageContainer,
  PageHeader,
  Breadcrumb,
  Icon,
  useConfirm,
  Modal,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
  EmptyState,
  IconButton,
} from '@/shared/ui';
import { SkeletonList } from '@/components/ui/Skeleton';
import { RecipientTagsInput, type Recipient } from '@/components/ui/RecipientTagsInput';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SectorKey = 'fiscal' | 'logistic' | 'frota' | 'finance';

const ALL_DAYS  = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS  = [1, 2, 3, 4, 5];
const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_TITLES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// ─── T6/T9: contatos com horário próprio ────────────────────────────────────
// Um contato (T9: uma PESSOA — nome + WhatsApp e/ou N e-mails) marca em quais
// setores recebe alerta, até 3 horários próprios e uma matriz de entrega por
// canal (T9). Tem prioridade no backend sobre o sectorConfig legado.

interface ContactSendTime {
  hour: number;
  minute: number;
}

/**
 * T8/T9-ADENDO: resumo de fechamento — 'off' (default) | 'weekly' (toda
 * segunda) | 'biweekly' (dias 16 e 1º) | 'monthly' (só dia 1º).
 */
type ClosingReportKind = 'off' | 'weekly' | 'biweekly' | 'monthly';
/**
 * T9-ADENDO (2026-07-17): anexa o bloco "💰 SEU CAIXA" em TODOS os horários
 * do dia — 'off' (default) | 'on'. `'lastSlot'` é alias legado mantido só
 * por compat com dados antigos (nunca mais escrito por esta UI).
 */
type CashViewMode = 'off' | 'on' | 'lastSlot';

/** T9: flags de canal — usado nas linhas da matriz de entrega (digest/closing). */
interface ChannelFlags {
  whatsapp: boolean;
  email: boolean;
}

/**
 * T9-WIZARD (2026-07-17): matriz "o que enviar em cada canal" — só 2 linhas
 * (digest/closing) × 2 colunas (whatsapp/email). Visão do caixa NÃO tem canal
 * próprio (protótipo aprovado): herda os canais do digest de pendências,
 * liga/desliga só por `cashView` — ver passo 3 do wizard.
 */
interface DeliveryMatrix {
  digest: ChannelFlags;
  closing: ChannelFlags;
}

interface ContactRecipient {
  id: string;
  /** T9: nome de exibição — opcional (contato legado pode não ter). */
  name?: string;
  whatsapp?: string;
  emails: string[];
  sectors: SectorKey[];
  sendTimes: ContactSendTime[];
  sendDays: number[];
  closingReport?: ClosingReportKind;
  cashView?: CashViewMode;
  /** T9: matriz explícita — ausente = deriva do comportamento pré-T9 (compat, ver backend `effectiveDelivery`). */
  delivery?: DeliveryMatrix;
}

const MAX_CONTACT_TIMES = 3;
const DEFAULT_CONTACT_TIME: ContactSendTime = { hour: 8, minute: 0 };
const CONTACT_NAME_MAX_LENGTH = 60;

/** T10 (2026-07-17): validação de e-mail do cadastro rápido "Só por e-mail". */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * T10 (2026-07-17): estado do cadastro rápido "Só por e-mail". E-mail é
 * ilimitado (não gasta número do plano) — cria um contato email-only. Se o
 * e-mail já existe em outro contato, VINCULA (soma setores + liga digest por
 * e-mail nele) em vez de duplicar — regra: um e-mail = uma pessoa.
 */
interface EmailQuickAddState {
  name: string;
  email: string;
  sectors: SectorKey[];
  sendTimes: ContactSendTime[];
  sendDays: number[];
  error: string | null;
  saving?: boolean;
}
function makeEmptyEmailForm(): EmailQuickAddState {
  return { name: '', email: '', sectors: [], sendTimes: [DEFAULT_CONTACT_TIME], sendDays: WEEKDAYS, error: null };
}

/** T9-WIZARD: legenda do chip de periodicidade no passo 2 (card "Receita × despesa"). */
const CLOSING_PERIODICITY_OPTIONS: { value: Exclude<ClosingReportKind, 'off'>; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
];

/**
 * T9-ADENDO (2026-07-17): único ponto de verificação "caixa está ligado" —
 * espelha `cashViewIsOn` do backend. 'lastSlot' é o alias legado, tratado
 * igual a 'on'. Nunca comparar `cashView === 'on'` direto fora daqui.
 */
function cashViewIsOn(mode: CashViewMode | undefined): boolean {
  return mode === 'on' || mode === 'lastSlot';
}

/** T9-WIZARD: os 2 cards do passo 2 — pills de canal por card. */
const DELIVERY_ROWS: { key: keyof DeliveryMatrix; label: string; subtitle?: string }[] = [
  { key: 'digest', label: '⚠️ Pendências do dia', subtitle: 'Até 3 relatórios/dia nos horários do passo 3' },
  { key: 'closing', label: '📊 Receita × despesa' },
];

/** T9-WIZARD: rótulos do indicador de progresso (protótipo aprovado 2026-07-17). */
const WIZARD_STEPS: { step: WizardStep; label: string }[] = [
  { step: 1, label: 'Quem recebe' },
  { step: 2, label: 'O que recebe' },
  { step: 3, label: 'Quando recebe' },
];

/**
 * T9-WIZARD: matriz default de contato NOVO — digest e closing ligados nos
 * dois canais (mesmo comportamento pré-T9/pré-wizard; a periodicidade default
 * é 'monthly', ver `openNewContact`). Caixa não entra aqui — é o chip
 * `cashView` do passo 3, que nasce 'off'. As flags só "pegam" de verdade no
 * canal que o contato realmente tiver — a trava final em `saveContactModal`
 * zera qualquer canal ausente antes de persistir.
 */
function defaultDeliveryMatrix(): DeliveryMatrix {
  return {
    digest: { whatsapp: true, email: true },
    closing: { whatsapp: true, email: true },
  };
}

/** T9-WIZARD: os 3 passos do assistente de contato. */
type WizardStep = 1 | 2 | 3;

interface ContactModalState {
  step: WizardStep;
  editId: string | null;
  name: string;
  whatsapp: string;
  emails: string[];
  sectors: SectorKey[];
  sendTimes: ContactSendTime[];
  sendDays: number[];
  /** T9-WIZARD: periodicidade escolhida no chip do passo 2 — sempre tem um valor,
   *  mesmo com o card "Receita × despesa" sem nenhum canal ligado (nesse caso o
   *  `closingReport` salvo vira 'off' de qualquer forma, ver saveContactModal). */
  closingPeriodicity: Exclude<ClosingReportKind, 'off'>;
  cashView: CashViewMode;
  delivery: DeliveryMatrix;
  /** T9-WIZARD: WhatsApp já preenchido quando o modal abriu — usado pra só
   *  bloquear ADIÇÃO de número novo no limite do plano, nunca a edição de um
   *  contato que já tinha número (ver passo 1, "N3.4"). */
  startedWithWa: boolean;
  error: string | null;
  /** true enquanto o PUT de salvar o contato está em voo (ver saveContactModal). */
  saving?: boolean;
}

/** T9: janela geral de envio do Monitor — nada dispara fora dela (ver send-window.util.ts no backend). */
const DEFAULT_SEND_WINDOW_START = 6;
const DEFAULT_SEND_WINDOW_END = 20;

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
  sectorConfig?: Record<string, unknown> | null;
  /** T6: contatos com horário próprio — fonte de verdade quando presente (ver ConsolidationService). */
  contacts?: ContactRecipient[];
  /** T9: janela geral de envio (default 06:00–20:00). */
  sendWindowStart?: number;
  sendWindowEnd?: number;
  /** T9: imediatos CRITICAL fora da janela — 'hold' (default) segura, 'send' fura. */
  criticalOutsideWindow?: 'hold' | 'send';
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
  sendWindowStart: DEFAULT_SEND_WINDOW_START,
  sendWindowEnd: DEFAULT_SEND_WINDOW_END,
  criticalOutsideWindow: 'hold',
  planAllowed: false,
  monitorOverride: false,
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function MonitorConfigPage() {
  const [cfg, setCfg]       = useState<MonitorConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  // T6/T9: contatos com horário próprio (até 3 horários, opcional, tem prioridade no backend).
  const [contacts, setContacts] = useState<ContactRecipient[]>([]);
  const [contactModal, setContactModal] = useState<ContactModalState | null>(null);
  /** Aba ativa da lista de contatos: 'all' ou um setor específico. */
  const [contactTab, setContactTab] = useState<'all' | SectorKey>('all');
  /** T10: form do cadastro rápido "Só por e-mail". */
  const [emailForm, setEmailForm] = useState<EmailQuickAddState>(makeEmptyEmailForm);

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

  useEffect(() => {
    if (!config) return;
    setCfg({ ...DEFAULT_CONFIG, ...config });
    setContacts(Array.isArray(config.contacts) ? config.contacts : []);
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
        // BUGFIX (2026-07): a grade legada "Alertas por setor" foi removida da tela
        // (T9, decisão 5 — cada contato já escolhe setores). Nunca reenviamos
        // sectorConfig — o backend preserva o que já está salvo e só deriva
        // phone/email a partir de `contacts` (deriveSectorConfigFallback).
        // T6: só envia contatos que tenham pelo menos 1 canal e 1 setor — evita
        // mandar rascunhos inválidos que o backend descartaria silenciosamente.
        // BUGFIX (2026-07): monta só os campos que o DTO conhece — `contacts` no
        // estado local carrega `lastDigestDate` vindo do GET (usado pro catch-up
        // do scheduler) e o backend rejeita esse campo extra (forbidNonWhitelisted).
        // Ver nota igual em persistContacts().
        contacts: contacts
          .filter((c) => (c.whatsapp || c.emails.length > 0) && c.sectors.length > 0)
          .map((c) => ({
            id: c.id,
            name: c.name,
            whatsapp: c.whatsapp,
            emails: c.emails,
            sectors: c.sectors,
            sendTimes: c.sendTimes,
            sendDays: c.sendDays,
            // T8: ver nota igual em persistContacts() — mesmo motivo.
            closingReport: c.closingReport ?? 'off',
            cashView: c.cashView ?? 'off',
            // T9: ver nota igual em persistContacts() — mesmo motivo.
            delivery: c.delivery,
          })),
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
  /** T9-WIZARD: "N disponíveis" — reaproveitado no rodapé da lista e no passo 1 do wizard. */
  const waAvailable    = Math.max(waNumbersLimit - waNumbersUsed, 0);

  /**
   * T9: janela de envio efetiva (config geral) — usada pro aviso não-bloqueante
   * de horário fora da janela no modal de contato.
   */
  const sendWindowStart = cfg.sendWindowStart ?? DEFAULT_SEND_WINDOW_START;
  const sendWindowEnd   = cfg.sendWindowEnd   ?? DEFAULT_SEND_WINDOW_END;

  /** true quando um horário (hour) cai fora da janela geral de envio [start, end). */
  function isOutsideSendWindow(hour: number): boolean {
    return !(hour >= sendWindowStart && hour < sendWindowEnd);
  }

  const set = <K extends keyof MonitorConfig>(key: K, val: MonitorConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: val }));

  // ─── T6/T9: CRUD de contatos ────────────────────────────────────────────────

  /** T9-WIZARD: contato = pessoa — abre o assistente de 3 passos no passo 1. */
  function openNewContact() {
    setContactModal({
      step: 1,
      editId: null,
      name: '',
      whatsapp: '',
      emails: [],
      sectors: [],
      sendTimes: [DEFAULT_CONTACT_TIME],
      sendDays: WEEKDAYS,
      // T8: contato NOVO nasce com fechamento Mensal pré-selecionado (decisão de
      // negócio 2026-07-16) — o usuário ainda vê e pode desligar antes de salvar.
      // Visão do caixa nasce sempre desligada (ninguém liga sem pedir).
      closingPeriodicity: 'monthly',
      cashView: 'off',
      delivery: defaultDeliveryMatrix(),
      startedWithWa: false,
      error: null,
    });
  }

  /** T9-WIZARD: edita a pessoa inteira — reabre o assistente no passo 1, tudo hidratado. */
  function openEditContact(c: ContactRecipient) {
    const hasWa = !!c.whatsapp;
    const hasEmail = c.emails.length > 0;
    const closingOn = c.closingReport !== undefined && c.closingReport !== 'off';
    setContactModal({
      step: 1,
      editId: c.id,
      name: c.name ?? '',
      whatsapp: c.whatsapp ?? '',
      emails: c.emails,
      sectors: c.sectors,
      sendTimes: c.sendTimes.length ? c.sendTimes : [DEFAULT_CONTACT_TIME],
      sendDays: c.sendDays?.length ? c.sendDays : WEEKDAYS,
      // T9-WIZARD: chip de periodicidade sempre tem um valor — usa o que já
      // estava salvo se for uma periodicidade real; 'off'/ausente cai no
      // default 'monthly' (mesma decisão de negócio de contato novo, só que
      // aqui é só a pré-seleção do chip — o card pode estar com os 2 canais
      // desligados, o que persiste como 'off' de qualquer forma ao salvar).
      closingPeriodicity: closingOn ? (c.closingReport as Exclude<ClosingReportKind, 'off'>) : 'monthly',
      // T9-ADENDO: o chip do passo 3 só tem 'off'/'on' — normaliza o alias legado
      // 'lastSlot' pra 'on' na hora de popular o modal (o dado salvo em si só
      // é normalizado no backend quando o usuário reenviar explicitamente).
      cashView: cashViewIsOn(c.cashView) ? 'on' : 'off',
      // T9-WIZARD: preserva a matriz explícita se já existir (só digest/closing
      // agora); senão deriva do compat (mesmo princípio do backend
      // `effectiveDelivery`, só que aqui é só pra pré-popular o modal — o
      // backend recalcula/força ao salvar de qualquer forma).
      delivery: c.delivery ?? {
        digest: { whatsapp: hasWa, email: hasEmail },
        closing: { whatsapp: hasWa && closingOn, email: hasEmail && closingOn },
      },
      startedWithWa: hasWa,
      error: null,
    });
  }

  /** T9: liga/desliga um canal numa linha da matriz de entrega. */
  function toggleDeliveryFlag(row: keyof DeliveryMatrix, channel: keyof ChannelFlags) {
    setContactModal((m) =>
      m
        ? {
            ...m,
            delivery: {
              ...m.delivery,
              [row]: { ...m.delivery[row], [channel]: !m.delivery[row][channel] },
            },
          }
        : m,
    );
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

  /** T9-WIZARD: chip "🍯 Visão do caixa" do passo 3 — liga/desliga (sem canal próprio). */
  function toggleCashChip() {
    setContactModal((m) => (m ? { ...m, cashView: m.cashView === 'off' ? 'on' : 'off', error: null } : m));
  }

  /**
   * T9-WIZARD: validação do passo 1 ("Quem recebe") — mesma regra do backend
   * (`validateContactHasChannel`): pelo menos um canal, telefone com DDI+DDD+
   * número, sem duplicar WhatsApp de outro contato. Roda ao clicar "Avançar".
   */
  function validateStep1(m: ContactModalState): string | null {
    const digits = m.whatsapp.replace(/\D/g, '');
    const hasWa = !!digits;
    const hasEmail = m.emails.length > 0;
    if (hasWa && digits.length < 12) {
      return 'Telefone inválido — use DDI + DDD + número (ex: 5511999999999).';
    }
    if (!hasWa && !hasEmail) {
      return 'Informe pelo menos um canal — WhatsApp ou e-mail.';
    }
    const dup = hasWa && contacts.some((c) => c.id !== m.editId && c.whatsapp === digits);
    if (dup) {
      return 'Esse WhatsApp já está cadastrado em outro contato.';
    }
    return null;
  }

  /** T9-WIZARD: avança pro próximo passo — valida o passo atual antes (só passo 1 bloqueia). */
  function advanceStep() {
    setContactModal((m) => {
      if (!m) return m;
      if (m.step === 1) {
        const err = validateStep1(m);
        if (err) return { ...m, error: err };
        return { ...m, step: 2, error: null };
      }
      if (m.step === 2) {
        return { ...m, step: 3, error: null };
      }
      return m;
    });
  }

  /** T9-WIZARD: volta um passo (sem validação — dados já digitados ficam preservados). */
  function goBackStep() {
    setContactModal((m) => (m && m.step > 1 ? { ...m, step: (m.step - 1) as WizardStep, error: null } : m));
  }

  /**
   * BUGFIX (2026-07): salvar/remover um contato só atualizava o estado local
   * `contacts` — só ia pro banco se o usuário clicasse no "Salvar" principal da
   * página depois. Se ele não clicasse (ou não percebesse que precisava), o
   * contato "sumia" ao atualizar a página porque nunca tinha sido persistido.
   * Agora cada operação grava direto no backend (payload mínimo, só `contacts`,
   * sem reenviar sectorConfig — ver nota em saveConfig).
   *
   * BUGFIX (2026-07): o GET /monitor/config devolve `lastDigestDate` nos contatos
   * que já passaram por um envio real (o backend usa esse campo pro catch-up do
   * scheduler). Esse campo não existe no ContactRecipientDto do backend — reenviar
   * ele batia no forbidNonWhitelisted do ValidationPipe e dava 400 ("property
   * lastDigestDate should not exist") em QUALQUER save, mesmo de um contato
   * diferente do que tinha o campo, porque a lista inteira é reenviada junto.
   * Por isso montamos aqui explicitamente só os campos que o DTO conhece.
   */
  async function persistContacts(next: ContactRecipient[]): Promise<boolean> {
    try {
      const filtered = next
        .filter((c) => (c.whatsapp || c.emails.length > 0) && c.sectors.length > 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          whatsapp: c.whatsapp,
          emails: c.emails,
          sectors: c.sectors,
          sendTimes: c.sendTimes,
          sendDays: c.sendDays,
          // T8: campos novos SEMPRE no payload — omitir aqui apagaria o fechamento/
          // caixa de TODOS os outros contatos no próximo save de qualquer um deles
          // (mesmo bug de origem do incidente T6 — ver REGRAS-SQUAD Regra 1).
          closingReport: c.closingReport ?? 'off',
          cashView: c.cashView ?? 'off',
          // T9: idem — matriz de entrega sempre junto (mesmo motivo acima).
          delivery: c.delivery,
        }));
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

  /** T9-WIZARD: passo 3 ("Quando recebe") — só falta validar setores; passo 1 já bloqueou antes de chegar aqui. */
  async function saveContactModal() {
    if (!contactModal) return;
    const digits = contactModal.whatsapp.replace(/\D/g, '');
    const hasWa = !!digits;
    const hasEmail = contactModal.emails.length > 0;

    if (contactModal.sectors.length === 0) {
      setContactModal({ ...contactModal, error: 'Selecione ao menos um setor.' });
      return;
    }

    const name = contactModal.name.trim().slice(0, CONTACT_NAME_MAX_LENGTH) || undefined;
    // T9-WIZARD: força false em qualquer canal que o contato não tenha de fato —
    // mesma trava defensiva do backend (`effectiveDelivery`), aplicada aqui
    // também pra não mandar uma matriz inconsistente (ex.: WhatsApp removido
    // mas ainda marcado na matriz).
    const digest: ChannelFlags = { whatsapp: contactModal.delivery.digest.whatsapp && hasWa, email: contactModal.delivery.digest.email && hasEmail };
    const closing: ChannelFlags = { whatsapp: contactModal.delivery.closing.whatsapp && hasWa, email: contactModal.delivery.closing.email && hasEmail };
    // T9-WIZARD: "nenhum canal ligado = 'off'" (doc, passo 2) — a periodicidade
    // do chip só vira `closingReport` de verdade se pelo menos 1 canal do card
    // "Receita × despesa" estiver aceso.
    const closingReport: ClosingReportKind = closing.whatsapp || closing.email ? contactModal.closingPeriodicity : 'off';

    const saved: ContactRecipient = {
      id: contactModal.editId ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      whatsapp: hasWa ? digits : undefined,
      emails: contactModal.emails,
      sectors: contactModal.sectors,
      sendTimes: contactModal.sendTimes,
      sendDays: contactModal.sendDays,
      closingReport,
      cashView: contactModal.cashView,
      delivery: { digest, closing },
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
      message: `${c.name || c.whatsapp || c.emails[0] || 'Este contato'} deixará de receber os alertas configurados nele.`,
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (!ok) return;
    const next = contacts.filter((x) => x.id !== c.id);
    const success = await persistContacts(next);
    if (success) toast.success('Contato removido.');
  }

  // ─── T10: cadastro rápido só-e-mail (e-mail é ilimitado) ────────────────────

  /** Contato existente que já usa o e-mail digitado — null se e-mail livre/vazio. */
  const emailDupContact = (() => {
    const e = emailForm.email.trim().toLowerCase();
    if (!e) return null;
    return contacts.find((c) => c.emails.some((x) => x.toLowerCase() === e)) ?? null;
  })();

  function toggleEmailFormSector(key: SectorKey) {
    setEmailForm((f) => {
      const has = f.sectors.includes(key);
      return { ...f, sectors: has ? f.sectors.filter((s) => s !== key) : [...f.sectors, key], error: null };
    });
  }
  function addEmailFormTime() {
    setEmailForm((f) => (f.sendTimes.length < MAX_CONTACT_TIMES ? { ...f, sendTimes: [...f.sendTimes, DEFAULT_CONTACT_TIME] } : f));
  }
  function removeEmailFormTime(idx: number) {
    setEmailForm((f) => (f.sendTimes.length > 1 ? { ...f, sendTimes: f.sendTimes.filter((_, i) => i !== idx) } : f));
  }
  function updateEmailFormTime(idx: number, field: 'hour' | 'minute', val: number) {
    setEmailForm((f) => ({ ...f, sendTimes: f.sendTimes.map((t, i) => (i === idx ? { ...t, [field]: val } : t)) }));
  }
  function toggleEmailFormDay(day: number) {
    setEmailForm((f) => {
      const next = f.sendDays.includes(day) ? f.sendDays.filter((d) => d !== day) : [...f.sendDays, day].sort((a, b) => a - b);
      return next.length === 0 ? f : { ...f, sendDays: next };
    });
  }

  /**
   * T10: salva o cadastro rápido só-e-mail. E-mail já existente NÃO duplica —
   * vincula (soma setores + liga digest por e-mail) no contato existente.
   */
  async function saveEmailOnly() {
    const email = emailForm.email.trim();
    if (!EMAIL_RE.test(email)) {
      setEmailForm((f) => ({ ...f, error: 'E-mail inválido.' }));
      return;
    }
    if (emailForm.sectors.length === 0) {
      setEmailForm((f) => ({ ...f, error: 'Escolha ao menos um setor.' }));
      return;
    }
    setEmailForm((f) => ({ ...f, error: null, saving: true }));

    let next: ContactRecipient[];
    if (emailDupContact) {
      // Vincular: soma setores no contato existente e garante digest por e-mail.
      const mergedSectors = Array.from(new Set([...emailDupContact.sectors, ...emailForm.sectors])) as SectorKey[];
      const base = emailDupContact.delivery ?? {
        digest: { whatsapp: !!emailDupContact.whatsapp, email: true },
        closing: { whatsapp: false, email: false },
      };
      const linked: ContactRecipient = {
        ...emailDupContact,
        sectors: mergedSectors,
        delivery: { ...base, digest: { ...base.digest, email: true } },
      };
      next = contacts.map((c) => (c.id === emailDupContact.id ? linked : c));
    } else {
      const created: ContactRecipient = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: emailForm.name.trim().slice(0, CONTACT_NAME_MAX_LENGTH) || undefined,
        whatsapp: undefined,
        emails: [email],
        sectors: emailForm.sectors,
        sendTimes: emailForm.sendTimes,
        sendDays: emailForm.sendDays,
        closingReport: 'off',
        cashView: 'off',
        delivery: { digest: { whatsapp: false, email: true }, closing: { whatsapp: false, email: false } },
      };
      next = [...contacts, created];
    }

    const ok = await persistContacts(next);
    if (!ok) {
      setEmailForm((f) => ({ ...f, saving: false, error: 'Não foi possível salvar — veja o erro acima e tente de novo.' }));
      return;
    }
    toast.success(emailDupContact ? 'E-mail vinculado ao contato existente!' : 'Contato por e-mail adicionado!');
    setEmailForm(makeEmptyEmailForm());
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

          {/* ─── T9: Janela de envio (config geral do Monitor) ─────────────── */}
          <div className={`card px-5 py-4 ${!planAllowed ? 'opacity-50 pointer-events-none' : ''}`}>
            <p className="text-sm font-semibold text-base-content">Janela de envio</p>
            <p className="text-xs text-base-content/50 mt-0.5 mb-3">
              Nada dispara fora dela — pendências, fechamento e caixa (inclusive reenvios atrasados).
              {/* T9-FIX (2026-07-17): seletor "Crítico fora da janela" removido — comportamento
                  fixo daqui pra frente (decisão do Abel), ver texto abaixo. */}
              {' '}Alertas críticos sempre seguram até a janela abrir, com "(ocorrido às HH:MM)".
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-base-content/50">
                <span>Das</span>
                <select
                  className="select select-bordered select-sm"
                  aria-label="Início da janela de envio"
                  value={sendWindowStart}
                  onChange={(e) => set('sendWindowStart', Number(e.target.value))}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                  ))}
                </select>
                <span>às</span>
                <select
                  className="select select-bordered select-sm"
                  aria-label="Fim da janela de envio"
                  value={sendWindowEnd}
                  onChange={(e) => set('sendWindowEnd', Number(e.target.value))}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ─── T9: Contatos — módulo único, uma linha por pessoa ─────────── */}
          <div className={`transition-opacity ${cfg.enabled && planAllowed ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="card px-5 py-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <div>
                  <p className="text-sm font-semibold text-base-content">Contatos</p>
                  <p className="text-xs text-base-content/50 mt-0.5">
                    Cada contato é uma pessoa (WhatsApp e/ou e-mail), com até 3 horários próprios (ex.: 08h,
                    13h, 18h), setores que assina e o que recebe em cada canal (pendências, fechamento, caixa).
                  </p>
                </div>
                <Button type="button" variant="primary" size="sm" onClick={openNewContact}>
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
                const list = contacts.filter(
                  (c) => contactTab === 'all' || c.sectors.includes(contactTab),
                );

                /** Resumo compacto dos dias de envio pra linha da lista. */
                const daySummary = (days: number[]) => {
                  const sorted = [...new Set(days)].sort((a, b) => a - b);
                  if (sorted.length === 7) return 'Todos os dias';
                  if (sorted.join(',') === '1,2,3,4,5') return 'Dias úteis';
                  return sorted.map((d) => DAY_TITLES[d]?.slice(0, 3)).join(', ');
                };

                /** T9: resumo do que o contato recebe (compat quando não tem `delivery` explícito). */
                const receivesSummary = (c: ContactRecipient): string => {
                  const hasWa = !!c.whatsapp;
                  const hasEmail = c.emails.length > 0;
                  const d = c.delivery ?? {
                    digest: { whatsapp: hasWa, email: hasEmail },
                    closing: {
                      whatsapp: hasWa && !!c.closingReport && c.closingReport !== 'off',
                      email: hasEmail && !!c.closingReport && c.closingReport !== 'off',
                    },
                  };
                  // T9-WIZARD: caixa não tem canal próprio — herda os canais efetivos
                  // do digest, mesma fórmula do backend (`effectiveDelivery`).
                  const cashOn = cashViewIsOn(c.cashView);
                  const cash = { whatsapp: d.digest.whatsapp && cashOn, email: d.digest.email && cashOn };
                  const parts: string[] = [];
                  if (d.digest.whatsapp || d.digest.email) parts.push('Pendências');
                  if (d.closing.whatsapp || d.closing.email) parts.push('Receita × despesa');
                  if (cash.whatsapp || cash.email) parts.push('Caixa');
                  return parts.length ? parts.join(', ') : '—';
                };

                if (list.length === 0) {
                  return (
                    <EmptyState
                      icon={<Icon name="users" className="h-8 w-8" />}
                      title="Nenhum contato cadastrado."
                      description={'Clique em "+ Novo contato" para criar uma pessoa com WhatsApp e/ou e-mail.'}
                    />
                  );
                }

                return (
                  <div className="mt-3 rounded-lg border border-base-200 overflow-hidden">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Contato</TH>
                          <TH>Setores</TH>
                          <TH>Horários</TH>
                          <TH>Recebe</TH>
                          <TH />
                        </TR>
                      </THead>
                      <TBody>
                        {list.map((c) => {
                          const idLabel = c.name || c.whatsapp || c.emails[0] || 'contato';
                          return (
                            <TR key={c.id}>
                              <TD className="min-w-0">
                                {c.name && (
                                  <p className="text-sm font-medium text-base-content truncate">{c.name}</p>
                                )}
                                <div className="flex flex-col gap-0.5">
                                  {c.whatsapp && (
                                    <span className="text-xs text-base-content/60 truncate">📱 {c.whatsapp}</span>
                                  )}
                                  {c.emails.map((e) => (
                                    <span key={e} className="text-xs text-base-content/60 truncate">✉️ {e}</span>
                                  ))}
                                </div>
                              </TD>
                              <TD>
                                <div className="flex flex-wrap gap-1">
                                  {c.sectors.map((key) => {
                                    const meta = SECTORS.find((s) => s.key === key);
                                    return (
                                      <Badge key={key} className={meta?.badgeClass}>
                                        {meta?.label ?? key}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </TD>
                              <TD>
                                <div className="flex flex-col gap-1">
                                  {/* Texto dos horários fica num único nó (join ' · ') — os testes dependem disso. */}
                                  <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-base-200/60 px-2 py-1 text-[11px] font-medium text-base-content/60 whitespace-nowrap">
                                    <Icon name="clock" className="h-3 w-3 opacity-60" />
                                    {c.sendTimes
                                      .map((t) => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`)
                                      .join(' · ')}
                                  </span>
                                  <span className="text-[10px] text-base-content/35 pl-0.5">{daySummary(c.sendDays)}</span>
                                  {c.sendTimes.some((t) => isOutsideSendWindow(t.hour)) && (
                                    <span className="text-[10px] text-warning/80 pl-0.5">
                                      ⚠️ fora da janela ({String(sendWindowStart).padStart(2, '0')}h–{String(sendWindowEnd).padStart(2, '0')}h)
                                    </span>
                                  )}
                                </div>
                              </TD>
                              <TD>
                                <p className="text-xs text-base-content/60">{receivesSummary(c)}</p>
                              </TD>
                              <TD>
                                <div className="flex gap-1 justify-end shrink-0">
                                  <IconButton
                                    variant="ghost"
                                    size="icon-xs"
                                    label={`Editar ${idLabel}`}
                                    title="Editar"
                                    onClick={() => openEditContact(c)}
                                  >
                                    <Icon name="edit" className="h-3.5 w-3.5" />
                                  </IconButton>
                                  <IconButton
                                    variant="ghost"
                                    size="icon-xs"
                                    className="!text-error hover:!text-error"
                                    label={`Remover ${idLabel}`}
                                    title="Remover"
                                    onClick={() => removeContact(c)}
                                  >
                                    <Icon name="trash" className="h-3.5 w-3.5" />
                                  </IconButton>
                                </div>
                              </TD>
                            </TR>
                          );
                        })}
                      </TBody>
                    </Table>
                    {planAllowed && waNumbersLimit > 0 && (
                      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-base-200">
                        <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-base-200">
                          <div
                            className={`h-full rounded-full transition-all ${atWaLimit ? 'bg-warning' : 'bg-emerald-500/70'}`}
                            style={{
                              width: `${
                                waNumbersUsed > 0
                                  ? Math.max(6, Math.min(100, Math.round((waNumbersUsed / waNumbersLimit) * 100)))
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <p className={`text-[11px] ${atWaLimit ? 'font-medium text-warning' : 'text-base-content/40'}`}>
                          {waNumbersUsed} de {waNumbersLimit} números do plano · {Math.max(waNumbersLimit - waNumbersUsed, 0)} disponíve{Math.max(waNumbersLimit - waNumbersUsed, 0) === 1 ? 'l' : 'is'}
                        </p>
                        {atWaLimit && (
                          <a
                            href="https://app.hipertms.com.br/configuracoes/assinatura"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto text-[11px] font-medium text-brand-500 underline hover:text-brand-400"
                          >
                            Adicionar número — R$ 29,90/mês
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ─── T10: Cadastro rápido só-e-mail (ilimitado) ──────────────── */}
          <div className={`transition-opacity ${cfg.enabled && planAllowed ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="card px-5 py-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-base-content">Só por e-mail</p>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                  ilimitado · não gasta número
                </span>
              </div>
              <p className="text-xs text-base-content/50 mb-3">
                Pra quando o plano não tem mais número de WhatsApp — cadastre a pessoa só com e-mail.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-base-content/70 mb-1.5">Nome</p>
                  <input
                    type="text"
                    className="h-11 w-full rounded-md border border-base-300 bg-white px-4 text-sm text-base-content shadow-sm outline-none transition-colors placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30"
                    placeholder="Ex.: João (Fiscal)"
                    maxLength={CONTACT_NAME_MAX_LENGTH}
                    value={emailForm.name}
                    onChange={(e) => setEmailForm((f) => ({ ...f, name: e.target.value }))}
                    aria-label="Nome do contato por e-mail"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-base-content/70 mb-1.5">✉️ E-mail</p>
                  <input
                    type="email"
                    className="h-11 w-full rounded-md border border-base-300 bg-white px-4 text-sm text-base-content shadow-sm outline-none transition-colors placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30"
                    placeholder="joao@empresa.com"
                    value={emailForm.email}
                    onChange={(e) => setEmailForm((f) => ({ ...f, email: e.target.value, error: null }))}
                    aria-label="E-mail do contato"
                  />
                </div>
              </div>

              {emailDupContact && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
                  <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-xs text-warning">
                    Esse e-mail já está no contato{' '}
                    <strong className="font-medium">{emailDupContact.name || emailDupContact.whatsapp || emailDupContact.emails[0]}</strong>.{' '}
                    Vincular soma os setores escolhidos nele, sem duplicar.
                  </p>
                </div>
              )}

              <p className="text-sm font-medium text-base-content/70 mt-4 mb-1.5">O que enviar (setores)</p>
              <div className="flex flex-wrap gap-2">
                {SECTORS.map((s) => {
                  const active = emailForm.sectors.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleEmailFormSector(s.key)}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        active ? `border-transparent ${s.badgeClass}` : 'border-base-300 text-base-content/50 hover:bg-base-200'
                      }`}
                    >
                      {s.emoji} {s.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-base-content/70">Horários de envio (até 3)</p>
                  {emailForm.sendTimes.length < MAX_CONTACT_TIMES && (
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-500 hover:text-brand-400 transition-colors"
                      onClick={addEmailFormTime}
                    >
                      + adicionar horário
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {emailForm.sendTimes.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg border border-base-200 bg-base-200/30 px-2.5 py-1.5">
                      <Icon name="clock" className="h-3.5 w-3.5 text-base-content/30" />
                      <select
                        className="select select-bordered h-10 w-22"
                        aria-label={`Hora do horário ${i + 1}`}
                        value={t.hour}
                        onChange={(e) => updateEmailFormTime(i, 'hour', Number(e.target.value))}
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                        ))}
                      </select>
                      <select
                        className="select select-bordered h-10 w-22"
                        aria-label={`Minuto do horário ${i + 1}`}
                        value={t.minute}
                        onChange={(e) => updateEmailFormTime(i, 'minute', Number(e.target.value))}
                      >
                        {MINUTES.map((mm) => (
                          <option key={mm} value={mm}>{String(mm).padStart(2, '0')}min</option>
                        ))}
                      </select>
                      {emailForm.sendTimes.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remover horário ${i + 1}`}
                          className="ml-0.5 text-base-content/30 hover:text-error transition-colors"
                          onClick={() => removeEmailFormTime(i)}
                        >
                          <Icon name="close" className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {emailForm.sendTimes.some((t) => isOutsideSendWindow(t.hour)) && (
                  <p className="mt-2 text-[11px] text-warning/90">
                    ⚠️ Algum horário está fora da janela de envio ({String(sendWindowStart).padStart(2, '0')}h–{String(sendWindowEnd).padStart(2, '0')}h) — esse envio não sairá.
                  </p>
                )}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-base-content/70">Dias de envio</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium text-base-content/50 hover:bg-base-200 transition-colors"
                      onClick={() => setEmailForm((f) => ({ ...f, sendDays: [1, 2, 3, 4, 5] }))}
                    >
                      Dias úteis
                    </button>
                    <button
                      type="button"
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium text-base-content/50 hover:bg-base-200 transition-colors"
                      onClick={() => setEmailForm((f) => ({ ...f, sendDays: [...ALL_DAYS] }))}
                    >
                      Todos
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  {ALL_DAYS.map((day) => {
                    const active = emailForm.sendDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        title={DAY_TITLES[day]}
                        aria-pressed={active}
                        onClick={() => toggleEmailFormDay(day)}
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

              {emailForm.error && (
                <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2.5">
                  <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                  <p className="text-sm text-error">{emailForm.error}</p>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Button type="button" onClick={saveEmailOnly} loading={!!emailForm.saving} disabled={!!emailForm.saving}>
                  <Icon name="plus" className="h-3.5 w-3.5" /> {emailDupContact ? 'Vincular ao contato' : 'Adicionar por e-mail'}
                </Button>
              </div>
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

      {/* ─── T9-WIZARD: assistente de 3 passos — Quem recebe / O que recebe / Quando recebe ── */}
      <Modal
        open={!!contactModal}
        onClose={() => setContactModal(null)}
        title={contactModal?.editId ? 'Editar contato' : 'Novo contato'}
        size="xl"
        footer={
          contactModal && (
            <>
              {contactModal.step > 1 && (
                <Button type="button" variant="ghost" onClick={goBackStep} disabled={!!contactModal.saving}>
                  Voltar
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={() => setContactModal(null)} disabled={!!contactModal.saving}>
                Cancelar
              </Button>
              {contactModal.step < 3 ? (
                <Button type="button" onClick={advanceStep}>
                  Avançar
                </Button>
              ) : (
                <Button type="button" onClick={saveContactModal} loading={!!contactModal.saving} disabled={!!contactModal.saving}>
                  Salvar contato
                </Button>
              )}
            </>
          )
        }
      >
        {contactModal && (
          <div className="space-y-6">
            {/* Indicador de progresso — 1—2—3, passo concluído vira ✓. Clique só volta pra um passo já visitado. */}
            <div className="flex items-center gap-2" role="tablist" aria-label="Passos do cadastro de contato">
              {WIZARD_STEPS.map((s, idx) => {
                const done = contactModal.step > s.step;
                const active = contactModal.step === s.step;
                return (
                  <div key={s.step} className="flex items-center gap-2 flex-1 last:flex-initial">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`Passo ${s.step}: ${s.label}`}
                      disabled={s.step >= contactModal.step}
                      onClick={() => setContactModal((m) => (m && s.step < m.step ? { ...m, step: s.step, error: null } : m))}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors disabled:cursor-default ${
                        active
                          ? 'bg-brand-500 text-white'
                          : done
                            ? 'bg-success/20 text-success'
                            : 'bg-base-200 text-base-content/40'
                      }`}
                    >
                      {done ? '✓' : s.step}
                    </button>
                    <span className={`text-xs font-medium whitespace-nowrap ${active ? 'text-base-content' : 'text-base-content/40'}`}>
                      {s.label}
                    </span>
                    {idx < WIZARD_STEPS.length - 1 && <div className="h-px flex-1 bg-base-200" />}
                  </div>
                );
              })}
            </div>

            {/* ── Passo 1 — Quem recebe ─────────────────────────────────────── */}
            {contactModal.step === 1 && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-base-content/70 mb-1.5">Nome</p>
                  <input
                    type="text"
                    className="h-11 w-full rounded-md border border-base-300 bg-white px-4 text-sm text-base-content shadow-sm outline-none transition-colors placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30"
                    placeholder="Ex.: Maria (Financeiro)"
                    maxLength={CONTACT_NAME_MAX_LENGTH}
                    value={contactModal.name}
                    onChange={(e) => setContactModal({ ...contactModal, name: e.target.value })}
                    aria-label="Nome do contato"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-base-content/70 mb-1.5">📱 WhatsApp</p>
                    <input
                      type="tel"
                      inputMode="numeric"
                      className="h-11 w-full rounded-md border border-base-300 bg-white px-4 text-sm text-base-content shadow-sm outline-none transition-colors placeholder:text-base-content/40 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/30 disabled:bg-base-200/60 disabled:text-base-content/40"
                      placeholder="5511999999999 (com DDI)"
                      value={contactModal.whatsapp}
                      disabled={atWaLimit && !contactModal.startedWithWa}
                      onChange={(e) => setContactModal({ ...contactModal, whatsapp: e.target.value, error: null })}
                      aria-label="WhatsApp do contato"
                    />
                    <p className="mt-1.5 text-[11px] text-base-content/35">
                      Opcional. Só dígitos: DDI + DDD + número.
                    </p>
                    {atWaLimit && !contactModal.startedWithWa && (
                      <p className="mt-1.5 text-[11px] text-warning">
                        Limite de números do plano atingido — contatos só com e-mail continuam livres.{' '}
                        <a
                          href="https://app.hipertms.com.br/configuracoes/assinatura"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline hover:text-warning/80"
                        >
                          Adicionar número — R$ 29,90/mês
                        </a>
                      </p>
                    )}
                  </div>
                  <div>
                    <RecipientTagsInput
                      channel="email"
                      label="✉️ E-mails (ilimitado)"
                      value={contactModal.emails.map((e) => ({ contact: e, channel: 'email' as const }))}
                      onChange={updateContactEmails}
                      max={999}
                    />
                  </div>
                </div>

                {planAllowed && waNumbersLimit > 0 && (
                  <p className="text-[11px] text-base-content/40">
                    {waNumbersUsed} de {waNumbersLimit} números do plano · {waAvailable} disponíve{waAvailable === 1 ? 'l' : 'is'}
                  </p>
                )}
              </div>
            )}

            {/* ── Passo 2 — O que recebe ────────────────────────────────────── */}
            {contactModal.step === 2 && (
              <div className="space-y-4">
                {DELIVERY_ROWS.map((row) => (
                  <div key={row.key} className="rounded-lg border border-base-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-base-content">{row.label}</p>
                        {row.subtitle && (
                          <p className="text-xs text-base-content/50 mt-0.5">{row.subtitle}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          aria-pressed={contactModal.delivery[row.key].whatsapp}
                          aria-label={`${row.label} via WhatsApp`}
                          disabled={!contactModal.whatsapp}
                          onClick={() => toggleDeliveryFlag(row.key, 'whatsapp')}
                          className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors disabled:opacity-30 ${
                            contactModal.delivery[row.key].whatsapp
                              ? 'border-transparent bg-brand-500 text-white'
                              : 'border-base-300 text-base-content/40 hover:bg-base-200'
                          }`}
                        >
                          📱
                        </button>
                        <button
                          type="button"
                          aria-pressed={contactModal.delivery[row.key].email}
                          aria-label={`${row.label} via e-mail`}
                          disabled={contactModal.emails.length === 0}
                          onClick={() => toggleDeliveryFlag(row.key, 'email')}
                          className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors disabled:opacity-30 ${
                            contactModal.delivery[row.key].email
                              ? 'border-transparent bg-brand-500 text-white'
                              : 'border-base-300 text-base-content/40 hover:bg-base-200'
                          }`}
                        >
                          ✉️
                        </button>
                      </div>
                    </div>

                    {row.key === 'closing' && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {CLOSING_PERIODICITY_OPTIONS.map((opt) => {
                          const active = contactModal.closingPeriodicity === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setContactModal((m) => (m ? { ...m, closingPeriodicity: opt.value } : m))}
                              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                active ? 'bg-brand-500 text-white' : 'bg-base-200 text-base-content/50 hover:bg-base-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <p className="text-[11px] text-base-content/35">
                  A 💰 Visão do caixa você escolhe no próximo passo, junto dos setores.
                </p>
              </div>
            )}

            {/* ── Passo 3 — Quando recebe e o que entra ─────────────────────── */}
            {contactModal.step === 3 && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-base-content/70 mb-2">O que entra no relatório de pendências</p>
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
                    {/* T9-WIZARD: chip da Visão do caixa — estilo success pra diferenciar dos setores. */}
                    <button
                      type="button"
                      aria-pressed={cashViewIsOn(contactModal.cashView)}
                      onClick={toggleCashChip}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        cashViewIsOn(contactModal.cashView)
                          ? 'border-transparent bg-success/20 text-success'
                          : 'border-base-300 text-base-content/50 hover:bg-base-200'
                      }`}
                    >
                      🍯 Visão do caixa
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-base-content/35">
                    A Visão do caixa entra como bloco extra no topo do relatório.
                  </p>
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
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded-lg border border-base-200 bg-base-200/30 px-2.5 py-1.5"
                      >
                        <Icon name="clock" className="h-3.5 w-3.5 text-base-content/30" />
                        <select
                          className="select select-bordered h-10 w-22"
                          aria-label={`Hora do horário ${i + 1}`}
                          value={t.hour}
                          onChange={(e) => updateContactTime(i, 'hour', Number(e.target.value))}
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                          ))}
                        </select>
                        <select
                          className="select select-bordered h-10 w-22"
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
                            className="ml-0.5 text-base-content/30 hover:text-error transition-colors"
                            onClick={() => removeContactTime(i)}
                          >
                            <Icon name="close" className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* T9: aviso não-bloqueante — horário fora da janela geral de envio não sai. */}
                  {contactModal.sendTimes.some((t) => isOutsideSendWindow(t.hour)) && (
                    <p className="mt-2 text-[11px] text-warning/90">
                      ⚠️ Algum horário está fora da janela de envio ({String(sendWindowStart).padStart(2, '0')}h–
                      {String(sendWindowEnd).padStart(2, '0')}h) configurada acima — esse envio não sairá.
                    </p>
                  )}
                </div>

                <div className="border-t border-base-200 pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-base-content/70">Dias de envio</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-full px-2.5 py-1 text-[11px] font-medium text-base-content/50 hover:bg-base-200 transition-colors"
                        onClick={() => setContactModal((m) => (m ? { ...m, sendDays: [1, 2, 3, 4, 5] } : m))}
                      >
                        Dias úteis
                      </button>
                      <button
                        type="button"
                        className="rounded-full px-2.5 py-1 text-[11px] font-medium text-base-content/50 hover:bg-base-200 transition-colors"
                        onClick={() => setContactModal((m) => (m ? { ...m, sendDays: [...ALL_DAYS] } : m))}
                      >
                        Todos
                      </button>
                    </div>
                  </div>
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
              </div>
            )}

            {contactModal.error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2.5">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                <p className="text-sm text-error">{contactModal.error}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
