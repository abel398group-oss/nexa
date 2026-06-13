import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { ConversationStatusBadge } from '@/components/conversation/ConversationStatusBadge';
import { ConversationOutcomeBadge } from '@/components/conversation/ConversationOutcomeBadge';
import { ConversationStatusFilter } from '@/components/conversation/ConversationStatusFilter';
import { ConversationTimeline } from '@/components/conversation/ConversationTimeline';
import { isWaitingInternalStale } from '@/lib/conversation-status';
import { TicketCategoryBadge } from '@/components/conversation/TicketCategoryBadge';

interface Conversation {
  id: string;
  phone: string;
  sourceChannel?: string | null;
  status: string;
  outcome?: string | null;
  lastActivityAt?: string | null;
  assignedSeller?: { name: string } | null;
  customerStage?: string | null;
  ticketCategory?: string | null;
  ticketPriority?: string | null;
  contact?: { name?: string | null; nameSource?: string | null; tags?: string[] } | null;
}

// Converte "email:addr@ex.com" → "addr@ex.com" para exibição
function displayPhone(phone: string): string {
  return phone.startsWith('email:') ? phone.slice(6) : phone;
}

function ChannelBadge({ sourceChannel }: { sourceChannel?: string | null }) {
  if (sourceChannel === 'email') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 font-medium" title="Canal: e-mail">
        <Icon name="mail" className="h-3 w-3" /> email
      </span>
    );
  }
  if (sourceChannel === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 font-medium" title="Canal: WhatsApp">
        <Icon name="inbox" className="h-3 w-3" /> whatsapp
      </span>
    );
  }
  return null;
}
interface Message { id: string; direction: string; content: string; createdAt: string; ack?: number; }
interface TmsCustomer { externalId: string; name: string; email?: string; plan?: string; status: string; }
interface TmsLookup { found: boolean; customer: TmsCustomer | null; }

function hora(iso: string) {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

function Recibo({ ack }: { ack?: number }) {
  const a = ack ?? 0;
  if (a >= 3) return <span className="font-semibold text-sky-200" title="Lido">✓✓ lido</span>;
  if (a === 2) return <span className="text-white/75" title="Entregue">✓✓ entregue</span>;
  if (a >= 1) return <span className="text-white/75" title="Enviado">✓ enviado</span>;
  return <span className="text-white/60" title="Enviando">enviando</span>;
}

export function InboxPage() {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [liaBusy, setLiaBusy] = useState(false);
  const [liaInfo, setLiaInfo] = useState('');
  const [tmsLookup, setTmsLookup] = useState<TmsLookup | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api.get('/conversations', { signal: controller.signal })
      .then((r) => setConvs(r.data.items))
      .catch((e) => { if (e?.code !== 'ERR_CANCELED') console.error(e); })
      .finally(() => setLoadingConvs(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (socketRef.current) return;
    const s = io('/', { path: '/ws', transports: ['websocket'] });
    socketRef.current = s;
    s.on('message', (msg: Message) => setMessages((prev) => [...prev, msg]));
    s.on('message:ack', (d: { id: string; ack: number }) =>
      setMessages((prev) => prev.map((m) => (m.id === d.id ? { ...m, ack: d.ack } : m))),
    );
    return () => { s.close(); socketRef.current = null; };
  }, []);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = 0;
  }, [active?.id, messages.length]);

  // contagem por status para os filtros
  const statusCounts = convs.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // conversas filtradas + ordenação: escalated primeiro, depois por lastActivityAt
  const filtered = convs
    .filter((c) => activeFilter === 'all' || c.status === activeFilter)
    .sort((a, b) => {
      // escalated sempre no topo
      if (a.status === 'escalated' && b.status !== 'escalated') return -1;
      if (b.status === 'escalated' && a.status !== 'escalated') return 1;
      // depois por atividade mais recente
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return tb - ta;
    });

  function openConv(c: Conversation) {
    setActive(c);
    setTmsLookup(null);
    setShowTimeline(false);
    api.get(`/conversations/${c.id}/messages`).then((r) => setMessages(r.data));
    socketRef.current?.emit('join', { conversationId: c.id });
    api.get(`/connectors/lookup?phone=${encodeURIComponent(c.phone)}`)
      .then((r) => setTmsLookup(r.data))
      .catch(() => setTmsLookup({ found: false, customer: null }));
  }

  async function send() {
    if (!active || !text.trim()) return;
    await api.post(`/conversations/${active.id}/messages`, { direction: 'outbound', content: text });
    setText('');
    setLiaInfo('');
  }

  async function setOutcome(outcome: 'won' | 'lost' | null) {
    if (!active) return;
    await api.patch(`/conversations/${active.id}/outcome`, { outcome });
    const updated = { ...active, outcome };
    setActive(updated);
    setConvs((prev) => prev.map((c) => (c.id === active.id ? { ...c, outcome } : c)));
  }

  async function suggest() {
    if (!active) return;
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
    const question = lastInbound?.content || 'Olá, tudo bem?';
    setLiaBusy(true);
    setLiaInfo('');
    try {
      const r = await api.post('/agent/handle', { message: question, conversationId: active.id });
      setText(r.data.draft);
      const route = r.data.route || {};
      const fontes = (r.data.usedKnowledge || []).map((k: any) => k.title).join(', ');
      setLiaInfo(
        `${route.agent} · ${route.intent} · score ${route.leadScore}` +
          (r.data.suggestedAction && r.data.suggestedAction !== 'none' ? ` · ação: ${r.data.suggestedAction}` : '') +
          (r.data.needsHuman ? ' · escalar' : '') +
          (fontes ? ` · fontes: ${fontes}` : ''),
      );
    } finally {
      setLiaBusy(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* ── Sidebar conversas ─────────────────────────────────────────── */}
      <aside className="flex w-80 flex-col border-r border-base-200 bg-[var(--surface)]">
        <div className="border-b border-base-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">
          Conversas
        </div>

        {/* filtros rápidos */}
        {!loadingConvs && convs.length > 0 && (
          <ConversationStatusFilter
            active={activeFilter}
            onChange={setActiveFilter}
            counts={statusCounts}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingConvs && <div className="p-3"><SkeletonList rows={5} /></div>}
          {!loadingConvs && convs.length === 0 && (
            <div className="p-3">
              <EmptyState icon={<Icon name="inbox" className="h-9 w-9" />} title="Nenhuma conversa" description="As conversas do WhatsApp aparecem aqui assim que um lead mandar mensagem." />
            </div>
          )}
          {!loadingConvs && filtered.length === 0 && convs.length > 0 && (
            <div className="p-4 text-center text-xs text-base-content/40">
              Nenhuma conversa com este filtro.
            </div>
          )}
          {!loadingConvs && filtered.map((c) => {
            const stale = c.status === 'waiting_internal' && isWaitingInternalStale(c.lastActivityAt);
            return (
              <button
                key={c.id}
                onClick={() => openConv(c)}
                className={[
                  'block w-full border-b px-4 py-3 text-left text-sm hover:bg-base-100 transition-colors',
                  active?.id === c.id ? 'bg-base-200' : '',
                  c.status === 'escalated' ? 'border-l-2 border-l-orange-400' : '',
                ].join(' ')}
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-semibold text-brand-600">
                    {(c.contact?.name
                      ? c.contact.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('')
                      : displayPhone(c.phone).slice(0, 2)
                    ).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-medium text-base-content">
                        {c.contact?.name || displayPhone(c.phone)}
                      </span>
                      {stale && <Icon name="alert" title="Aguardando equipe há +2h" className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                    </div>
                    {c.contact?.name && (
                      <div className="truncate text-[11px] text-base-content/50">{displayPhone(c.phone)}</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <ConversationStatusBadge status={c.status} lastActivityAt={c.lastActivityAt} />
                      {c.outcome && <ConversationOutcomeBadge outcome={c.outcome} />}
                      {c.sourceChannel && c.sourceChannel !== 'whatsapp' && (
                        <ChannelBadge sourceChannel={c.sourceChannel} />
                      )}
                      {(c.ticketCategory || c.ticketPriority) && (
                        <TicketCategoryBadge category={c.ticketCategory} priority={c.ticketPriority} compact />
                      )}
                      {c.assignedSeller && (
                        <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                          {c.assignedSeller.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t p-3 text-xs text-base-content/40" style={{ borderColor: 'var(--border)' }}>
          {user?.email}
        </div>
      </aside>

      {/* ── Thread ────────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col bg-base-100 min-w-0">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-base-content/40">
            Selecione uma conversa
          </div>
        ) : (
          <>
            {/* header da conversa */}
            <div className="flex items-center justify-between border-b border-base-200 bg-[var(--surface)] px-4 py-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-base-content leading-tight">
                    {active.contact?.name || displayPhone(active.phone)}
                  </span>
                  {active.contact?.name && (
                    <span className="text-xs text-base-content/50">{displayPhone(active.phone)}</span>
                  )}
                </div>

                {/* status badge (tamanho md no header) */}
                <ConversationStatusBadge
                  status={active.status}
                  lastActivityAt={active.lastActivityAt}
                  size="md"
                />
                {active.outcome && (
                  <ConversationOutcomeBadge outcome={active.outcome} size="md" />
                )}

                {/* canal */}
                {active.sourceChannel && active.sourceChannel !== 'whatsapp' && (
                  <ChannelBadge sourceChannel={active.sourceChannel} />
                )}

                {/* ticket category/priority — suporte */}
                {(active.ticketCategory || active.ticketPriority) && (
                  <TicketCategoryBadge
                    category={active.ticketCategory}
                    priority={active.ticketPriority}
                  />
                )}

                {/* badge TMS */}
                {tmsLookup === null && (
                  <span className="rounded-full bg-base-200 px-2 py-0.5 text-[11px] text-base-content/40">verificando TMS…</span>
                )}
                {tmsLookup?.found && tmsLookup.customer && (
                  <span
                    title={`${tmsLookup.customer.name}${tmsLookup.customer.plan ? ` · Plano: ${tmsLookup.customer.plan}` : ''}`}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700"
                  >
                    <Icon name="check" className="h-3 w-3" /> Cliente TMS{tmsLookup.customer.plan ? ` — ${tmsLookup.customer.plan}` : ''}
                  </span>
                )}
                {tmsLookup !== null && !tmsLookup.found && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-base-200 px-2.5 py-0.5 text-[11px] text-base-content/50">
                    Prospect
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* botão timeline */}
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ${
                    showTimeline
                      ? 'bg-base-300 border-base-300 text-base-content'
                      : 'border-base-300 text-base-content/60 hover:bg-base-100'
                  }`}
                  title="Histórico de status"
                >
                  <span className="inline-flex items-center gap-1"><Icon name="knowledge" className="h-3.5 w-3.5" /> Timeline</span>
                </button>

                {/* resultado da venda */}
                <span className="text-xs text-base-content/50">Resultado:</span>
                <button
                  onClick={() => setOutcome(active.outcome === 'won' ? null : 'won')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active.outcome === 'won'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-base-300 text-base-content/70 hover:bg-base-100'
                  }`}
                ><span className="inline-flex items-center gap-1"><Icon name="check" className="h-3.5 w-3.5" /> Ganhou</span></button>
                <button
                  onClick={() => setOutcome(active.outcome === 'lost' ? null : 'lost')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    active.outcome === 'lost'
                      ? 'bg-red-600 text-white'
                      : 'border border-base-300 text-base-content/70 hover:bg-base-100'
                  }`}
                ><span className="inline-flex items-center gap-1"><Icon name="close" className="h-3.5 w-3.5" /> Perdeu</span></button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* mensagens */}
              <div
                ref={threadRef}
                className={`flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-4 ${showTimeline ? 'max-w-[calc(100%-260px)]' : ''}`}
              >
                {[...messages].reverse().map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                      m.direction === 'outbound'
                        ? 'rounded-tr-sm bg-brand-500 text-white'
                        : 'rounded-tl-sm border border-base-200 bg-[var(--surface)] text-base-content shadow-sm'
                    }`}>
                      <div className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{m.content}</div>
                      <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                        m.direction === 'outbound' ? 'text-white/70' : 'text-base-content/40'
                      }`}>
                        <span>{hora(m.createdAt)}</span>
                        {m.direction === 'outbound' && <Recibo ack={m.ack} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* painel timeline */}
              {showTimeline && (
                <div className="w-64 flex-shrink-0 border-l bg-[var(--surface)] overflow-y-auto p-4" style={{ borderColor: 'var(--border)' }}>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">
                    Histórico de Status
                  </div>
                  <ConversationTimeline conversationId={active.id} />
                </div>
              )}
            </div>

            {/* input */}
            <div className="border-t border-base-200 bg-[var(--surface)] p-3">
              {liaInfo && <div className="mb-2 inline-flex items-center gap-1 px-2 text-xs text-brand-600"><Icon name="bot" className="h-3.5 w-3.5" /> {liaInfo}</div>}
              <div className="flex gap-2">
                <button
                  onClick={suggest}
                  disabled={liaBusy}
                  title="Sugerir resposta com a Lia"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {liaBusy ? '...' : <><Icon name="bot" className="h-4 w-4" /> Lia</>}
                </button>
                <input
                  className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  style={{ borderColor: 'var(--border-input)', background: 'var(--surface-input)', color: 'var(--text-primary)' }}
                  placeholder="Digite uma mensagem..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button onClick={send} className="rounded-full bg-brand-600 px-5 py-2 text-sm text-white hover:bg-brand-700">
                  Enviar
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
