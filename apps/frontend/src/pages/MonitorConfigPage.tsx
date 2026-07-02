/**
 * MonitorConfigPage — /settings/monitor
 * Monitor Proativo: alertas automáticos do TMS por setor.
 * Cada setor tem toggle, horário próprio e telefone WhatsApp.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { Button, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';
import { SkeletonList } from '@/components/ui/Skeleton';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SectorKey = 'fiscal' | 'logistic' | 'frota' | 'finance';

interface SectorDetail {
  phone: string;
  sendHour: number;
  sendMinute: number;
}

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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const DEFAULT_CONFIG: MonitorConfig = {
  enabled: false,
  sendHour: 7,
  sendMinute: 0,
  notificationPhone: null,
  recipients: [],
  sendWeekends: false,
  channel: 'whatsapp',
  fiscalEnabled: true,
  logisticEnabled: true,
  frotaEnabled: true,
  financeEnabled: true,
  sectorConfig: null,
};

const makeSectorConfig = (defaultHour = 7, defaultMinute = 0): SectorConfigMap => ({
  fiscal:   { phone: '', sendHour: defaultHour, sendMinute: defaultMinute },
  logistic: { phone: '', sendHour: defaultHour, sendMinute: defaultMinute },
  frota:    { phone: '', sendHour: defaultHour, sendMinute: defaultMinute },
  finance:  { phone: '', sendHour: defaultHour, sendMinute: defaultMinute },
});

// ─── Componente ──────────────────────────────────────────────────────────────

export function MonitorConfigPage() {
  const [cfg, setCfg] = useState<MonitorConfig>(DEFAULT_CONFIG);
  const [sectors, setSectors] = useState<SectorConfigMap>(makeSectorConfig());
  const [saving, setSaving] = useState(false);

  const toast = useToast();
  const qc = useQueryClient();

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: config, isLoading: loadingConfig } = useQuery<MonitorConfig>({
    queryKey: ['monitor-config'],
    queryFn: () => api.get('/monitor/config').then((r) => r.data),
  });

  useEffect(() => {
    if (!config) return;
    setCfg({ ...DEFAULT_CONFIG, ...config });

    // Inicializa sectorConfig: usa dados do banco ou herda hora global
    const sc = config.sectorConfig as SectorConfigMap | null | undefined;
    const h = config.sendHour ?? 7;
    const m = config.sendMinute ?? 0;
    setSectors({
      fiscal:   { phone: '', sendHour: h, sendMinute: m, ...sc?.fiscal },
      logistic: { phone: '', sendHour: h, sendMinute: m, ...sc?.logistic },
      frota:    { phone: '', sendHour: h, sendMinute: m, ...sc?.frota },
      finance:  { phone: '', sendHour: h, sendMinute: m, ...sc?.finance },
    });
  }, [config]);

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery<AlertState[]>({
    queryKey: ['monitor-alerts'],
    queryFn: () => api.get('/monitor/alerts').then((r) => r.data),
    refetchInterval: 60_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  async function saveConfig() {
    setSaving(true);
    try {
      const payload = {
        ...Object.fromEntries(
          Object.entries(cfg).filter(([k, v]) => v !== null && v !== undefined && k !== 'sectorConfig'),
        ),
        sectorConfig: sectors,
      };
      await api.put('/monitor/config', payload);
      qc.invalidateQueries({ queryKey: ['monitor-config'] });
      toast.success('Configurações salvas!');
    } catch {
      toast.error('Erro ao salvar configurações.');
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

  // Injeta alertas de teste em todos os setores (debug)
  const seedAlerts = useMutation({
    mutationFn: () => api.post('/monitor/seed-test'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success(`🧪 ${res.data.seeded} alerta(s) de teste criados! Clique em "Notificar agora" para disparar.`);
    },
    onError: () => toast.error('Erro ao criar alertas de teste.'),
  });

  // Força o disparo imediato de notificações para todos os setores configurados
  const notifyNow = useMutation({
    mutationFn: () => api.post('/monitor/notify-now'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success(`📨 Notificações disparadas: ${res.data.alerts} alerta(s) enviado(s).`);
    },
    onError: () => toast.error('Erro ao disparar notificações.'),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const set = <K extends keyof MonitorConfig>(key: K, val: MonitorConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: val }));

  const setSector = (key: SectorKey, field: keyof SectorDetail, val: string | number) =>
    setSectors((s) => ({ ...s, [key]: { ...s[key], [field]: val } }));

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
        subtitle="Configure horários e telefones de alerta por setor do TMS."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => syncNow.mutate()} loading={syncNow.isPending} title="Busca eventos atuais do TMS">
              <Icon name="refresh" className="h-4 w-4" /> Sincronizar
            </Button>
            <Button variant="ghost" onClick={() => seedAlerts.mutate()} loading={seedAlerts.isPending} title="Cria alertas de teste em todos os setores">
              <Icon name="pulse" className="h-4 w-4" /> Seed alertas
            </Button>
            <Button variant="ghost" onClick={() => notifyNow.mutate()} loading={notifyNow.isPending} title="Dispara notificações agora para todos os setores configurados">
              <Icon name="send" className="h-4 w-4" /> Notificar agora
            </Button>
            <Button
              variant="ghost"
              onClick={() => testNotify.mutate()}
              loading={testNotify.isPending}
              title="Envia mensagem simples de teste para o primeiro telefone configurado"
            >
              <Icon name="zap" className="h-4 w-4" /> Testar canal
            </Button>
            <Button onClick={saveConfig} loading={saving}>
              <Icon name="check" className="h-4 w-4" /> Salvar
            </Button>
          </div>
        }
      />

      {loadingConfig ? (
        <SkeletonList />
      ) : (
        <div className="space-y-6">

          {/* ─── Configurações gerais ────────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-base-200">
              <div>
                <p className="text-sm font-semibold text-base-content">Monitoramento ativo</p>
                <p className="text-xs text-base-content/50 mt-0.5">
                  Quando ativado, cada setor dispara alertas no telefone e horário configurados abaixo.
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

            <div className="flex flex-wrap items-center gap-6 px-6 py-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={cfg.sendWeekends}
                  onChange={(e) => set('sendWeekends', e.target.checked)}
                />
                <span className="text-sm text-base-content">Enviar alertas nos fins de semana</span>
              </label>
            </div>
          </div>

          {/* ─── Grid de setores ─────────────────────────────────────────── */}
          <div className={`transition-opacity ${cfg.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-base-content/40 mb-4">
              Alertas por setor
            </p>

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
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${sector.badgeClass}`}
                        >
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

                    {/* Corpo: horário + telefone */}
                    <div
                      className={`px-5 py-5 space-y-4 transition-opacity ${
                        enabled ? '' : 'opacity-40 pointer-events-none'
                      }`}
                    >
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
                              <option key={h} value={h}>
                                {String(h).padStart(2, '0')}h
                              </option>
                            ))}
                          </select>
                          <select
                            className="select select-bordered select-sm w-28"
                            value={sc.sendMinute}
                            onChange={(e) => setSector(sector.key, 'sendMinute', Number(e.target.value))}
                          >
                            {MINUTES.map((m) => (
                              <option key={m} value={m}>
                                {String(m).padStart(2, '0')}min
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Telefone */}
                      <div>
                        <p className="text-xs font-medium text-base-content/60 mb-2">
                          Telefone WhatsApp (com DDI)
                        </p>
                        <input
                          type="text"
                          className="input input-bordered input-sm w-full"
                          placeholder="5511999999999"
                          value={sc.phone}
                          onChange={(e) => setSector(sector.key, 'phone', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Alertas ativos ──────────────────────────────────────────── */}
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
