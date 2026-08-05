import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';
import { Select } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { useAuth } from '@/app/providers/AuthContext';
import { useTenant } from '@/app/providers/TenantContext';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/icons';
import { displayPhone } from '@/shared/lib/phone';
import { bulkTagContacts } from '@/entities/contact';
import { listSellersMini } from '@/entities/seller';
import {
  type Conversation,
  type Message,
  listConversations,
  getConversationMessages,
  sendMessage,
  returnConversationToAi,
  setConversationOutcome,
  assignSeller as reassignSeller,
  setConversationResolved,
  archiveConversation,
  deleteConversation,
  bulkConversationAction,
} from '@/entities/conversation';
import { ConversationStatusBadge } from '@/components/conversation/ConversationStatusBadge';
import { ConversationOutcomeBadge } from '@/components/conversation/ConversationOutcomeBadge';
import { ConversationStatusFilter } from '@/components/conversation/ConversationStatusFilter';
import { ConversationTimeline } from '@/components/conversation/ConversationTimeline';
import { isWaitingInternalStale } from '@/shared/lib/conversation-status';
import { isSupportTicket } from '@/shared/lib/conversation';
import { TicketCategoryBadge } from '@/components/conversation/TicketCategoryBadge';

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
  if (sourceChannel === 'web_chat') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 font-medium" title="Canal: Web Chat (TMS)">
        <Icon name="bot" className="h-3 w-3" /> web chat
      </span>
    );
  }
  if (sourceChannel === 'portal') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700 font-medium" title="Canal: Portal do Cliente">
        <Icon name="building" className="h-3 w-3" /> portal
      </span>
    );
  }
  return null;
}
interface TmsCustomer { externalId: string; name: string; email?: string; plan?: string; status: string; }
interface TmsLookup { found: boolean; customer: TmsCustomer | null; }

// Retorna chave de dia para comparar se duas mensagens são do mesmo dia
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Texto do separador de data (Hoje / Ontem / dia da semana / dd/MM/YYYY)
function fmtDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.setHours(0, 0, 0, 0) - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000,
  );
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Timestamp dentro do balão: só hora se hoje, data+hora se outro dia
function fmtMsgTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    return isToday
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function Recibo({ ack }: { ack?: number }) {
  const a = ack ?? 0;
  if (a >= 3) return <span className="font-semibold text-sky-200" title="Lido">✓✓ lido</span>;
  if (a === 2) return <span className="text-white/75" title="Entregue">✓✓ entregue</span>;
  if (a >= 1) return <span className="text-white/75" title="Enviado">✓ enviado</span>;
  return <span className="text-white/60" title="Enviando">enviando</span>;
}

// Inbox de conversas (lista + chat), compartilhado por Vendas e Suporte.
// `scope` controla só o filtro: vendas exclui tickets de suporte; suporte só tickets.
export function ConversationInbox({ scope = 'sales' }: { scope?: 'sales' | 'support' }) {
  const { user } = useAuth();
  const { actingTenantId } = useTenant();
  const toast = useToast();
  const confirm = useConfirm();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sellerFilter, setSellerFilter] = useState(''); // '' = todos · '__none__' = sem vendedor
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [liaBusy, setLiaBusy] = useState(false);
  const [liaInfo, setLiaInfo] = useState('');
  const [tmsLookup, setTmsLookup] = useState<TmsLookup | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [convsError, setConvsError] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [tagInput, setTagInput] = useState('');
  // seleção em massa (chave = conversationId do representante do grupo)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set(filtered.map((c) => c.id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkArchive() {
    if (!selectedIds.size || bulkBusy) return;
    setBulkBusy(true);
    try {
      const r = await bulkConversationAction([...selectedIds], 'archive');
      setConvs((cs) => cs.filter((c) => !selectedIds.has(c.id)));
      if (active && selectedIds.has(active.id)) setActive(null);
      clearSelection();
      toast.success(`${r.archived} conversa(s) arquivada(s).`);
    } catch {
      toast.error('Erro ao arquivar conversas.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!selectedIds.size || bulkBusy) return;
    const ok = await confirm({ title: 'Excluir conversas', message: `Excluir permanentemente ${selectedIds.size} conversa(s)? Esta ação não pode ser desfeita.`, variant: 'danger', confirmLabel: 'Excluir' });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const r = await bulkConversationAction([...selectedIds], 'delete');
      setConvs((cs) => cs.filter((c) => !selectedIds.has(c.id)));
      if (active && selectedIds.has(active.id)) setActive(null);
      clearSelection();
      toast.success(`${r.deleted} conversa(s) excluída(s).`);
    } catch {
      toast.error('Erro ao excluir conversas.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function archiveOne(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await archiveConversation(id);
      setConvs((cs) => cs.filter((c) => c.id !== id));
      if (active?.id === id) setActive(null);
      toast.success('Conversa arquivada.');
    } catch {
      toast.error('Erro ao arquivar.');
    }
  }

  async function deleteOne(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirm({ title: 'Excluir conversa', message: 'Excluir permanentemente esta conversa? Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' });
    if (!ok) return;
    try {
      await deleteConversation(id);
      setConvs((cs) => cs.filter((c) => c.id !== id));
      if (active?.id === id) setActive(null);
      toast.success('Conversa excluída.');
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  // tags do contato da conversa aberta: atualiza local + servidor
  function setActiveTags(tags: string[]) {
    setActive((a) => (a && a.contact ? { ...a, contact: { ...a.contact, tags } } : a));
    setConvs((cs) => cs.map((c) => (c.id === active?.id && c.contact ? { ...c, contact: { ...c.contact, tags } } : c)));
  }
  async function addContactTag() {
    const tag = tagInput.trim();
    const cid = active?.contact?.id;
    if (!tag || !cid) { setTagInput(''); return; }
    const cur = active?.contact?.tags ?? [];
    if (cur.includes(tag)) { setTagInput(''); return; }
    setTagInput('');
    setActiveTags([...cur, tag]); // otimista
    try { await bulkTagContacts([cid], tag, 'add'); } catch { setActiveTags(cur); }
  }
  async function removeContactTag(tag: string) {
    const cid = active?.contact?.id;
    if (!cid) return;
    const cur = active?.contact?.tags ?? [];
    setActiveTags(cur.filter((t) => t !== tag)); // otimista
    try { await bulkTagContacts([cid], tag, 'remove'); } catch { setActiveTags(cur); }
  }
  // vendedores (pra reatribuir lead no header da conversa)
  const { data: sellers = [] } = useQuery({
    queryKey: ['sellers-mini'],
    queryFn: listSellersMini,
  });
  // follow-ups automáticos (read-only) pra indicar no header da conversa
  const { data: followups = [] } = useQuery({
    queryKey: ['followups'],
    queryFn: () => api.get('/followups').then((r) => r.data as { conversationId: string; status: string; nextRunAt: string }[]),
  });
  const activeFollowup = active
    ? followups.find((f) => f.conversationId === active.id && f.status === 'pending') ?? null
    : null;
  const socketRef = useRef<Socket | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  // Ref sempre atualizado com o tenantId efetivo — usado dentro dos handlers do socket.
  const inboxTenantRef = useRef<string | null | undefined>(null);

  function reloadConvs(signal?: AbortSignal) {
    setLoadingConvs(true);
    setConvsError(null);
    listConversations(signal)
      .then((r) => { setConvs(r.items); })
      .catch((e) => {
        if (e?.code === 'ERR_CANCELED') return;
        const msg = e?.response?.data?.message ?? e?.message ?? 'Erro ao carregar conversas';
        console.error('[InboxPage] listConversations falhou:', msg, e);
        setConvsError(msg);
      })
      .finally(() => setLoadingConvs(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    reloadConvs(controller.signal);
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mantém o ref sincronizado e emite join_inbox se o socket já estiver conectado.
  useEffect(() => {
    inboxTenantRef.current = actingTenantId ?? user?.tenantId;
    const tenantId = inboxTenantRef.current;
    if (tenantId && socketRef.current?.connected) {
      socketRef.current.emit('join_inbox', { tenantId });
    }
  }, [actingTenantId, user?.tenantId]);

  useEffect(() => {
    if (socketRef.current) return;
    const s = io('/', { path: '/ws', transports: ['websocket'] });
    socketRef.current = s;
    s.on('message', (msg: Message) => setMessages((prev) => [...prev, msg]));
    s.on('message:ack', (d: { id: string; ack: number }) =>
      setMessages((prev) => prev.map((m) => (m.id === d.id ? { ...m, ack: d.ack } : m))),
    );
    // Atualiza a lista do inbox quando uma conversa do tenant recebe atividade.
    // Rebusca a lista completa para garantir ordem, dados frescos e novas conversas.
    s.on('inbox:update', () => {
      listConversations().then((r) => setConvs(r.items)).catch((e) => {
        console.error('[InboxPage] inbox:update reload falhou:', e?.response?.data?.message ?? e?.message);
      });
    });
    // Ao (re)conectar: entra na sala tenant para receber inbox:update em tempo real.
    s.on('connect', () => {
      const tenantId = inboxTenantRef.current;
      if (tenantId) s.emit('join_inbox', { tenantId });
    });
    return () => { s.close(); socketRef.current = null; };
  }, []);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = 0;
  }, [active?.id, messages.length]);

  // ADR 034 — deep link: /inbox?c=<conversationId> (link "Atender agora" da
  // notificação de handoff no WhatsApp do vendedor). Quando a lista carrega e
  // o param está presente, abre a conversa direto e limpa o param (pra não
  // reabrir em cada re-render/refresh de lista).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const target = searchParams.get('c');
    if (!target || !convs.length) return;
    const conv = convs.find((c) => c.id === target);
    if (conv) {
      openGroup({ rep: conv, convs: [{ id: conv.id }] });
    }
    // limpa o param mesmo se a conversa não existir mais (evita loop de busca)
    searchParams.delete('c');
    setSearchParams(searchParams, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs.length, searchParams]);

  // contagem por status para os filtros
  const statusCounts = convs.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // conversas filtradas + ordenação: escalated primeiro, depois por lastActivityAt
  const filtered = convs
    // vendas: exclui tickets de suporte · suporte: só tickets
    .filter((c) => (scope === 'support' ? isSupportTicket(c) : !isSupportTicket(c)))
    .filter((c) => activeFilter === 'all' || c.status === activeFilter)
    .filter((c) =>
      !sellerFilter || (sellerFilter === '__none__' ? !c.assignedSellerId : c.assignedSellerId === sellerFilter),
    )
    .sort((a, b) => {
      // escalated sempre no topo
      if (a.status === 'escalated' && b.status !== 'escalated') return -1;
      if (b.status === 'escalated' && a.status !== 'escalated') return 1;
      // depois por atividade mais recente
      const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return tb - ta;
    });

  // Agrupa por contato (estilo WhatsApp): 1 card por pessoa, a conversa mais
  // recente como representante. `filtered` já vem ordenado (mais recente 1º), então
  // a 1ª ocorrência de cada contato é o representante. Mantém as conversas por baixo.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; rep: Conversation; convs: Conversation[] }>();
    for (const c of filtered) {
      const key = c.contact?.id ?? c.phone;
      const g = map.get(key);
      if (g) g.convs.push(c);
      else map.set(key, { key, rep: c, convs: [c] });
    }
    const all = Array.from(map.values());
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase();
    return all.filter(({ rep: c }) =>
      c.contact?.name?.toLowerCase().includes(q) ||
      c.contact?.company?.toLowerCase().includes(q) ||
      c.phone.includes(q),
    );
  }, [filtered, searchQuery]);

  function openGroup(g: { rep: Conversation; convs: { id: string }[] }) {
    const c = g.rep;
    setActive(c);
    setTmsLookup(null);
    setShowTimeline(false);
    // histórico unificado: junta as mensagens de todas as conversas do contato, em ordem
    Promise.all(
      g.convs.map((cv) => getConversationMessages(cv.id)),
    ).then((lists) => {
      const all = lists.flat().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(all);
    });
    // realtime: novas mensagens entram na conversa mais recente (o representante)
    socketRef.current?.emit('join', { conversationId: c.id });
    api.get(`/connectors/lookup?phone=${encodeURIComponent(c.phone)}`)
      .then((r) => setTmsLookup(r.data))
      .catch(() => setTmsLookup({ found: false, customer: null }));
  }

  async function send() {
    if (!active || !text.trim()) return;
    await sendMessage(active.id, text);
    // ADR 035: a primeira resposta humana ativa o takeover no backend — reflete
    // aqui sem esperar o próximo fetch (badge "Você no comando" aparece na hora).
    if (!active.humanTakeoverAt) {
      const takenAt = new Date().toISOString();
      setActive((a) => (a ? { ...a, humanTakeoverAt: takenAt } : a));
      setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, humanTakeoverAt: takenAt } : c)));
    }
    setText('');
    setLiaInfo('');
  }

  // ADR 035: "Devolver pra Lia" — libera o takeover; a Lia volta a atender sozinha.
  async function returnToAi() {
    if (!active) return;
    const r = await returnConversationToAi(active.id);
    const status = r?.status ?? active.status;
    setActive((a) => (a ? { ...a, humanTakeoverAt: null, status } : a));
    setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, humanTakeoverAt: null, status } : c)));
  }

  async function setOutcome(outcome: 'won' | 'lost' | null) {
    if (!active) return;
    await setConversationOutcome(active.id, outcome);
    const updated = { ...active, outcome };
    setActive(updated);
    setConvs((prev) => prev.map((c) => (c.id === active.id ? { ...c, outcome } : c)));
  }

  async function assignSeller(sellerId: string | null) {
    if (!active) return;
    const r = await reassignSeller(active.id, sellerId);
    const assignedSeller = r?.assignedSeller ?? null;
    const assignedSellerId = r?.assignedSellerId ?? null;
    setActive((a) => (a ? { ...a, assignedSeller, assignedSellerId } : a));
    setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, assignedSeller, assignedSellerId } : c)));
  }

  /**
   * Promove a conversa a oportunidade (F7 — RevOps). A criação automática só
   * dispara em score >= 70 ou pedido de reunião, e isso deixa passar lead real
   * — quem lê a conversa e sabe se vale é o vendedor. Idempotente no backend:
   * clicar de novo não duplica.
   */
  async function promoverParaOportunidade() {
    if (!active) return;
    try {
      await api.post('/opportunities/from-conversation', { conversationId: active.id });
      toast.success('Lead adicionado ao funil — aparece em Minha fila.');
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao adicionar ao funil.');
    }
  }

  // suporte: marcar o chamado como resolvido (fecha) ou reabrir
  async function resolveTicket(resolved: boolean) {
    if (!active) return;
    const r = await setConversationResolved(active.id, resolved);
    const status = r?.status ?? (resolved ? 'closed' : 'open');
    const outcome = r?.outcome ?? (resolved ? 'resolved' : null);
    setActive((a) => (a ? { ...a, status, outcome } : a));
    setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, status, outcome } : c)));
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
        {selectedIds.size > 0 ? (
          /* ── Barra de ação em massa ── */
          <div className="flex items-center gap-2 border-b border-base-200 bg-base-200 px-3 py-2">
            <button onClick={clearSelection} className="text-base-content/50 hover:text-base-content transition-colors" title="Cancelar seleção">
              <Icon name="close" className="h-4 w-4" />
            </button>
            <span className="flex-1 text-xs font-semibold text-base-content">{selectedIds.size} selecionada(s)</span>
            <button
              onClick={selectAll}
              className="rounded px-2 py-1 text-xs text-base-content/60 hover:bg-base-300 transition-colors"
            >
              Todas
            </button>
            <button
              onClick={bulkArchive}
              disabled={bulkBusy}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-base-content/70 hover:bg-base-300 disabled:opacity-50 transition-colors"
              title="Arquivar selecionadas"
            >
              <Icon name="archive" className="h-3.5 w-3.5" /> Arquivar
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-error hover:bg-error/10 disabled:opacity-50 transition-colors"
              title="Excluir selecionadas"
            >
              <Icon name="trash" className="h-3.5 w-3.5" /> Excluir
            </button>
          </div>
        ) : (
          <div className="border-b border-base-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">
            Conversas
          </div>
        )}

        {/* busca inline */}
        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5" style={{ borderColor: 'var(--border-input)', background: 'var(--surface-input)' }}>
            <Icon name="knowledge" className="h-3.5 w-3.5 shrink-0 text-base-content/40" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, empresa ou número…"
              className="flex-1 bg-transparent text-xs text-base-content outline-none placeholder:text-base-content/35"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-base-content/40 hover:text-base-content transition-colors" title="Limpar busca">
                <Icon name="close" className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* filtros rápidos */}
        {!loadingConvs && convs.length > 0 && (
          <ConversationStatusFilter
            active={activeFilter}
            onChange={setActiveFilter}
            counts={statusCounts}
          />
        )}

        {/* filtro por vendedor (só vendas) */}
        {scope === 'sales' && sellers.length > 0 && (
          <div className="border-b border-base-200 px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <Select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="!h-8 text-xs"
              title="Filtrar por vendedor"
            >
              <option value="">Todos os vendedores</option>
              <option value="__none__">Sem vendedor</option>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingConvs && <div className="p-3"><SkeletonList rows={5} /></div>}
          {!loadingConvs && convsError && (
            <div className="p-3 space-y-2">
              <div className="rounded bg-error/10 border border-error/20 p-3 text-xs text-error">
                <p className="font-semibold mb-1">Erro ao carregar conversas</p>
                <p className="opacity-80">{convsError}</p>
              </div>
              <button
                onClick={() => reloadConvs()}
                className="w-full rounded border border-base-300 px-3 py-1.5 text-xs hover:bg-base-200 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}
          {!loadingConvs && !convsError && convs.length === 0 && (
            <div className="p-3">
              <EmptyState icon={<Icon name="inbox" className="h-9 w-9" />} title="Nenhuma conversa" description="As conversas do WhatsApp aparecem aqui assim que um lead mandar mensagem." />
            </div>
          )}
          {!loadingConvs && filtered.length === 0 && convs.length > 0 && (
            <div className="p-4 text-center text-xs text-base-content/40">
              Nenhuma conversa com este filtro.
            </div>
          )}
          {!loadingConvs && groups.map((g) => {
            const c = g.rep;
            const stale = c.status === 'waiting_internal' && isWaitingInternalStale(c.lastActivityAt);
            const isSelected = selectedIds.has(c.id);
            const hasSelection = selectedIds.size > 0;
            return (
              <div
                key={g.key}
                className={[
                  'group/item relative border-b transition-colors',
                  active?.id === c.id ? 'bg-base-200' : 'hover:bg-base-100',
                  c.status === 'escalated' ? 'border-l-2 border-l-orange-400' : '',
                  isSelected ? 'bg-base-200' : '',
                ].join(' ')}
                style={{ borderColor: 'var(--border)' }}
              >
                {/* Checkbox — visível no hover ou quando há seleção ativa */}
                <div
                  className={[
                    'absolute left-1 top-1/2 -translate-y-1/2 z-10 transition-opacity',
                    hasSelection || isSelected ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100',
                  ].join(' ')}
                  onClick={(e) => toggleSelect(c.id, e)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="checkbox checkbox-xs cursor-pointer"
                  />
                </div>

                <button
                  onClick={() => openGroup(g)}
                  className="block w-full py-3 pr-2 text-left text-sm"
                  style={{ paddingLeft: hasSelection || isSelected ? '1.75rem' : '1rem' }}
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
                        <div className="flex shrink-0 items-center gap-1">
                          {stale && <span title="Aguardando equipe há +2h" className="inline-flex text-amber-500"><Icon name="alert" className="h-3.5 w-3.5" /></span>}
                          {/* Botões de ação individual — visíveis no hover */}
                          <div className="hidden items-center gap-0.5 group-hover/item:flex">
                            <button
                              onClick={(e) => archiveOne(c.id, e)}
                              title="Arquivar"
                              className="rounded p-1 text-base-content/40 hover:bg-base-300 hover:text-base-content transition-colors"
                            >
                              <Icon name="archive" className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => deleteOne(c.id, e)}
                              title="Excluir"
                              className="rounded p-1 text-base-content/40 hover:bg-error/10 hover:text-error transition-colors"
                            >
                              <Icon name="trash" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      {c.contact?.name && (
                        <div className="truncate text-[11px] text-base-content/50">{displayPhone(c.phone)}</div>
                      )}
                      {c.contact?.company && (
                        <div className="flex items-center gap-1 truncate text-[11px] text-base-content/60 font-medium">
                          <Icon name="building" className="h-3 w-3 shrink-0 text-base-content/40" />
                          {c.contact.company}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <ConversationStatusBadge status={c.status} lastActivityAt={c.lastActivityAt} />
                        {g.convs.length > 1 && (
                          <span title={`${g.convs.length} conversas com este contato`} className="inline-flex items-center gap-0.5 rounded-full bg-base-200 px-1.5 py-0.5 text-[10px] text-base-content/60">
                            <Icon name="inbox" className="h-3 w-3" /> {g.convs.length}
                          </span>
                        )}
                        {c.outcome && c.outcome !== c.status && <ConversationOutcomeBadge outcome={c.outcome} />}
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
                        {c.campaign && (
                          <span
                            title={`Veio da campanha: ${c.campaign.name}`}
                            className="inline-flex max-w-[120px] items-center gap-1 truncate rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                          >
                            <Icon name="campaigns" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{c.campaign.name}</span>
                          </span>
                        )}
                        {(c.contact?.tags ?? []).slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-base-200 px-1.5 py-0.5 text-[10px] text-base-content/60">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
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
                  {active.contact?.company && (
                    <span className="flex items-center gap-1 text-xs text-base-content/60 font-medium">
                      <Icon name="building" className="h-3.5 w-3.5 text-base-content/40" />
                      {active.contact.company}
                    </span>
                  )}
                </div>

                {/* campanha de origem da conversa */}
                {scope === 'sales' && active.campaign && (
                  <span
                    title={`Veio da campanha: ${active.campaign.name}`}
                    className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  >
                    <Icon name="campaigns" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{active.campaign.name}</span>
                  </span>
                )}

                {/* follow-up automático agendado (read-only) — só vendas */}
                {scope === 'sales' && activeFollowup && (
                  <span
                    title="Follow-up automático agendado pela Lia"
                    className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                  >
                    <Icon name="calendar" className="h-3.5 w-3.5" /> Follow-up {new Date(activeFollowup.nextRunAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}

                {/* status badge (tamanho md no header) */}
                <ConversationStatusBadge
                  status={active.status}
                  lastActivityAt={active.lastActivityAt}
                  size="md"
                />
                {active.outcome && active.outcome !== active.status && (
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
                    title={`Cliente TMS${tmsLookup.customer.plan ? ` · Plano: ${tmsLookup.customer.plan}` : ''}`}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700"
                  >
                    <Icon name="building" className="h-3 w-3" />
                    {tmsLookup.customer.name}
                    {tmsLookup.customer.plan && (
                      <span className="opacity-70">· {tmsLookup.customer.plan}</span>
                    )}
                  </span>
                )}
                {tmsLookup !== null && !tmsLookup.found && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-base-200 px-2.5 py-0.5 text-[11px] text-base-content/50">
                    Prospect
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
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

                {/* ADR 035: takeover humano — badge + devolver pra Lia */}
                {(active.humanTakeoverAt || active.status === 'escalated') && (
                  <>
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                      title="Você assumiu esta conversa — a Lia não responde sozinha aqui (só sugere rascunhos)"
                    >
                      <Icon name="users" className="h-3 w-3" /> Você no comando
                    </span>
                    <button
                      onClick={returnToAi}
                      className="rounded-md border border-base-300 px-2.5 py-1 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-100"
                      title="Liberar a conversa — a Lia volta a atender sozinha"
                    >
                      <span className="inline-flex items-center gap-1"><Icon name="bot" className="h-3.5 w-3.5" /> Devolver pra Lia</span>
                    </button>
                  </>
                )}

                {scope === 'sales' && (
                  <>
                    {/* vendedor responsável (reatribuir lead) */}
                    <span className="text-xs text-base-content/50">Vendedor:</span>
                    <Select
                      value={active.assignedSellerId ?? ''}
                      onChange={(e) => assignSeller(e.target.value || null)}
                      className="!h-8 !w-auto text-xs"
                      title="Reatribuir este lead a um vendedor"
                    >
                      <option value="">Sem vendedor</option>
                      {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </Select>

                    {/* F7: joga a conversa no funil quando a regra automática não pegou */}
                    <button
                      onClick={promoverParaOportunidade}
                      className="rounded-md border border-base-300 px-2.5 py-1 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-100"
                      title="Adicionar este lead ao funil de vendas (aparece em Minha fila)"
                    >
                      <span className="inline-flex items-center gap-1"><Icon name="dollar" className="h-3.5 w-3.5" /> Virar oportunidade</span>
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
                  </>
                )}

                {/* suporte: resolver / reabrir o chamado */}
                {scope === 'support' && (
                  <>
                    <button
                      onClick={() => resolveTicket(active.status !== 'closed')}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        active.status === 'closed'
                          ? 'border border-base-300 text-base-content/70 hover:bg-base-100'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Icon name={active.status === 'closed' ? 'undo' : 'check'} className="h-3.5 w-3.5" />
                        {active.status === 'closed' ? 'Reabrir' : 'Resolver'}
                      </span>
                    </button>

                    {/* Botão "Documentar no KB" — aparece em tickets escalados para fechar o feedback loop */}
                    {(active.status === 'escalated' || (active as any).rootCause) && (() => {
                      const kbTitle = (active as any).rootCause
                        ?? `Como resolver: ${active.ticketCategory ?? 'dúvida'}`;
                      const kbParams = new URLSearchParams({
                        title: kbTitle,
                        ...(active.ticketCategory ? { category: active.ticketCategory } : {}),
                      });
                      return (
                        <Link
                          to={`/knowledge?${kbParams}`}
                          className="inline-flex items-center gap-1 rounded-md border border-base-300 bg-base-100 px-2.5 py-1 text-xs font-medium text-base-content/70 transition-colors hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                          title="Documentar esta pergunta na Base de Conhecimento para a Lia aprender"
                        >
                          <Icon name="knowledge" className="h-3.5 w-3.5" /> + KB
                        </Link>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* tags livres do contato (mostrar + adicionar/remover) */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-base-200 bg-[var(--surface)] px-4 py-2">
              <span className="text-[11px] text-base-content/40">Tags:</span>
              {(active.contact?.tags ?? []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-base-200 px-2 py-0.5 text-[11px] text-base-content/70">
                  {t}
                  <button onClick={() => removeContactTag(t)} className="text-base-content/40 hover:text-red-500" title="Remover tag">
                    <Icon name="close" className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addContactTag(); } }}
                placeholder="+ tag"
                className="w-24 rounded-full border border-dashed border-base-300 bg-transparent px-2 py-0.5 text-[11px] text-base-content outline-none placeholder:text-base-content/40 focus:border-brand-500"
                title="Digite e Enter para criar/adicionar"
              />
            </div>

            <div className="flex flex-1 min-h-0">
              {/* mensagens */}
              <div
                ref={threadRef}
                className={`flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-4 ${showTimeline ? 'max-w-[calc(100%-260px)]' : ''}`}
              >
                {(() => {
                  const reversed = [...messages].reverse();
                  return reversed.map((m, i) => {
                    const showSeparator = i === 0 || dayKey(m.createdAt) !== dayKey(reversed[i - 1].createdAt);
                    return (
                      <Fragment key={m.id}>
                        {showSeparator && (
                          <div className="flex justify-center my-3">
                            <span className="rounded-full border border-base-200 bg-base-200 px-3 py-0.5 text-[10px] text-base-content/50">
                              {fmtDateSeparator(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className={`flex flex-col ${m.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                            m.direction === 'outbound'
                              ? 'rounded-tr-sm bg-brand-500 text-white'
                              : 'rounded-tl-sm border border-base-200 bg-[var(--surface)] text-base-content shadow-sm'
                          }`}>
                            {(m.metadata as any)?.audioUrl && (
                              <audio controls src={(m.metadata as any).audioUrl} className="mb-1 h-10 w-[320px] max-w-full rounded-lg" />
                            )}
                            <div className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{m.content}</div>
                            <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                              m.direction === 'outbound' ? 'text-white/60' : 'text-base-content/40'
                            }`}>
                              <span>{fmtMsgTime(m.createdAt)}</span>
                              {m.direction === 'outbound' && <Recibo ack={m.ack} />}
                            </div>
                          </div>
                          {/* badge IA vs Humano — exibido abaixo de toda mensagem outbound */}
                          {m.direction === 'outbound' && (
                            <span className="mt-0.5 text-[10px] text-base-content/35 select-none">
                              {(m.metadata as any)?.senderType === 'human' ? '👤 Você' : '✨ Lia'}
                            </span>
                          )}
                        </div>
                      </Fragment>
                    );
                  });
                })()}
              </div>

              {/* painel timeline */}
              {showTimeline && (
                <div className="w-64 shrink-0 border-l bg-[var(--surface)] overflow-y-auto p-4" style={{ borderColor: 'var(--border)' }}>
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

// Inbox de Vendas (rota /inbox) — conversas comerciais.
export function InboxPage() {
  return <ConversationInbox scope="sales" />;
}
