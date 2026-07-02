/**
 * MonitorConfigPage — /settings/monitor
 * Configura preferências de notificações proativas do Monitor Nexa.
 * Role: admin
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useToast } from '@/app/providers/ToastContext';
import { Button, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';
import { SkeletonList } from '@/components/ui/Skeleton';

interface MonitorConfig {
  enabled: boolean;
  sendHour: number;
  sendMinute: number;
  notificationPhone: string | null;
  sendWeekends: boolean;
  channel: 'whatsapp' | 'email' | 'both';
  fiscalEnabled: boolean;
  logisticEnabled: boolean;
  frotaEnabled: boolean;
  financeEnabled: boolean;
}

interface AlertState {
  id: string;
  tmsEventId: string;
  severity: 'CRITICAL' | 'OVERDUE' | 'DUE_SOON' | 'INFO';
  category: string;
  title: string;
  description?: string;
  status: 'open' | 'snoozed' | 'resolved' | 'archived';
  notifiedAt?: string;
  notifyCount: number;
  createdAt: string;
}

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
  fiscal:   'Fiscal',
  logistic: 'Logística',
  frota:    'Frota',
  finance:  'Financeiro',
};

// O backend do Monitor roda em horário de Brasília (TZ=America/Sao_Paulo) e
// compara com new Date().getHours() LOCAL. Logo sendHour JÁ É a hora de Brasília
// — NÃO converter para UTC (a conversão +3/-3 causava defasagem de 3h e o resumo
// nunca disparava no horário configurado).
const utcToBrt = (h: number) => h;
const brtToUtc = (h: number) => h;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const DEFAULT_CONFIG: MonitorConfig = {
  enabled: false,
  sendHour: 7,
  sendMinute: 0,
  notificationPhone: null,
  sendWeekends: false,
  channel: 'whatsapp',
  fiscalEnabled: true,
  logisticEnabled: true,
  frotaEnabled: true,
  financeEnabled: true,
};

export function MonitorConfigPage() {
  const [cfg, setCfg] = useState<MonitorConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  // Config
  const { data: config, isLoading: loadingConfig } = useQuery<MonitorConfig>({
    queryKey: ['monitor-config'],
    queryFn: () => api.get('/monitor/config').then((r) => r.data),
  });

  useEffect(() => {
    if (config) setCfg(config);
  }, [config]);

  // Alertas
  const { data: alerts = [], isLoading: loadingAlerts } = useQuery<AlertState[]>({
    queryKey: ['monitor-alerts'],
    queryFn: () => api.get('/monitor/alerts').then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Salvar config
  async function saveConfig() {
    setSaving(true);
    try {
      // Remove null/undefined — class-validator rejeita null mesmo em campos opcionais
      const payload = Object.fromEntries(
        Object.entries(cfg).filter(([, v]) => v !== null && v !== undefined),
      );
      await api.put('/monitor/config', payload);
      qc.invalidateQueries({ queryKey: ['monitor-config'] });
      toast.success('Configurações de monitor salvas!');
    } catch {
      toast.error('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  // Snooze alerta
  const snooze = useMutation({
    mutationFn: (id: string) => api.post(`/monitor/alerts/${id}/snooze`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success('Alerta adiado por 24h.');
    },
  });

  // Resolve alerta
  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/monitor/alerts/${id}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success('Alerta marcado como resolvido.');
    },
  });

  // Sincronizar agora
  const syncNow = useMutation({
    mutationFn: () => api.post('/monitor/sync'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['monitor-alerts'] });
      toast.success(`Sincronizado: ${res.data.synced} alerta(s) ativos, ${res.data.resolved} resolvidos.`);
    },
    onError: () => toast.error('Falha ao sincronizar com o TMS.'),
  });

  // Testar notificação — envia mensagem de teste para o phone configurado
  const testNotify = useMutation({
    mutationFn: () => api.post('/monitor/test'),
    onSuccess: (res) => {
      if (res.data.sent) {
        toast.success(`✅ Mensagem de teste enviada para ${res.data.phone}!`);
      } else {
        toast.error(`Falha: ${res.data.reason ?? 'erro desconhecido'}`);
      }
    },
    onError: () => toast.error('Erro ao enviar teste de notificação.'),
  });

  const set = <K extends keyof MonitorConfig>(key: K, val: MonitorConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: val }));

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
        subtitle="Alertas automáticos do TMS entregues via WhatsApp ou e-mail."
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => syncNow.mutate()}
              loading={syncNow.isPending}
            >
              <Icon name="refresh" className="h-4 w-4" /> Sincronizar agora
            </Button>
            <Button
              variant="ghost"
              onClick={() => testNotify.mutate()}
              loading={testNotify.isPending}
              title="Envia uma mensagem de teste para o WhatsApp configurado"
            >
              <Icon name="zap" className="h-4 w-4" /> Testar notificação
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
          {/* ── On/Off ── */}
          <section className="card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-base-content">Monitoramento ativo</p>
                <p className="text-xs text-base-content/50 mt-0.5">
                  Quando ativado, você recebe um resumo diário via {cfg.channel === 'whatsapp' ? 'WhatsApp' : cfg.channel === 'email' ? 'e-mail' : 'WhatsApp e e-mail'} com os alertas do TMS.
                </p>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-lg"
                checked={cfg.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
              />
            </div>
          </section>

          {/* ── Preferências de envio ── */}
          <section className={`card p-5 space-y-4 transition-opacity ${cfg.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <h2 className="text-sm font-semibold text-base-content">Preferências de envio</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Hora e minuto de envio */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-base-content/60">Horário do resumo diário (Brasília)</span>
                <div className="flex gap-2">
                  <select
                    className="select select-bordered select-sm flex-1"
                    value={utcToBrt(cfg.sendHour)}
                    onChange={(e) => set('sendHour', brtToUtc(Number(e.target.value)))}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}h
                      </option>
                    ))}
                  </select>
                  <select
                    className="select select-bordered select-sm w-24"
                    value={cfg.sendMinute}
                    onChange={(e) => set('sendMinute', Number(e.target.value))}
                  >
                    {[0,5,10,15,20,25,30,35,40,45,50,55].map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}min
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {/* Canal */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-base-content/60">Canal de notificação</span>
                <select
                  className="select select-bordered select-sm w-full"
                  value={cfg.channel}
                  onChange={(e) => set('channel', e.target.value as MonitorConfig['channel'])}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="both">Ambos</option>
                </select>
              </label>

              {/* Telefone de destino */}
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-base-content/60">Telefone de destino (WhatsApp)</span>
                <input
                  type="tel"
                  className="input input-bordered input-sm w-full"
                  placeholder="Ex: 5511917747429  (com DDI, sem espaços)"
                  value={cfg.notificationPhone ?? ''}
                  onChange={(e) => set('notificationPhone', e.target.value || null)}
                />
                <span className="text-xs text-base-content/40">Deixe vazio para usar o padrão do sistema.</span>
              </label>
            </div>

            {/* Enviar nos fins de semana */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={cfg.sendWeekends}
                onChange={(e) => set('sendWeekends', e.target.checked)}
              />
              <span className="text-sm text-base-content">Enviar nos fins de semana</span>
            </label>
          </section>

          {/* ── Categorias ── */}
          <section className={`card p-5 space-y-4 transition-opacity ${cfg.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <h2 className="text-sm font-semibold text-base-content">Categorias monitoradas</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  { key: 'fiscalEnabled', label: 'Fiscal (CT-e / MDF-e)' },
                  { key: 'logisticEnabled', label: 'Logística (embarques)' },
                  { key: 'frotaEnabled', label: 'Frota (manutenções)' },
                  { key: 'financeEnabled', label: 'Financeiro (vencimentos)' },
                ] as { key: keyof MonitorConfig; label: string }[]
              ).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={!!cfg[key]}
                    onChange={(e) => set(key, e.target.checked as any)}
                  />
                  <span className="text-sm text-base-content">{label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* ── Alertas ativos ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-base-content">
                Alertas ativos{' '}
                {alerts.length > 0 && (
                  <span className="badge badge-neutral badge-sm ml-1">{alerts.length}</span>
                )}
              </h2>
            </div>

            {loadingAlerts ? (
              <SkeletonList />
            ) : alerts.length === 0 ? (
              <div className="card p-8 text-center text-base-content/40 text-sm">
                Nenhum alerta aberto no momento ✅
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div key={alert.id} className="card p-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={`badge badge-sm mt-0.5 shrink-0 ${SEVERITY_BADGE[alert.severity] ?? 'badge-ghost'}`}>
                        {SEVERITY_LABEL[alert.severity] ?? alert.severity}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-base-content truncate">{alert.title}</p>
                        {alert.description && (
                          <p className="text-xs text-base-content/50 mt-0.5 truncate">{alert.description}</p>
                        )}
                        <p className="text-xs text-base-content/40 mt-1">
                          {CATEGORY_LABEL[alert.category] ?? alert.category}
                          {alert.notifiedAt && ` · notificado ${new Date(alert.notifiedAt).toLocaleDateString('pt-BR')}`}
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
          </section>
        </div>
      )}
    </PageContainer>
  );
}
