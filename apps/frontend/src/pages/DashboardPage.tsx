import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useDateRange } from '@/contexts/DateRangeContext';

interface Overview {
  contacts: { total: number; optedOut: number; byLeadStatus: Record<string, number> };
  conversations: { total: number; byStatus: Record<string, number> };
  messages: { inbound: number; outbound: number; aiGenerated: number; aiSharePct: number };
  ai: { tokensIn: number; tokensOut: number; estimatedCostUsd: number };
  knowledge: { total: number };
  billing: { byStatus: Record<string, number> };
  events: { byStatus: Record<string, number>; dlq: number };
  complaints: { total: number; byTopic: Record<string, number> };
}

function Card({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accent ?? 'text-zinc-800'}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-400">{hint}</div>}
    </div>
  );
}

function chips(obj: Record<string, number>) {
  const e = Object.entries(obj).filter(([k]) => k !== 'null');
  if (e.length === 0) return <span className="text-xs text-zinc-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {e.map(([k, v]) => (
        <span key={k} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{k}: {v}</span>
      ))}
    </div>
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
    const t = setInterval(load, 10000); // auto-refresh a cada 10s
    return () => clearInterval(t);
    // recarrega quando o período muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  if (!m) return <div className="flex h-full items-center justify-center text-zinc-400">Carregando métricas...</div>;

  return (
    <div className="h-full overflow-auto bg-zinc-50 p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Dashboard</h1>
          <p className="text-xs text-zinc-400">Período: <strong className="text-zinc-600">{range.label}</strong> · atualiza a cada 10s</p>
        </div>
        <button onClick={load} className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm hover:bg-zinc-50">
          ↻ Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Contatos" value={m.contacts.total} hint={`${m.contacts.optedOut} opt-outs`} />
        <Card label="Conversas" value={m.conversations.total} hint={`${m.conversations.byStatus['open'] ?? 0} abertas`} />
        <Card label="Mensagens" value={m.messages.inbound + m.messages.outbound} hint={`${m.messages.inbound} in · ${m.messages.outbound} out`} />
        <Card label="Base (KB)" value={m.knowledge.total} hint="itens de conhecimento" />
        <Card label="IA autônoma" value={`${m.messages.aiSharePct}%`} accent="text-brand-600" hint={`${m.messages.aiGenerated} respostas enviadas pela IA`} />
        <Card label="Tokens" value={(m.ai.tokensIn + m.ai.tokensOut).toLocaleString('pt-BR')} hint={`${m.ai.tokensIn} in · ${m.ai.tokensOut} out`} />
        <Card label="Custo IA (est.)" value={`US$ ${m.ai.estimatedCostUsd.toFixed(4)}`} accent="text-amber-600" hint="estimado pelos tokens" />
        <Card label="DLQ (erros)" value={m.events.dlq} accent={m.events.dlq > 0 ? 'text-red-600' : 'text-zinc-800'} hint="eventos com falha" />
        <Card label="Reclamações" value={m.complaints.total} accent={m.complaints.total > 0 ? 'text-red-600' : 'text-zinc-800'} hint="monitor interno" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-zinc-600">Leads por estágio</div>
          {chips(m.contacts.byLeadStatus)}
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-zinc-600">Cobranças</div>
          {chips(m.billing.byStatus)}
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-zinc-600">Eventos</div>
          {chips(m.events.byStatus)}
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-zinc-600">Reclamações por tema</div>
          {chips(m.complaints.byTopic)}
        </div>
      </div>
    </div>
  );
}
