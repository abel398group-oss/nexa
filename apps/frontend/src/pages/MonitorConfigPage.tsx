/**
 * MonitorConfigPage — /settings/monitor
 * Monitor Proativo: alertas automáticos do TMS por setor.
 * Cada setor tem toggle, horário próprio, telefone WhatsApp e e-mail (canal dual).
 *
 * Funcionalidades:
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
import { Button, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';
import { SkeletonList } from '@/components/ui/Skeleton';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SectorKey = 'fiscal' | 'logistic' | 'frota' | 'finance';

interface SectorDetail {
  /** Telefones WhatsApp — aceita VÁRIOS separados por vírgula (A1: viram recipients[]). */
  phone: string;
  /** E-mails para canal dual — aceita VÁRIOS separados por vírgula (A1). */
  email: string;
  sendHour: number;
  sendMinute: number;
  /** Dias da semana de envio (0=dom … 6=sáb). */
  sendDays: number[];
}

/** A1: destinatário individual persistido no sectorConfig do backend. */
interface SectorRecipient {
  label?: string;
  contact: string;
  channel: 'whatsapp' | 'email';
}

/** A1: converte os campos CSV da tela em recipients[] (máx. 10) mantendo
 *  phone/email legados preenchidos com o primeiro de cada (retrocompat). */
function sectorToPayload(d: SectorDetail): SectorDetail & { recipients: SectorRecipient[] } {
  const phones = d.phone.split(',').map((s) => s.trim()).filter(Boolean);
  const emails = d.email.split(',').map((s) => s.trim()).filter(Boolean);
  const recipients: SectorRecipient[] = [
    ...phones.map((contact) => ({ contact, channel: 'whatsapp' as const })),
    ...emails.map((contact) => ({ contact, channel: 'email' as const })),
  ].slice(0, 10);
  return { ...d, phone: phones[0] ?? '', email: emails[0] ?? '', recipients };
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_TITLES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type SectorConfigMap = Record<SectorKey, SectorDetail>;

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
  sectorConfig?: SectorConfigMap | null;
  /** Computed by backend: true if tenant plan allows Monitor (or override active). */
  planAllowed?: boolean;
  /** True if platform admin enabled override for this tenant. */
  monitorOverride?: boolean;
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
// Collapsed: ponto de status + "último envio: hoje HH:mm".
// Expanded: lista compacta dos últimos envios daquele setor.

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

  const dotClass = !last
    ? 'bg-base-300'
    : last.success
    ? 'bg-success'
    : 'bg-error';

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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const DEFAULT_CONFIG: MonitorConfig = {
  enabled: false,
  sendHour: 7,
  sendMinute: 0,
  notificationPhone: null,
  recipients: [],
  sendWeekends: true,  // default Dom-Sáb
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
  fiscal:   { phone: '', email: '', sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
  logistic: { phone: '', email: '', sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
  frota:    { phone: '', email: '', sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
  finance:  { phone: '', email: '', sendHour: defaultHour, sendMinute: defaultMinute, sendDays: ALL_DAYS },
});

// ─── Componente ──────────────────────────────────────────────────────────────

export function MonitorConfigPage() {
  const [cfg, setCfg] = useState<MonitorConfig>(DEFAULT_CONFIG);
  const [sectors, setSectors] = useState<SectorConfigMap>(makeSectorConfig());
  const [saving, setSaving] = useState(false);

  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const isPlatformAdmin = user?.tenantId === null || user?.tenantId === undefined;

  // ── Queries ─────────────────────────────────────────────────────────────────

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

    // Inicializa sectorConfig: usa dados do banco ou herda hora global.
    const sc = config.sectorConfig as SectorConfigMap | null | undefined;
    const h = config.sendHour ?? 7;
    const m = config.sendMinute ?? 0;
    // Legado: sem sectorConfig → deriva dias do sendWeekends (ou Dom-Sáb como novo default)
    const legacyDays = (config.sendWeekends ?? true) ? ALL_DAYS : WEEKDAYS;
    const withDays = (detail?: Partial<SectorDetail> & { recipients?: SectorRecipient[] }): SectorDetail => {
      // A1: se o backend tem recipients[], exibe como CSV nos campos (N contatos).
      const recips = Array.isArray(detail?.recipients) ? detail!.recipients! : [];
      const phoneCsv = recips.filter((r) => r?.channel === 'whatsapp').map((r) => r.contact).join(', ');
      const emailCsv = recips.filter((r) => r?.channel === 'email').map((r) => r.contact).join(', ');
      return {
        phone: phoneCsv || detail?.phone || '',
        email: emailCsv || detail?.email || '',
        sendHour: detail?.sendHour ?? h,
        sendMinute: detail?.sendMinute ?? m,
        sendDays: detail?.sendDays?.length ? detail.sendDays : legacyDays,
      };
    };
    setSectors({
      fiscal:   withDays(sc?.fiscal),
      logistic: withDays(sc?.logistic),
      frota:    withDays(sc?.frota),
      finance:  withDays(sc?.finance),
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
            !['sectorConfig', 'planAllowed', 'monitorOverride'].includes(k),
          ),
        ),
        // A1: campos CSV viram recipients[] por setor (retrocompat com phone/email).
        sectorConfig: {
          fiscal: sectorToPayload(sectors.fiscal),
          logistic: sectorToPayload(sectors.logistic),
          frota: sectorToPayload(sectors.frota),
          finance: sectorToPayload(sectors.finance),
        },
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

  /** Platform admin: toggle override de plano para o tenant ativo (x-acting-tenant-id). */
  const toggleOverride = useMutation({
    mutationFn: (enabled: boolean) => api.post('/monitor/config/override', { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitor-config'] });
      toast.success('Override de plano atualizado.');
    },
    onError: () => toast.error('Erro ao alterar override.'),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const planAllowed = cfg.planAllowed ?? false;

  const set = <K extends keyof MonitorConfig>(key: K, val: MonitorConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: val }));

  const setSector = (key: SectorKey, field: keyof SectorDetail, val: string | number | number[]) =>
    setSectors((s) => ({ ...s, [key]: { ...s[key], [field]: val } }));

  /** Liga/desliga um dia do setor. Impede deixar zero dias (mínimo 1). */
  const toggleSectorDay = (key: SectorKey, day: number) =>
    setSectors((s) => {
      const current = s[key].sendDays ?? ALL_DAYS;
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      if (next.length === 0) return s; // pelo menos 1 dia
      return { ...s, [key]: { ...s[key], sendDays: next } };
    });

  /** Auto-fill: preenche telefone e e-mail de todos os setores com os dados do cadastro. */
  function fillAllSectorsFromPrefill() {
    if (!prefill) return;
    setSectors((s) => {
      const updated = { ...s };
      for (const key of Object.keys(updated) as SectorKey[]) {
        updated[key] = {
          ...updated[key],
          phone: prefill.phone ? (updated[key].phone || prefill.phone) : updated[key].phone,
          email: prefill.email ? (updated[key].email || prefill.email) : updated[key].email,
        };
      }
      return updated;
    });
    toast.success('Dados pré-preenchidos a partir do seu cadastro.');
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
                  Monitor Proativo disponível nos planos Profissional e Corporativo
                </p>
                <p className="text-xs text-base-content/60 mt-1">
                  Faça upgrade do seu plano para habilitar alertas automáticos do TMS por WhatsApp e e-mail.
                  Entre em contato com o suporte para mais informações.
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

          {/* ─── Grid de setores ─────────────────────────────────────────── */}
          <div className={`transition-opacity ${cfg.enabled && planAllowed ? '' : 'opacity-40 pointer-events-none'}`}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-base-content/40">
                Alertas por setor
              </p>
              {/* Auto-fill a partir do cadastro */}
              {prefill && (prefill.phone || prefill.email) && (
                <button
                  type="button"
                  className="text-xs text-brand-500 hover:text-brand-400 transition-colors flex items-center gap-1"
                  onClick={fillAllSectorsFromPrefill}
                  title="Preenche telefone/e-mail com dados do seu cadastro nos setores que ainda estão em branco"
                >
                  <Icon name="users" className="h-3 w-3" />
                  Usar dados do meu cadastro
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SECTORS.map((sector) => {
                const enabled = !!cfg[sector.enabledKey];
                const sc = sectors[sector.key];

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
                          <p className="text-sm font-semibold text-base-content">{sector.label}</p>
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

                    {/* Corpo: horário + telefone + e-mail + dias + histórico */}
                    <div className={`px-5 py-5 space-y-4 transition-opacity ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>

                      {/* Horário */}
                      <div>
                        <p className="text-xs font-medium text-base-content/60 mb-2">
                          Horário do alerta (Brasília)
                        </p>
                        <div className="flex gap-2">
                          <select
                            className="select select-bordered select-sm flex-1"
                            value={sc.sendHour}
                            onChange={(e) => setSector(sector.key, 'sendHour', Number(e.target.value))}
                          >
                            {HOURS.map((h) => (
                              <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                            ))}
                          </select>
                          <select
                            className="select select-bordered select-sm w-28"
                            value={sc.sendMinute}
                            onChange={(e) => setSector(sector.key, 'sendMinute', Number(e.target.value))}
                          >
                            {MINUTES.map((m) => (
                              <option key={m} value={m}>{String(m).padStart(2, '0')}min</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* WhatsApp */}
                      <div>
                        <p className="text-xs font-medium text-base-content/60 mb-2 flex items-center gap-1">
                          <span>📱</span> WhatsApp (com DDI) — vários separados por vírgula
                        </p>
                        <input
                          type="text"
                          className="input input-bordered input-sm w-full"
                          placeholder="5511999999999, 5511888888888"
                          value={sc.phone}
                          onChange={(e) => setSector(sector.key, 'phone', e.target.value)}
                        />
                      </div>

                      {/* E-mail */}
                      <div>
                        <p className="text-xs font-medium text-base-content/60 mb-2 flex items-center gap-1">
                          <span>✉️</span> E-mail (opcional — canal dual) — vários separados por vírgula
                        </p>
                        <input
                          type="text"
                          className="input input-bordered input-sm w-full"
                          placeholder="financeiro@empresa.com.br, gerente@empresa.com.br"
                          value={sc.email}
                          onChange={(e) => setSector(sector.key, 'email', e.target.value)}
                        />
                      </div>

                      {/* Dias de envio */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium text-base-content/60">Dias de envio</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-[11px] text-base-content/40 hover:text-base-content/70 transition-colors"
                              onClick={() => setSector(sector.key, 'sendDays', WEEKDAYS)}
                            >
                              Dias úteis
                            </button>
                            <button
                              type="button"
                              className="text-[11px] text-base-content/40 hover:text-base-content/70 transition-colors"
                              onClick={() => setSector(sector.key, 'sendDays', ALL_DAYS)}
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
    </PageContainer>
  );
}
