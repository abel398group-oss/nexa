import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

/**
 * SupportPage — ESTRUTURA (scaffold) do módulo de Suporte do Nexa.
 *
 * Objetivo: dar ao squad de design uma base funcional para estilizar.
 * Já busca os dados reais (conversas de suporte) e renderiza a lista com
 * categoria/prioridade/status. O visual é propositalmente simples — trocar
 * pelos componentes do design system de vocês.
 *
 * Fonte de dados: GET /conversations (mesmo endpoint do Inbox), filtrado para
 * tickets de suporte (tem ticketCategory, ou cliente ativo, ou status escalado).
 * TODO(design): paginação, busca, ordenação, detalhe do ticket, SLA, ações.
 */

interface Conversation {
  id: string;
  phone: string;
  sourceChannel?: string | null;
  status: string;
  outcome?: string | null;
  lastActivityAt?: string | null;
  customerStage?: string | null;
  ticketCategory?: string | null;
  ticketPriority?: string | null;
  contact?: { name?: string | null } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  fiscal: 'Fiscal', cte: 'CT-e', mdfe: 'MDF-e', frete: 'Frete', financeiro: 'Financeiro',
  cadastro: 'Cadastro', usuarios: 'Usuários', integracoes: 'Integrações', api: 'API',
  erro_sistema: 'Erro de sistema', treinamento: 'Treinamento',
};

const PRIORITY_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-base-200 text-base-content/60',
};

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  escalated: 'bg-red-100 text-red-700',
  waiting_customer: 'bg-blue-100 text-blue-700',
  waiting_internal: 'bg-purple-100 text-purple-700',
  closed: 'bg-base-200 text-base-content/60',
};

function isSupportTicket(c: Conversation): boolean {
  return !!c.ticketCategory || c.customerStage === 'cliente_ativo' || c.status === 'escalated';
}

function displayPhone(phone: string): string {
  return phone.startsWith('email:') ? phone.slice(6) : phone;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function SupportPage() {
  const navigate = useNavigate();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    const controller = new AbortController();
    api
      .get('/conversations', { signal: controller.signal })
      .then((r) => setConvs(Array.isArray(r.data) ? r.data : r.data?.items ?? []))
      .catch(() => setConvs([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const tickets = useMemo(() => convs.filter(isSupportTicket), [convs]);

  const filtered = useMemo(
    () =>
      tickets.filter(
        (t) =>
          (statusFilter === 'all' || t.status === statusFilter) &&
          (categoryFilter === 'all' || t.ticketCategory === categoryFilter),
      ),
    [tickets, statusFilter, categoryFilter],
  );

  // resumo (cards) — estrutura para o design
  const summary = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      escalated: tickets.filter((t) => t.status === 'escalated').length,
      closed: tickets.filter((t) => t.status === 'closed').length,
    }),
    [tickets],
  );

  return (
    <div className="p-6">
      {/* ===== Cards de resumo (estrutura — design refina) ===== */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Tickets', value: summary.total },
          { label: 'Abertos', value: summary.open },
          { label: 'Escalados', value: summary.escalated },
          { label: 'Fechados', value: summary.closed },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-base-200 bg-white p-4 dark:bg-sidebar">
            <div className="text-2xl font-bold text-base-content">{card.value}</div>
            <div className="text-xs text-base-content/50">{card.label}</div>
          </div>
        ))}
      </div>

      {/* ===== Filtros (estrutura) ===== */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-base-300 bg-white px-3 text-sm"
        >
          <option value="all">Todos os status</option>
          <option value="open">Abertos</option>
          <option value="escalated">Escalados</option>
          <option value="waiting_customer">Aguardando cliente</option>
          <option value="closed">Fechados</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-md border border-base-300 bg-white px-3 text-sm"
        >
          <option value="all">Todas as categorias</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-base-content/50">{filtered.length} ticket(s)</span>
      </div>

      {/* ===== Tabela de tickets (estrutura) ===== */}
      <div className="overflow-hidden rounded-xl border border-base-200 bg-white dark:bg-sidebar">
        {loading ? (
          <div className="p-10 text-center text-base-content/40">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-base-content/40">Nenhum ticket de suporte encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-base-200 text-left text-xs text-base-content/50">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Prioridade</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Última atividade</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-base-200">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-base-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-base-content">{t.contact?.name || displayPhone(t.phone)}</div>
                    <div className="text-xs text-base-content/50">{displayPhone(t.phone)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {t.ticketCategory ? (
                      <span className="rounded-full bg-base-200 px-2 py-0.5 text-xs text-base-content/70">
                        {CATEGORY_LABELS[t.ticketCategory] ?? t.ticketCategory}
                      </span>
                    ) : (
                      <span className="text-base-content/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.ticketPriority ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLE[t.ticketPriority] ?? 'bg-base-200'}`}>
                        {t.ticketPriority}
                      </span>
                    ) : (
                      <span className="text-base-content/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status] ?? 'bg-base-200'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-base-content/60">{timeAgo(t.lastActivityAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {/* TODO(design): abrir o detalhe do ticket. Por ora, leva ao Inbox. */}
                    <button
                      onClick={() => navigate('/inbox')}
                      className="rounded-md border border-base-300 px-3 py-1 text-xs font-medium text-base-content/70 hover:bg-base-100"
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
