import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { Card, PageContainer, PageHeader, Breadcrumb, Icon } from '@/shared/ui';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface EscalationGap {
  id: string;
  ticketCategory: string | null;
  rootCause: string | null;
  firstMessage: string | null;
  createdAt: string;
  frequency: number;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  cte: 'CT-e',
  mdfe: 'MDF-e',
  fiscal: 'Fiscal',
  frete: 'Frete',
  financeiro: 'Financeiro',
  cadastro: 'Cadastro',
  usuarios: 'Usuários',
  integracoes: 'Integrações',
  api: 'API',
  erro_sistema: 'Erro de sistema',
  treinamento: 'Treinamento',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-base-200 text-base-content/60',
};

// ── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent,
}: { label: string; value: string | number; sub?: string; accent?: 'green' | 'red' | 'blue' | 'default' }) {
  const color =
    accent === 'green' ? 'text-emerald-600' :
    accent === 'red'   ? 'text-red-500' :
    accent === 'blue'  ? 'text-brand-600' :
    'text-base-content';
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-base-content/50">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-base-content/40">{sub}</div>}
    </Card>
  );
}

function BarRow({ label, count, total, extra }: { label: string; count: number; total: number; extra?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-base-content">{label}</span>
        <span className="text-base-content/50">{count} {extra ? `· ${extra}` : `(${pct}%)`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-base-200">
        <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GapsDoKb({ gaps }: { gaps: EscalationGap[] }) {
  if (gaps.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">
          Gaps do KB — perguntas que a Lia não respondeu
        </h3>
        <div className="flex h-20 items-center justify-center text-xs text-base-content/40">
          Nenhuma escalação no período. 🎉
        </div>
      </Card>
    );
  }

  // Deduplica por rootCause para mostrar grupos
  const seen = new Set<string>();
  const deduped = gaps.filter((g) => {
    const key = g.rootCause ?? g.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">
          Gaps do KB — perguntas que a Lia não respondeu
        </h3>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
          {gaps.length} escalação{gaps.length !== 1 ? 'ões' : ''}
        </span>
      </div>
      <div className="divide-y divide-base-200">
        {deduped.map((gap) => (
          <div key={gap.id} className="flex items-start gap-3 py-3">
            {/* Frequência */}
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-base-200 text-[11px] font-bold text-base-content/60">
              {gap.frequency}×
            </div>

            {/* Conteúdo */}
            <div className="min-w-0 flex-1">
              {gap.firstMessage && (
                <p className="truncate text-sm font-medium text-base-content">
                  "{gap.firstMessage}"
                </p>
              )}
              {gap.rootCause && (
                <p className="mt-0.5 truncate text-xs text-base-content/50">
                  Causa: {gap.rootCause}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                {gap.ticketCategory && (
                  <span className="rounded bg-base-200 px-1.5 py-0.5 text-[10px] font-medium text-base-content/60">
                    {CATEGORY_LABELS[gap.ticketCategory] ?? gap.ticketCategory}
                  </span>
                )}
                <span className="text-[10px] text-base-content/40">
                  {new Date(gap.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>

            {/* Ação */}
            <Link
              to={`/knowledge?title=${encodeURIComponent(gap.rootCause ?? gap.firstMessage ?? '')}&category=${gap.ticketCategory ?? ''}`}
              className="flex-shrink-0 rounded-md border border-base-300 bg-base-100 px-2.5 py-1.5 text-[11px] font-medium hover:bg-base-200"
              title="Criar artigo no KB para cobrir esta pergunta"
            >
              + KB
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export function SupportDashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery<SupportOverview>({
    queryKey: ['support-overview', from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/metrics/support?${params}`).then((r) => r.data);
    },
  });

  const { data: gaps = [] } = useQuery<EscalationGap[]>({
    queryKey: ['support-gaps', from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/metrics/support/gaps?${params}`).then((r) => r.data);
    },
  });

  const total = data?.total ?? 0;
  const avgH = data?.avgTimeToResolutionHours;
  const avgLabel = avgH == null ? '—' : avgH < 1 ? `${Math.round(avgH * 60)}min` : `${avgH}h`;

  const catEntries = Object.entries(data?.volumeByCategory ?? {})
    .filter(([k]) => k !== 'null')
    .sort(([, a], [, b]) => b - a);

  const priEntries = Object.entries(data?.volumeByPriority ?? {})
    .filter(([k]) => k !== 'null')
    .sort(([, a], [, b]) => b - a);

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={
          <Breadcrumb items={[
            { label: 'Início', to: '/dashboard' },
            { label: 'Suporte' },
            { label: 'Dashboard' },
          ]} />
        }
        title="Dashboard de Suporte"
        subtitle="Volume, SLA e taxa de resolução da IA nos chamados de atendimento."
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-base-300 bg-base-100 px-2 text-xs text-base-content"
              title="Data de início"
            />
            <span className="text-xs text-base-content/40">até</span>
            <input
              type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-base-300 bg-base-100 px-2 text-xs text-base-content"
              title="Data de fim"
            />
            <button
              onClick={() => refetch()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium hover:bg-base-200"
            >
              <Icon name="pulse" className="h-3.5 w-3.5" /> Atualizar
            </button>
            <Link
              to="/support"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium hover:bg-base-200"
            >
              <Icon name="support" className="h-3.5 w-3.5" /> Inbox
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-base-content/40">Carregando métricas...</div>
      ) : isError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-base-content/60">
          <p className="text-sm font-medium">Erro ao carregar as métricas de suporte.</p>
          {(error as Error)?.message && (
            <p className="text-xs text-base-content/40">{(error as Error).message}</p>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-1 inline-flex h-8 items-center rounded-md border border-base-300 bg-base-100 px-3 text-xs font-medium hover:bg-base-200"
          >
            Tentar novamente
          </button>
        </div>
      ) : !data || total === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-base-content/40">
          <Icon name="support" className="h-8 w-8" />
          <span className="text-sm">Nenhum chamado no período.</span>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── KPIs principais ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard
              label="Total de chamados"
              value={total}
              sub="no período selecionado"
            />
            <KpiCard
              label="Resolvidos pela IA"
              value={`${data.resolvedWithoutEscalation.pct}%`}
              sub={`${data.resolvedWithoutEscalation.count} chamados`}
              accent="green"
            />
            <KpiCard
              label="Escalados para humano"
              value={`${data.escalated.pct}%`}
              sub={`${data.escalated.count} chamados`}
              accent={data.escalated.pct > 40 ? 'red' : 'default'}
            />
            <KpiCard
              label="Tempo médio de resolução"
              value={avgLabel}
              sub="tickets resolvidos"
              accent="blue"
            />
          </div>

          {/* ── Volume por categoria + escalonamento ─────────────────────── */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-base-content/50">
                Volume por categoria
              </h3>
              {catEntries.length === 0 ? (
                <span className="text-xs text-base-content/40">Sem dados</span>
              ) : (
                <div className="space-y-3">
                  {catEntries.map(([cat, count]) => (
                    <BarRow
                      key={cat}
                      label={CATEGORY_LABELS[cat] ?? cat}
                      count={count}
                      total={total}
                    />
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-base-content/50">
                Taxa de escalonamento por categoria
              </h3>
              {catEntries.length === 0 ? (
                <span className="text-xs text-base-content/40">Sem dados</span>
              ) : (
                <div className="space-y-3">
                  {catEntries.map(([cat]) => {
                    const rate = data.escalationRateByCategory[cat] ?? 0;
                    return (
                      <BarRow
                        key={cat}
                        label={CATEGORY_LABELS[cat] ?? cat}
                        count={rate}
                        total={100}
                        extra={`${rate}% escalado`}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── Prioridade ───────────────────────────────────────────────── */}
          <Card className="p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-base-content/50">
              Distribuição por prioridade
            </h3>
            <div className="flex flex-wrap gap-3">
              {priEntries.map(([pri, count]) => (
                <div
                  key={pri}
                  className={`rounded-xl px-4 py-3 text-center ${PRIORITY_COLOR[pri] ?? 'bg-base-200 text-base-content/60'}`}
                >
                  <div className="text-xl font-bold">{count}</div>
                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide">
                    {PRIORITY_LABELS[pri] ?? pri}
                  </div>
                  <div className="text-[10px] opacity-70">
                    {total > 0 ? Math.round((count / total) * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* ── Gaps do KB ───────────────────────────────────────────────── */}
          <GapsDoKb gaps={gaps} />

        </div>
      )}
    </PageContainer>
  );
}
