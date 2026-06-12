import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useDateRange } from '@/contexts/DateRangeContext';
import { ConversationMetricsCard } from '@/components/conversation/ConversationMetricsCard';
import { Button } from '@/shared/ui';

interface Overview {
  contacts: { total: number; optedOut: number; byLeadStatus: Record<string, number> };
  conversations: { total: number; byStatus: Record<string, number>; byOutcome: Record<string, number> };
  messages: { inbound: number; outbound: number; aiGenerated: number; aiSharePct: number };
  ai: { tokensIn: number; tokensOut: number; estimatedCostUsd: number };
  knowledge: { total: number };
  events: { byStatus: Record<string, number>; dlq: number };
  complaints: { total: number; byTopic: Record<string, number> };
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
  const [m, setM] = useState<Overview | null>(null);
  const { range } = useDateRange();

  async function load() {
    const params: any = {};
    if (range.from) params.from = range.from;
    if (range.to) params.to = range.to;
    const r = await api.get('/metrics/overview', { params });
    setM(r.data);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

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
    <div className="h-full overflow-auto bg-base-100 p-8">

      {/* ── Cabeçalho ──────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-base-content">Dashboard</h1>
          <p className="text-xs text-base-content/50">
            Período: <strong className="text-base-content/70">{range.label}</strong> · atualiza a cada 10s
          </p>
        </div>
        <Button variant="outline" onClick={load}>↻ Atualizar</Button>
      </div>

      {/* ── Visão geral ────────────────────────────────────────────── */}
      <SectionTitle>Visão Geral</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <ConversationMetricsCard label="Contatos" value={m.contacts.total} icon="contacts" accent="brand" hint={`${m.contacts.optedOut} opt-outs`} />
        <ConversationMetricsCard label="Conversas" value={m.conversations.total} icon="inbox" accent="blue" hint="total histórico" />
        <ConversationMetricsCard label="Mensagens" value={m.messages.inbound + m.messages.outbound} icon="mail" accent="green" hint={`${m.messages.inbound} in · ${m.messages.outbound} out`} />
        <ConversationMetricsCard label="Base (KB)" value={m.knowledge.total} icon="knowledge" accent="amber" hint="itens de conhecimento" />
      </div>

      {/* ── Monitoramento Operacional ──────────────────────────────── */}
      <SectionTitle>Monitoramento Operacional — Status</SectionTitle>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <ConversationMetricsCard
          label="Conversas Ativas"
          value={activeTotal}
          emoji="⚡"
          hint="open + waiting + escalated"
          accent="brand"
          highlight={activeTotal > 0}
        />
        <ConversationMetricsCard
          label="Open"
          value={n(byStatus, 'open')}
          emoji="🟢"
          accent="green"
          highlight={n(byStatus, 'open') > 0}
        />
        <ConversationMetricsCard
          label="Waiting Customer"
          value={n(byStatus, 'waiting_customer')}
          emoji="🟡"
          accent="amber"
        />
        <ConversationMetricsCard
          label="Waiting Internal"
          value={n(byStatus, 'waiting_internal')}
          emoji="🔵"
          accent="blue"
          highlight={n(byStatus, 'waiting_internal') > 0}
          hint={n(byStatus, 'waiting_internal') > 0 ? 'verifique atenção ⚠️' : undefined}
        />
        <ConversationMetricsCard
          label="Escalated"
          value={n(byStatus, 'escalated')}
          emoji="🟠"
          accent="orange"
          highlight={n(byStatus, 'escalated') > 0}
          hint={n(byStatus, 'escalated') > 0 ? 'requer ação imediata' : undefined}
        />
        <ConversationMetricsCard
          label="Closed"
          value={n(byStatus, 'closed')}
          emoji="⚫"
          accent="zinc"
        />
      </div>

      {/* ── Resultados Comerciais ─────────────────────────────────── */}
      <SectionTitle>Resultados Comerciais — Outcome</SectionTitle>
      <p className="mb-3 text-xs text-base-content/40">
        Conversas encerradas e como terminaram — separado do status operacional.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <ConversationMetricsCard
          label="Won"
          value={n(byOutcome, 'won')}
          emoji="🏆"
          accent="green"
          highlight={n(byOutcome, 'won') > 0}
          hint="vendas realizadas"
        />
        <ConversationMetricsCard
          label="Lost"
          value={n(byOutcome, 'lost')}
          emoji="❌"
          accent="red"
          hint="vendas perdidas"
        />
        <ConversationMetricsCard
          label="No Response"
          value={n(byOutcome, 'no_response')}
          emoji="🔇"
          accent="zinc"
          hint="fechado por inatividade"
        />
        <ConversationMetricsCard
          label="Opt-out"
          value={n(byStatus, 'opt_out')}
          emoji="🚫"
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
          emoji="🤖"
          accent="brand"
          hint={`${m.messages.aiGenerated} respostas enviadas pela IA`}
        />
        <ConversationMetricsCard
          label="Tokens"
          value={(m.ai.tokensIn + m.ai.tokensOut).toLocaleString('pt-BR')}
          emoji="⚡"
          hint={`${m.ai.tokensIn} in · ${m.ai.tokensOut} out`}
        />
        <ConversationMetricsCard
          label="Custo IA (est.)"
          value={`US$ ${m.ai.estimatedCostUsd.toFixed(4)}`}
          emoji="💵"
          accent="amber"
          hint="estimado pelos tokens"
        />
        <ConversationMetricsCard
          label="DLQ (erros)"
          value={m.events.dlq}
          emoji="⚠️"
          accent={m.events.dlq > 0 ? 'red' : undefined}
          hint="eventos com falha"
        />
      </div>

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
    </div>
  );
}
