import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  Button,
  Card,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  LoadingState,
  EmptyState,
  ErrorState,
  PageContainer,
  PageHeader,
  Breadcrumb,
} from '@/shared/ui';
import { getCategoryConfig, getPriorityConfig, CATEGORY_CONFIG } from '@/lib/ticket-category';
import { getStatusConfig } from '@/lib/conversation-status';

/**
 * SupportPage — módulo de Suporte do Nexa.
 *
 * Lista os tickets de atendimento que a Lia abre/resolve. A lógica e a fonte de
 * dados (GET /conversations, filtrado para suporte) NÃO mudam — apenas a camada
 * visual usa o design system (@/shared/ui) e os configs canônicos de
 * categoria/prioridade/status.
 * TODO(produto): paginação, busca, ordenação, detalhe do ticket, SLA, ações.
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

// ─── Badges (usam os configs canônicos) ──────────────────────────────────────

function CategoryPill({ cat }: { cat?: string | null }) {
  const cfg = getCategoryConfig(cat);
  if (!cfg) return <span className="text-base-content/30">—</span>;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color} ${cfg.textColor}`}
    >
      <span aria-hidden>{cfg.emoji}</span>
      {cfg.label}
    </span>
  );
}

function PriorityPill({ pri }: { pri?: string | null }) {
  const cfg = getPriorityConfig(pri);
  if (!cfg) return <span className="text-base-content/30">—</span>;
  const isCritical = pri === 'critical';
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.color} ${cfg.textColor} ${
        isCritical ? 'shadow-sm ring-2 ring-red-500/50 animate-pulse' : ''
      }`}
    >
      <span aria-hidden>{cfg.emoji}</span>
      {cfg.label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cfg.dot }} aria-hidden />
      {cfg.labelPt}
    </span>
  );
}

export function SupportPage() {
  const navigate = useNavigate();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  function load(signal?: AbortSignal) {
    setLoading(true);
    setError(false);
    api
      .get('/conversations', { signal })
      .then((r) => setConvs(Array.isArray(r.data) ? r.data : r.data?.items ?? []))
      .catch((e) => {
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') setError(true);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
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

  const summary = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      escalated: tickets.filter((t) => t.status === 'escalated').length,
      closed: tickets.filter((t) => t.status === 'closed').length,
    }),
    [tickets],
  );

  const cards = [
    { label: 'Tickets', value: summary.total, accent: 'text-base-content' },
    { label: 'Abertos', value: summary.open, accent: 'text-emerald-600' },
    { label: 'Escalados', value: summary.escalated, accent: summary.escalated > 0 ? 'text-red-600' : 'text-base-content' },
    { label: 'Fechados', value: summary.closed, accent: 'text-base-content/70' },
  ];

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Suporte' }]} />}
        title="Suporte"
        subtitle="Tickets de atendimento que a Lia abre e resolve para os clientes."
      />

      {/* ===== Cards de resumo ===== */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className={`text-2xl font-bold ${card.accent}`}>{card.value}</div>
            <div className="text-xs text-base-content/50">{card.label}</div>
          </Card>
        ))}
      </div>

      {/* ===== Filtros ===== */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-48">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="open">Abertos</option>
            <option value="escalated">Escalados</option>
            <option value="waiting_customer">Aguardando cliente</option>
            <option value="waiting_internal">Aguardando equipe</option>
            <option value="closed">Fechados</option>
          </Select>
        </div>
        <div className="w-48">
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Todas as categorias</option>
            {Object.entries(CATEGORY_CONFIG).map(([k, cfg]) => (
              <option key={k} value={k}>
                {cfg.label}
              </option>
            ))}
          </Select>
        </div>
        <span className="ml-auto text-xs text-base-content/50">{filtered.length} ticket(s)</span>
      </div>

      {/* ===== Lista de tickets ===== */}
      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Carregando tickets…" />
        ) : error ? (
          <ErrorState
            title="Não foi possível carregar os tickets"
            description="Verifique sua conexão e tente novamente."
            action={
              <Button variant="outline" size="sm" onClick={() => load()}>
                Recarregar
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🛠️"
            title="Nenhum ticket de suporte"
            description="Quando a Lia abrir um chamado de suporte, ele aparece aqui."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Categoria</TH>
                <TH>Prioridade</TH>
                <TH>Status</TH>
                <TH>Última atividade</TH>
                <TH className="text-right">Ação</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((t) => (
                <TR key={t.id}>
                  <TD>
                    <div className="font-medium text-base-content">
                      {t.contact?.name || displayPhone(t.phone)}
                    </div>
                    <div className="text-xs text-base-content/50">{displayPhone(t.phone)}</div>
                  </TD>
                  <TD>
                    <CategoryPill cat={t.ticketCategory} />
                  </TD>
                  <TD>
                    <PriorityPill pri={t.ticketPriority} />
                  </TD>
                  <TD>
                    <StatusPill status={t.status} />
                  </TD>
                  <TD className="text-base-content/60">{timeAgo(t.lastActivityAt)}</TD>
                  <TD className="text-right">
                    {/* TODO(produto): abrir o detalhe do ticket. Por ora, leva ao Inbox. */}
                    <Button variant="outline" size="sm" onClick={() => navigate('/inbox')}>
                      Abrir
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </PageContainer>
  );
}
