import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { useDateRange } from '@/app/providers/DateRangeContext';
import { ConversationMetricsCard } from '@/components/conversation/ConversationMetricsCard';
import { WhatsappConnectionStatus } from '@/components/WhatsappConnectionStatus';
import {
  Button,
  Icon,
  PageContainer,
  PageHeader,
  Breadcrumb,
  Card,
  KpiCard,
} from '@/shared/ui';

// Gráficos carregados sob demanda (recharts num chunk async).
const DashboardCampaignChart = lazy(() => import('./DashboardCampaignChart'));
const DashboardActivityChart = lazy(() => import('./DashboardActivityChart'));

interface ActivityPoint {
  day: string;
  inbound: number;
  outbound: number;
  conversations: number;
}

interface SupportOverview {
  total: number;
  resolvedWithoutEscalation: { count: number; pct: number };
  escalated: { count: number; pct: number };
  avgTimeToResolutionHours: number | null;
  volumeByCategory: Record<string, number>;
  volumeByPriority: Record<string, number>;
  escalationRateByCategory: Record<string, number>;
}

interface OppSummaryRow { stage: string; count: number; value: number }

interface Overview {
  contacts: { total: number; optedOut: number; byLeadStatus: Record<string, number> };
  conversations: { total: number; byStatus: Record<string, number>; byOutcome: Record<string, number> };
  messages: { inbound: number; outbound: number; aiGenerated: number; aiSharePct: number };
  ai: { tokensIn: number; tokensOut: number; estimatedCostUsd: number };
  knowledge: { total: number };
  events: { byStatus: Record<string, number>; dlq: number };
  complaints: { total: number; byTopic: Record<string, number> };
  campaigns?: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    deliveredPct: number;
    readPct: number;
    repliedPct: number;
  };
}

function n(obj: Record<string, number>, key: string): number {
  return obj?.[key] ?? 0;
}

function chips(obj: Record<string, number>) {
  const e = Object.entries(obj).filter(([k]) => k !== 'null');
  if (e.length === 0) return <span className="text-xs text-base-content/40">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {e.map(([k, v]) => (
        <span key={k} className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70">{k}: {v}</span>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-base-content/40">
      {children}
    </h2>
  );
}

export function DashboardPage() {
  const { range } = useDateRange();

  // monta os params de período a partir do range selecionado
  function params() {
    const p: Record<string, string> = {};
    if (range.from) p.from = range.from;
    if (range.to) p.to = range.to;
    return p;
  }

  // React Query (E8 — fatia 1): substitui o useEffect+setInterval manual.
  // A key inclui o range → troca de período refaz a query; refetchInterval = polling.
  const overviewQ = useQuery({
    queryKey: ['metrics-overview', range.from, range.to],
    queryFn: async () => (await api.get<Overview>('/metrics/overview', { params: params() })).data,
    refetchInterval: 10_000,
  });
  const seriesQ = useQuery({
    queryKey: ['metrics-timeseries', range.from, range.to],
    queryFn: async () => (await api.get<{ series: ActivityPoint[] }>('/metrics/timeseries', { params: params() })).data,
    refetchInterval: 10_000,
  });
  const supportQ = useQuery({
    queryKey: ['metrics-support', range.from, range.to],
    queryFn: async () => (await api.get<SupportOverview>('/metrics/support', { params: params() })).data,
    refetchInterval: 30_000,
  });

  const oppQ = useQuery({
    queryKey: ['opportunities-summary'],
    queryFn: async () => (await api.get<OppSummaryRow[]>('/opportunities/summary')).data,
    refetchInterval: 30_000,
  });

  const m = overviewQ.data;
  const series = seriesQ.data?.series ?? null;
  const sup = supportQ.data;
  const opp = oppQ.data ?? [];
  const refresh = () => {
    overviewQ.refetch();
    seriesQ.refetch();
    supportQ.refetch();
    oppQ.refetch();
  };

  if (!m) return (
    <div className="flex h-full items-center justify-center text-base-content/40">
      Carregando métricas...
    </div>
  );

  const byStatus  = m.conversations.byStatus  ?? {};
  const byOutcome = m.conversations.byOutcome ?? {};

  // ativo = open + waiting_customer + waiting_internal + escalated
  const activeTotal =
    n(byStatus, 'open') +
    n(byStatus, 'waiting_customer') +
    n(byStatus, 'waiting_internal') +
    n(byStatus, 'escalated');

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Dashboard' }]} />}
        title="Dashboard"
        subtitle={<>Período: <strong className="text-base-content/70">{range.label}</strong> · atualiza a cada 10s</>}
        actions={
          <div className="flex items-center gap-4">
            <WhatsappConnectionStatus compact />
            <Button variant="outline" onClick={refresh}><Icon name="refresh" className="h-4 w-4" /> Atualizar</Button>
          </div>
        }
      />

      {/* ── Visão geral ────────────────────────────────────────────── */}
      <SectionTitle>Visão Geral</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <ConversationMetricsCard label="Contatos" value={m.contacts.total} icon="contacts" accent="brand" hint={`${m.contacts.optedOut} opt-outs`} />
        <ConversationMetricsCard label="Conversas" value={m.conversations.total} icon="inbox" accent="blue" hint="total histórico" />
        <ConversationMetricsCard label="Mensagens" value={m.messages.inbound + m.messages.outbound} icon="mail" accent="green" hint={`${m.messages.inbound} in · ${m.messages.outbound} out`} />
        <ConversationMetricsCard label="Base (KB)" value={m.knowledge.total} icon="knowledge" accent="amber" hint="itens de conhecimento" />
      </div>

      {/* ── Atividade por período (Q5) ─────────────────────────────── */}
      <SectionTitle>Atividade por período</SectionTitle>
      <Card className="mb-6 p-5">
        <div className="mb-3 text-sm font-semibold text-base-content/70">
          Mensagens e novas conversas por dia
        </div>
        {series && series.length > 0 ? (
          <Suspense fallback={<div className="h-[260px] animate-pulse rounded-lg bg-base-200" />}>
            <DashboardActivityChart series={series} />
          </Suspense>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-base-content/40">
            Sem atividade no período selecionado.
          </div>
        )}
      </Card>

      {/* ── Engajamento de Campanhas (CAMP-2) ──────────────────────── */}
      {m.campaigns && (
        <>
          <SectionTitle>Engajamento de Campanhas</SectionTitle>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <ConversationMetricsCard
              label="Enviados"
              value={m.campaigns.sent}
              icon="send"
              hint={`${m.campaigns.total} campanha(s)`}
            />
            <ConversationMetricsCard
              label="Entregue"
              value={`${m.campaigns.delivered} · ${m.campaigns.deliveredPct}%`}
              icon="check"
              accent="blue"
            />
            <ConversationMetricsCard
              label="Lido"
              value={`${m.campaigns.read} · ${m.campaigns.readPct}%`}
              icon="eye"
              accent="blue"
              highlight={m.campaigns.read > 0}
            />
            <ConversationMetricsCard
              label="Respondeu"
              value={`${m.campaigns.replied} · ${m.campaigns.repliedPct}%`}
              icon="reply"
              accent="green"
              highlight={m.campaigns.replied > 0}
            />
          </div>
          <Card className="mb-6 p-5">
            <div className="mb-3 text-sm font-semibold text-base-content/70">Funil de campanhas</div>
            <Suspense fallback={<div className="h-[240px] animate-pulse rounded-lg bg-base-200" />}>
              <DashboardCampaignChart
                sent={m.campaigns.sent}
                delivered={m.campaigns.delivered}
                read={m.campaigns.read}
                replied={m.campaigns.replied}
              />
            </Suspense>
          </Card>
        </>
      )}

      {/* ── Monitoramento Operacional ──────────────────────────────── */}
      <SectionTitle>Monitoramento Operacional — Status</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <ConversationMetricsCard
          label="Conversas Ativas"
          value={activeTotal}
          icon="zap"
          hint="open + waiting + escalated"
          accent="brand"
          highlight={activeTotal > 0}
        />
        <ConversationMetricsCard
          label="Open"
          value={n(byStatus, 'open')}
          icon="inbox"
          accent="green"
          highlight={n(byStatus, 'open') > 0}
        />
        <ConversationMetricsCard
          label="Waiting Customer"
          value={n(byStatus, 'waiting_customer')}
          icon="bell"
          accent="amber"
        />
        <ConversationMetricsCard
          label="Waiting Internal"
          value={n(byStatus, 'waiting_internal')}
          icon="users"
          accent="blue"
          highlight={n(byStatus, 'waiting_internal') > 0}
          hint={n(byStatus, 'waiting_internal') > 0 ? 'verifique atenção' : undefined}
        />
        <ConversationMetricsCard
          label="Escalated"
          value={n(byStatus, 'escalated')}
          icon="alert"
          accent="orange"
          highlight={n(byStatus, 'escalated') > 0}
          hint={n(byStatus, 'escalated') > 0 ? 'requer ação imediata' : undefined}
        />
        <ConversationMetricsCard
          label="Closed"
          value={n(byStatus, 'closed')}
          icon="check"
          accent="zinc"
        />
      </div>

      {/* ── Pipeline de Vendas ────────────────────────────────────── */}
      {opp.length > 0 && (() => {
        const byStage = Object.fromEntries(opp.map((r) => [r.stage, r]));
        const totalCount = opp.reduce((s, r) => s + r.count, 0);
        const totalValue = opp.reduce((s, r) => s + r.value, 0);
        const fmtBrl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
        const stages: { key: string; label: string; tone?: 'pos' | 'neg' | 'muted' }[] = [
          { key: 'new',       label: 'Novos',        tone: 'muted' },
          { key: 'qualified', label: 'Qualificados', tone: 'muted' },
          { key: 'proposal',  label: 'Proposta',     tone: 'muted' },
          { key: 'won',       label: 'Ganhos',       tone: 'pos'   },
          { key: 'lost',      label: 'Perdidos',     tone: 'neg'   },
        ];
        return (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-base-content/40">Pipeline de Vendas</h2>
              <Link to="/opportunities" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todas <Icon name="chevronRight" className="h-3 w-3" />
              </Link>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Total" value={String(totalCount)} sub={fmtBrl(totalValue)} tone="muted" />
              {stages.map((s) => {
                const row = byStage[s.key];
                return (
                  <KpiCard
                    key={s.key}
                    label={s.label}
                    value={String(row?.count ?? 0)}
                    sub={row?.value ? fmtBrl(row.value) : '—'}
                    tone={s.tone}
                  />
                );
              })}
            </div>
          </>
        );
      })()}

      {/* ── Resultados Comerciais ─────────────────────────────────── */}
      <SectionTitle>Resultados Comerciais — Outcome</SectionTitle>
      <p className="mb-3 text-xs text-base-content/40">
        Conversas encerradas e como terminaram — separado do status operacional.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <ConversationMetricsCard
          label="Won"
          value={n(byOutcome, 'won')}
          icon="trophy"
          accent="green"
          highlight={n(byOutcome, 'won') > 0}
          hint="vendas realizadas"
        />
        <ConversationMetricsCard
          label="Lost"
          value={n(byOutcome, 'lost')}
          icon="close"
          accent="red"
          hint="vendas perdidas"
        />
        <ConversationMetricsCard
          label="No Response"
          value={n(byOutcome, 'no_response')}
          icon="mute"
          accent="zinc"
          hint="fechado por inatividade"
        />
        <ConversationMetricsCard
          label="Opt-out"
          value={n(byStatus, 'opt_out')}
          icon="ban"
          accent="red"
          hint="descadastrados (LGPD)"
        />
      </div>

      {/* ── IA e performance ──────────────────────────────────────── */}
      <SectionTitle>IA e Performance</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <ConversationMetricsCard
          label="IA Autônoma"
          value={`${m.messages.aiSharePct}%`}
          icon="bot"
          accent="brand"
          hint={`${m.messages.aiGenerated} respostas enviadas pela IA`}
        />
        <ConversationMetricsCard
          label="Tokens"
          value={(m.ai.tokensIn + m.ai.tokensOut).toLocaleString('pt-BR')}
          icon="zap"
          hint={`${m.ai.tokensIn} in · ${m.ai.tokensOut} out`}
        />
        <ConversationMetricsCard
          label="Custo IA (est.)"
          value={`US$ ${m.ai.estimatedCostUsd.toFixed(4)}`}
          icon="dollar"
          accent="amber"
          hint="estimado pelos tokens"
        />
        <ConversationMetricsCard
          label="DLQ (erros)"
          value={m.events.dlq}
          icon="alert"
          accent={m.events.dlq > 0 ? 'red' : undefined}
          hint="eventos com falha"
        />
      </div>

      {/* ── Suporte (ADR 015/016) ─────────────────────────────────── */}
      {sup && sup.total > 0 && (
        <>
          <SectionTitle>Suporte — Tickets</SectionTitle>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <ConversationMetricsCard
              label="Total de Tickets"
              value={sup.total}
              icon="inbox"
              accent="brand"
              hint="no período selecionado"
            />
            <ConversationMetricsCard
              label="Resolvido s/ Escalonamento"
              value={`${sup.resolvedWithoutEscalation.pct}%`}
              icon="check"
              accent="green"
              highlight={sup.resolvedWithoutEscalation.pct >= 70}
              hint={`${sup.resolvedWithoutEscalation.count} ticket(s)`}
            />
            <ConversationMetricsCard
              label="Escalados"
              value={sup.escalated.count}
              icon="alert"
              accent={sup.escalated.pct > 30 ? 'red' : 'orange'}
              highlight={sup.escalated.count > 0}
              hint={`${sup.escalated.pct}% do total`}
            />
            <ConversationMetricsCard
              label="Tempo Médio (h)"
              value={sup.avgTimeToResolutionHours != null ? `${sup.avgTimeToResolutionHours}h` : '—'}
              icon="clock"
              accent="blue"
              hint="tempo até resolução"
            />
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card p-4">
              <div className="mb-2 text-sm font-semibold text-base-content/70">Volume por categoria</div>
              {chips(sup.volumeByCategory)}
            </div>
            <div className="card p-4">
              <div className="mb-2 text-sm font-semibold text-base-content/70">Volume por prioridade</div>
              {chips(sup.volumeByPriority)}
            </div>
          </div>
        </>
      )}

      {/* ── Detalhes ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-5">
          <div className="mb-2 text-sm font-semibold text-base-content/70">Leads por estágio</div>
          {chips(m.contacts.byLeadStatus)}
        </div>
        <div className="card p-5">
          <div className="mb-2 text-sm font-semibold text-base-content/70">Eventos</div>
          {chips(m.events.byStatus)}
        </div>
        <div className="card p-5">
          <div className="mb-2 text-sm font-semibold text-base-content/70">Reclamações por tema</div>
          {chips(m.complaints.byTopic)}
          {m.complaints.total > 0 && (
            <div className="mt-1 text-xs font-semibold text-red-500">{m.complaints.total} total</div>
          )}
        </div>
      </div>

      {/* ── Nota de métricas futuras ──────────────────────────────── */}
      <div className="mt-6 rounded-lg border border-dashed border-base-300 p-4 text-xs text-base-content/40">
        <strong className="text-base-content/50">Métricas futuras planejadas:</strong> tempo médio até 1ª resposta · tempo médio até fechamento · conversas por vendedor · taxa de conversão · taxa de no_response · taxa de opt_out
      </div>
    </PageContainer>
  );
}
