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
import { bulkTagContacts, getContactTickets, updateContact, type ContactTicket } from '@/entities/contact';
import { listSellersMini } from '@/entities/seller';
import {
  type Conversation,
  type Message,
  type SupportStats,
  listConversations,
  getSupportStats,
  getConversationMessages,
  sendMessage,
  updateInternalNote,
  deleteInternalNote,
  returnConversationToAi,
  setConversationOutcome,
  assignSeller as reassignSeller,
  assignAnalyst as reassignAnalyst,
  listAnalystsMini,
  setLinkedIssue as saveLinkedIssueApi,
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
import { TicketCategoryBadge } from '@/components/conversation/TicketCategoryBadge';
import { getPriorityConfig } from '@/shared/lib/ticket-category';

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

// Tempo decorrido desde lastActivityAt, compacto (ex: "4 min", "2h", "3d") —
// pro cronômetro de SLA no card do ticket na fila.
function fmtElapsed(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
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
  // F12: fila de suporte por dono do chamado — só usada quando scope === 'support'.
  const [queueFilter, setQueueFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  // F12: composer em modo "nota interna" — nunca sai pro cliente.
  const [isInternalMode, setIsInternalMode] = useState(false);
  // Etapa 2A: edição inline de nota interna já gravada.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  // F13: edição inline do link da issue de dev vinculada ao chamado.
  const [editingIssue, setEditingIssue] = useState(false);
  const [issueUrlInput, setIssueUrlInput] = useState('');
  // F16: edição inline de empresa/dono da conta + histórico de chamados do contato.
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyInput, setCompanyInput] = useState('');
  const [editingOwner, setEditingOwner] = useState(false);
  const [ownerInput, setOwnerInput] = useState('');
  const [contactTickets, setContactTickets] = useState<ContactTicket[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [liaBusy, setLiaBusy] = useState(false);
  const [liaInfo, setLiaInfo] = useState('');
  const [tmsLookup, setTmsLookup] = useState<TmsLookup | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  // Etapa 2B: total do servidor (a lista em si é uma página).
  const [totalConvs, setTotalConvs] = useState(0);
  const [stats, setStats] = useState<SupportStats | null>(null);
  // 2B: contagem dos chips vem do servidor — ver ConversationListResult.
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
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
  // F12: analistas do tenant (pra "Assumir chamado" / reatribuir no suporte)
  const { data: analysts = [] } = useQuery({
    queryKey: ['analysts-mini'],
    queryFn: listAnalystsMini,
    enabled: scope === 'support',
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
  // Item 1.2: mesma ideia pra conversa aberta. O handler de 'connect' é
  // registrado uma única vez (efeito com deps []), então ler `active` de dentro
  // dele pegaria sempre o valor da primeira renderização — o ref é o que
  // permite reentrar na sala CERTA depois de uma reconexão.
  const activeIdRef = useRef<string | null>(null);

  // Etapa 2B: a busca vai pro servidor, então não pode disparar a cada tecla.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  /**
   * Etapa 2B: filtros que o SERVIDOR aplica. Antes tudo isto era feito no
   * cliente sobre as 50 conversas já carregadas — o que significava filtrar
   * sobre uma amostra e chamar de fila.
   */
  const listParams = useMemo(
    () => ({
      scope,
      queue: scope === 'support' ? queueFilter : undefined,
      status: activeFilter,
      sellerId: scope === 'sales' ? sellerFilter || undefined : undefined,
      search: debouncedSearch,
      limit: 50,
    }),
    [scope, queueFilter, activeFilter, sellerFilter, debouncedSearch],
  );
  // Ref pro handler do socket, que é registrado uma vez só e não enxerga o
  // estado atual dos filtros (mesmo motivo do activeIdRef).
  const listParamsRef = useRef(listParams);
  useEffect(() => { listParamsRef.current = listParams; }, [listParams]);

  function reloadConvs(signal?: AbortSignal) {
    setLoadingConvs(true);
    setConvsError(null);
    listConversations(listParamsRef.current, signal)
      .then((r) => {
        setConvs(r.items);
        setTotalConvs(r.total ?? r.items.length);
        setStatusCounts(r.statusCounts ?? {});
      })
      .catch((e) => {
        if (e?.code === 'ERR_CANCELED') return;
        const msg = e?.response?.data?.message ?? e?.message ?? 'Erro ao carregar conversas';
        console.error('[InboxPage] listConversations falhou:', msg, e);
        setConvsError(msg);
      })
      .finally(() => setLoadingConvs(false));
  }

  // Rebusca sempre que um filtro muda — é o servidor que filtra agora.
  useEffect(() => {
    const controller = new AbortController();
    listParamsRef.current = listParams;
    reloadConvs(controller.signal);
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listParams]);

  // Etapa 2B: contagens do painel vêm do banco inteiro, não da página.
  // Sem isto os 3 cards contariam só o que coube na lista — número errado
  // com cara de número certo, que é pior do que não mostrar nada.
  function reloadStats(signal?: AbortSignal) {
    if (scope !== 'support') return;
    getSupportStats(signal)
      .then(setStats)
      .catch((e) => { if (e?.code !== 'ERR_CANCELED') console.error('[InboxPage] stats falhou:', e?.message); });
  }

  useEffect(() => {
    const controller = new AbortController();
    reloadStats(controller.signal);
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Item 1.2: mantém o ref da conversa aberta em dia pro handler de reconexão.
  useEffect(() => {
    activeIdRef.current = active?.id ?? null;
  }, [active?.id]);

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
    // Etapa 2A: nota interna editada/removida por outro analista. Chega só pela
    // sala de staff. Sem isto, um colega com a mesma conversa aberta seguiria
    // vendo a nota antiga — e no caso da exclusão (dado sensível colado por
    // engano) o dado continuaria na tela dele até recarregar.
    s.on('message:updated', (msg: Message) =>
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, content: msg.content } : m))),
    );
    s.on('message:deleted', (d: { id: string }) =>
      setMessages((prev) => prev.filter((m) => m.id !== d.id)),
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
      // Item 1.2 (auditoria 2026-08-06): reentra também na sala da conversa
      // aberta. Sem isto, qualquer reconexão (queda de rede, notebook suspenso,
      // redeploy do backend) deixava o analista com o chamado na tela mas FORA
      // de conv:<id> e staff:conv:<id> — a lista lateral voltava a atualizar,
      // dando a impressão de que estava tudo certo, enquanto as mensagens
      // daquela conversa (inclusive notas internas) simplesmente paravam de
      // chegar. Falha silenciosa, que é o pior tipo.
      const conversationId = activeIdRef.current;
      if (conversationId) {
        s.emit('join', { conversationId });
        // O socket ficou fora da sala durante a queda: rebusca o histórico pra
        // recuperar o que foi dito nesse intervalo, senão a conversa fica com
        // um buraco silencioso no meio.
        getConversationMessages(conversationId)
          .then(setMessages)
          .catch(() => undefined);
      }
    });
    return () => { s.close(); socketRef.current = null; };
  }, []);

  // Ancora no fim da conversa (mensagem mais recente), como no WhatsApp —
  // ao abrir a conversa e a cada mensagem nova (enviada ou recebida).
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
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

  // 2B: usado para distinguir "não achei nada com este filtro" de "não há
  // conversa nenhuma" — os dois viram lista vazia depois que a filtragem saiu
  // do cliente.
  const hasActiveFilter =
    activeFilter !== 'all' ||
    (scope === 'support' && queueFilter !== 'all') ||
    !!sellerFilter ||
    !!debouncedSearch.trim();

  // Etapa 2B: escopo, status, fila, vendedor e busca agora vêm filtrados do
  // servidor (ver listParams). Aqui sobra só a ordenação de exibição, aplicada
  // sobre a página recebida: o backend ordena por atividade, e este sort põe
  // os escalados no topo — algo que o Prisma não expressa sem SQL cru.
  //
  // Limitação conhecida e deliberada: "escalado primeiro" vale DENTRO da
  // página. Com mais de 50 chamados, um escalado muito parado pode cair na
  // página seguinte. Quem cobre esse caso é o card "Escalados sem Dono", que
  // conta o banco inteiro.
  const filtered = [...convs].sort((a, b) => {
    if (a.status === 'escalated' && b.status !== 'escalated') return -1;
    if (b.status === 'escalated' && a.status !== 'escalated') return 1;
    const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
    const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
    return tb - ta;
  });

  // Agrupa por contato (estilo WhatsApp): 1 card por pessoa, a conversa mais
  // recente como representante. `filtered` já vem ordenado (mais recente 1º), então
  // a 1ª ocorrência de cada contato é o representante. Mantém as conversas por baixo.
  // O agrupamento é por página — duas conversas do mesmo contato em páginas
  // diferentes viram dois cards. Aceitável enquanto a paginação for de 50.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; rep: Conversation; convs: Conversation[] }>();
    for (const c of filtered) {
      const key = c.contact?.id ?? c.phone;
      const g = map.get(key);
      if (g) g.convs.push(c);
      else map.set(key, { key, rep: c, convs: [c] });
    }
    return Array.from(map.values());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs]);

  // Dashboard operacional — números do SERVIDOR (GET /conversations/stats),
  // não da página carregada. Antes eram contados sobre `convs`, então mudavam
  // conforme o filtro do analista e não conforme a fila real.
  const supportDashboard = useMemo(() => {
    if (scope !== 'support' || !stats) return null;
    return {
      escaladosSemDono: stats.escaladosSemDono,
      emAtendimento: stats.emAtendimento,
      // "Aguardando Dev" é waiting_internal de forma geral — a categoria não é
      // exclusiva de engenharia, mas é a aproximação mais próxima sem um
      // status dedicado.
      aguardandoDev: stats.aguardandoDev,
      semDonoMaisAntigos: stats.maisAntigosSemDono,
    };
  }, [stats, scope]);

  // Assume o chamado E já abre — usado pela lista "Assumir" do dashboard,
  // onde não existe `active` ainda (nenhuma conversa selecionada).
  async function quickAssumeAndOpen(c: Conversation) {
    try {
      // Item 1.4: esta lista só mostra chamado SEM dono — é exatamente essa
      // premissa que vai como precondição pro backend.
      const r = await reassignAnalyst(c.id, user?.id ?? null, { expectedAnalystId: null });
      const updated: Conversation = {
        ...c,
        assignedAnalyst: r?.assignedAnalyst ?? null,
        assignedAnalystId: r?.assignedAnalystId ?? null,
      };
      setConvs((cs) => cs.map((x) => (x.id === c.id ? updated : x)));
      openGroup({ rep: updated, convs: [{ id: c.id }] });
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao assumir chamado.');
      reloadConvs(); // outro analista chegou antes — atualiza a fila
    }
  }

  function openGroup(g: { rep: Conversation; convs: { id: string }[] }) {
    const c = g.rep;
    setActive(c);
    setTmsLookup(null);
    setShowTimeline(false);
    setIsInternalMode(false); // F12: nunca herda o modo nota-interna da conversa anterior
    setEditingIssue(false); // F13: idem pro editor de issue de dev
    setEditingCompany(false); // F16: idem pros editores de empresa/dono da conta
    setEditingOwner(false);
    setContactTickets([]);
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
    // F16: histórico de chamados deste contato — painel do Inbox.
    if (c.contact?.id) {
      getContactTickets(c.contact.id).then(setContactTickets).catch(() => setContactTickets([]));
    }
  }

  // F16: abre um chamado do histórico do contato no meio da tela. O item pode não
  // estar na página atual de `convs` (lista principal carrega só as mais recentes)
  // — nesse caso rebusca a lista completa uma vez antes de desistir.
  async function openTicketById(ticketId: string) {
    const found = convs.find((c) => c.id === ticketId);
    if (found) {
      openGroup({ rep: found, convs: [{ id: found.id }] });
      return;
    }
    try {
      const r = await listConversations();
      setConvs(r.items);
      const refetched = r.items.find((c) => c.id === ticketId);
      if (refetched) {
        openGroup({ rep: refetched, convs: [{ id: refetched.id }] });
      } else {
        toast.error('Chamado não encontrado na lista atual.');
      }
    } catch {
      toast.error('Erro ao abrir o chamado.');
    }
  }

  async function send() {
    if (!active || !text.trim()) return;
    await sendMessage(active.id, text, isInternalMode);
    // ADR 035: a primeira resposta humana ativa o takeover no backend — reflete
    // aqui sem esperar o próximo fetch (badge "Você no comando" aparece na hora).
    // F12: nota interna não é resposta ao cliente — não ativa takeover.
    if (!isInternalMode && !active.humanTakeoverAt) {
      const takenAt = new Date().toISOString();
      setActive((a) => (a ? { ...a, humanTakeoverAt: takenAt } : a));
      setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, humanTakeoverAt: takenAt } : c)));
    }
    setText('');
    setLiaInfo('');
  }

  /**
   * Etapa 2A: quem pode mexer numa nota interna já gravada. Espelha a regra do
   * backend (autor, ou admin) — aqui é só para não OFERECER um botão que vai
   * tomar 403; a decisão que vale é a do servidor.
   */
  function canEditNote(m: Message): boolean {
    if (!m.isInternal) return false;
    return m.authorUserId === user?.id || user?.role === 'admin';
  }

  async function saveNoteEdit(messageId: string) {
    const content = noteDraft.trim();
    if (!content) return;
    try {
      const updated = await updateInternalNote(messageId, content);
      setMessages((ms) => ms.map((m) => (m.id === messageId ? { ...m, content: updated.content } : m)));
      setEditingNoteId(null);
      setNoteDraft('');
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Erro ao editar a nota.');
    }
  }

  async function removeNote(messageId: string) {
    const ok = await confirm({
      title: 'Excluir nota interna',
      // Sem meio-termo: o backend apaga a linha de verdade (é o ponto — o caso
      // de uso é dado sensível colado por engano). O texto fica só no audit log.
      message: 'A nota é apagada definitivamente. Só o registro de auditoria guarda o conteúdo.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteInternalNote(messageId);
      setMessages((ms) => ms.filter((m) => m.id !== messageId));
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Erro ao excluir a nota.');
    }
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

  // F12: assume (userId = eu) ou reatribui (userId = outro analista) o chamado
  // de suporte; userId=null devolve pra fila geral sem dono.
  // `opts.expectedAnalystId` liga a trava de concorrência (item 1.4): quem
  // ASSUME manda o dono que a tela está mostrando; quem TRANSFERE pelo seletor
  // omite (é ação deliberada em cima do dono atual, já visível na tela).
  async function assignAnalyst(userId: string | null, opts: { expectedAnalystId?: string | null } = {}) {
    if (!active) return;
    try {
      const r = await reassignAnalyst(active.id, userId, opts);
      const assignedAnalyst = r?.assignedAnalyst ?? null;
      const assignedAnalystId = r?.assignedAnalystId ?? null;
      setActive((a) => (a ? { ...a, assignedAnalyst, assignedAnalystId } : a));
      setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, assignedAnalyst, assignedAnalystId } : c)));
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao atribuir o chamado.');
      // 409 (alguém assumiu antes) ou qualquer outra falha: o servidor é a
      // verdade. Resincroniza para a tela parar de mostrar um dono que não é o real.
      reloadConvs();
    }
  }

  // F13: vincula/remove o link da issue de dev — vincular move o chamado pra
  // waiting_internal no backend (só se ainda não estava fechado/opt-out).
  async function saveLinkedIssue(url: string | null) {
    if (!active) return;
    try {
      const r = await saveLinkedIssueApi(active.id, url);
      const linkedIssueUrl = r?.linkedIssueUrl ?? null;
      const status = r?.status ?? active.status;
      setActive((a) => (a ? { ...a, linkedIssueUrl, status } : a));
      setConvs((cs) => cs.map((c) => (c.id === active.id ? { ...c, linkedIssueUrl, status } : c)));
      setEditingIssue(false);
      setIssueUrlInput('');
    } catch {
      toast.error('Link inválido — precisa ser uma URL http(s).');
    }
  }

  // F16: edita empresa/dono da conta direto no painel — sem sair do atendimento
  // nem passar pela tela /contacts. `contact.id` sempre existe aqui porque o
  // bloco só é renderizado quando `active.contact` está presente.
  async function saveContactField(field: 'company' | 'accountOwner', value: string) {
    if (!active?.contact?.id) return;
    const clean = value.trim() || undefined;
    try {
      const updated = await updateContact(active.contact.id, { [field]: clean });
      setActive((a) => (a && a.contact ? { ...a, contact: { ...a.contact, [field]: updated[field] ?? null } } : a));
      setConvs((cs) => cs.map((c) => (c.contact?.id === active.contact?.id ? { ...c, contact: { ...c.contact!, [field]: updated[field] ?? null } } : c)));
    } catch {
      toast.error('Erro ao salvar — tente de novo.');
    }
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

        {/* F12: fila de suporte — Fila Geral / Meus Chamados / Todos (só suporte) */}
        {scope === 'support' && (
          <div className="flex flex-wrap gap-1 border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            {([
              ['all', 'Todos'],
              ['unassigned', 'Fila Geral (sem dono)'],
              ['mine', 'Meus Chamados'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setQueueFilter(key)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  queueFilter === key
                    ? 'bg-brand-600 text-white'
                    : 'bg-base-200 text-base-content/60 hover:bg-base-300 hover:text-base-content'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
          {/* 2B: com a filtragem no servidor, lista vazia COM filtro ativo e
              lista vazia SEM filtro são estados diferentes — antes dava pra
              distinguir comparando `filtered` com `convs`, que agora são a
              mesma coisa. Sem esta distinção, filtrar e não achar nada exibiria
              "as conversas aparecem aqui quando um lead mandar mensagem". */}
          {!loadingConvs && !convsError && convs.length === 0 && (
            hasActiveFilter ? (
              <div className="p-4 text-center text-xs text-base-content/40">
                Nenhuma conversa com este filtro.
              </div>
            ) : (
              <div className="p-3">
                <EmptyState icon={<Icon name="inbox" className="h-9 w-9" />} title="Nenhuma conversa" description="As conversas do WhatsApp aparecem aqui assim que um lead mandar mensagem." />
              </div>
            )
          )}
          {/* Avisa que a fila é maior que a página. O bug de origem do 2B era
              justamente cortar em 50 sem dizer nada — o analista não tinha como
              saber que existia chamado além do que estava vendo. */}
          {!loadingConvs && totalConvs > convs.length && (
            <div className="border-t border-base-200 px-3 py-2 text-center text-[11px] text-base-content/40">
              Mostrando {convs.length} de {totalConvs} — refine a busca ou o filtro para ver o resto.
            </div>
          )}
          {!loadingConvs && groups.map((g) => {
            const c = g.rep;
            const stale = c.status === 'waiting_internal' && isWaitingInternalStale(c.lastActivityAt);
            const isSelected = selectedIds.has(c.id);
            const hasSelection = selectedIds.size > 0;
            // Card de ticket: borda de gravidade — escalada sempre vence (é o
            // sinal mais forte), senão a prioridade do ticket (crítica=vermelho
            // até baixa=verde), senão neutro (sem categoria/vendas).
            const priCfg = scope === 'support' ? getPriorityConfig(c.ticketPriority) : null;
            const severityBorder = c.status === 'escalated'
              ? 'border-l-orange-500'
              : priCfg?.borderColor ?? 'border-l-transparent';
            return (
              <div
                key={g.key}
                className={[
                  'group/item relative border-b border-l-4 transition-colors',
                  active?.id === c.id ? 'bg-base-200' : 'hover:bg-base-100',
                  severityBorder,
                  isSelected ? 'bg-base-200' : '',
                ].join(' ')}
                // Só a borda de BAIXO usa a cor neutra do tema — a borda ESQUERDA
                // (gravidade) precisa ficar livre pra classe Tailwind colorir,
                // senão `borderColor` no style vence por especificidade e apaga
                // a cor de severidade.
                style={{ borderBottomColor: 'var(--border)' }}
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

                {/* F14 fix: era <button>, mas continha os botões de Arquivar/Excluir
                    dentro — <button> dentro de <button> é HTML inválido
                    (validateDOMNesting warning) e o navegador reestrutura o DOM
                    por baixo dos panos de um jeito imprevisível. div com role
                    de botão + teclado preserva a acessibilidade sem aninhar. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openGroup(g)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGroup(g); } }}
                  className="block w-full cursor-pointer py-3 pr-2 text-left text-sm"
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
                        {/* Cronômetro de SLA — quanto tempo o chamado está parado */}
                        {scope === 'support' && c.status !== 'closed' && c.status !== 'opt_out' && (
                          <span
                            title="Tempo desde a última atividade"
                            className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${stale || c.status === 'escalated' ? 'text-red-500' : 'text-base-content/40'}`}
                          >
                            ⏱️ {fmtElapsed(c.lastActivityAt)}
                          </span>
                        )}
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
                        {/* F12: trava de colisão visual — quem está com este chamado, direto na lista.
                            Pinado à direita da linha (ml-auto) pra ler como "canto do card". */}
                        {scope === 'support' && c.status !== 'closed' && c.status !== 'opt_out' && (
                          c.assignedAnalystId ? (
                            <span
                              title="Quem está atendendo este chamado"
                              className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                            >
                              <Icon name="users" className="h-3 w-3" />
                              {c.assignedAnalystId === user?.id ? 'Você' : (c.assignedAnalyst?.name ?? 'Analista')}
                            </span>
                          ) : (
                            <span
                              title="Ninguém assumiu este chamado ainda"
                              className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                            >
                              Sem Dono
                            </span>
                          )
                        )}
                        {/* F13: chamado com issue de dev vinculada — bate o olho na lista */}
                        {scope === 'support' && c.linkedIssueUrl && (
                          <span
                            title={`Issue vinculada: ${c.linkedIssueUrl}`}
                            className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                          >
                            🔗 dev
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
                </div>
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
          scope === 'support' && supportDashboard ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-3xl">
                <h2 className="mb-1 text-lg font-bold text-base-content">Central de Operações — Suporte</h2>
                <p className="mb-5 text-xs text-base-content/50">
                  Selecione um chamado na fila ao lado, ou assuma um dos mais urgentes abaixo.
                </p>

                <div className="mb-6 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
                    <div className="text-2xl font-bold text-red-600">{supportDashboard.escaladosSemDono}</div>
                    <div className="mt-0.5 text-xs font-medium text-red-700 dark:text-red-400">🔴 Escalados sem Dono</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="text-2xl font-bold text-amber-600">{supportDashboard.emAtendimento}</div>
                    <div className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">🟡 Em Atendimento</div>
                  </div>
                  <div
                    className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/20 dark:bg-violet-500/10"
                    title='"Aguardando Interno" é qualquer ação da equipe (não só dev) — HiperTMS não distingue isso ainda'
                  >
                    <div className="text-2xl font-bold text-violet-600">{supportDashboard.aguardandoDev}</div>
                    <div className="mt-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">🟣 Aguardando Interno/Dev</div>
                  </div>
                </div>

                <div className="rounded-xl border border-base-200">
                  <div className="border-b border-base-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">
                    Chamados sem dono — mais antigos primeiro
                  </div>
                  {supportDashboard.semDonoMaisAntigos.length === 0 ? (
                    <div className="p-6 text-center text-xs text-base-content/40">
                      Nenhum chamado sem dono agora — fila geral limpa. 🎉
                    </div>
                  ) : (
                    <div className="divide-y divide-base-200">
                      {supportDashboard.semDonoMaisAntigos.map((c) => (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-base-content">
                              {c.contact?.name || displayPhone(c.phone)}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-base-content/50">
                              {c.contact?.company && <span className="truncate">{c.contact.company}</span>}
                              <span>⏱️ {fmtElapsed(c.lastActivityAt)}</span>
                            </div>
                          </div>
                          {(c.ticketCategory || c.ticketPriority) && (
                            <TicketCategoryBadge category={c.ticketCategory} priority={c.ticketPriority} compact />
                          )}
                          <button
                            onClick={() => quickAssumeAndOpen(c)}
                            className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
                          >
                            Assumir
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-base-content/40">
              Selecione uma conversa
            </div>
          )
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

                {/* F14: dono do chamado, resumo da IA e link de dev saíram do header
                    e viraram o Painel do Cliente & TMS (coluna da direita) — o
                    header ficava lotado e essa informação é mais útil como
                    contexto persistente ao lado do chat, não misturada com o
                    resto dos badges. Ver <aside> logo após </main>. */}

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
                  // `messages` já vem em ordem cronológica ascendente (mais antiga
                  // primeiro — ver openGroup) — renderiza direto, sem inverter,
                  // pra ficar mais antiga em cima / mais recente embaixo (WhatsApp).
                  return messages.map((m, i) => {
                    const showSeparator = i === 0 || dayKey(m.createdAt) !== dayKey(messages[i - 1].createdAt);
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
                            m.isInternal
                              ? 'rounded-tr-sm border border-amber-300 bg-amber-50 text-amber-900'
                              : m.direction === 'outbound'
                                ? 'rounded-tr-sm bg-brand-500 text-white'
                                : 'rounded-tl-sm border border-base-200 bg-[var(--surface)] text-base-content shadow-sm'
                          }`}>
                            {(m.metadata as any)?.audioUrl && (
                              <audio controls src={(m.metadata as any).audioUrl} className="mb-1 h-10 w-[320px] max-w-full rounded-lg" />
                            )}
                            {editingNoteId === m.id ? (
                              // Etapa 2A: edição inline da nota, sem modal — o
                              // analista não perde a conversa de vista.
                              <div className="space-y-1.5">
                                <textarea
                                  autoFocus
                                  rows={3}
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') { setEditingNoteId(null); setNoteDraft(''); }
                                    // Enter quebra linha (nota é texto livre); Ctrl/Cmd+Enter salva.
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNoteEdit(m.id);
                                  }}
                                  className="w-full rounded-lg border border-amber-300 bg-white/70 px-2 py-1 text-sm text-amber-900 outline-none focus:border-amber-500"
                                />
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => saveNoteEdit(m.id)}
                                    className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    onClick={() => { setEditingNoteId(null); setNoteDraft(''); }}
                                    className="rounded-full border border-amber-300 px-2.5 py-1 text-[11px] text-amber-800 hover:bg-amber-100"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{m.content}</div>
                            )}
                            <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                              m.isInternal ? 'text-amber-700/70' : m.direction === 'outbound' ? 'text-white/60' : 'text-base-content/40'
                            }`}>
                              <span>{fmtMsgTime(m.createdAt)}</span>
                              {!m.isInternal && m.direction === 'outbound' && <Recibo ack={m.ack} />}
                            </div>
                          </div>
                          {/* badge IA vs Humano vs Nota interna — exibido abaixo de toda mensagem outbound */}
                          {m.direction === 'outbound' && (
                            <span className="mt-0.5 flex items-center gap-2 text-[10px] text-base-content/35 select-none">
                              {m.isInternal ? '🔒 Nota interna — só a equipe vê' : (m.metadata as any)?.senderType === 'human' ? '👤 Você' : '✨ Lia'}
                              {/* Etapa 2A: só aparece pra quem o backend vai deixar
                                  mexer (autor ou admin) — não oferece botão que dá 403. */}
                              {canEditNote(m) && editingNoteId !== m.id && (
                                <>
                                  <button
                                    onClick={() => { setEditingNoteId(m.id); setNoteDraft(m.content); }}
                                    className="text-amber-700/60 hover:text-amber-800 hover:underline"
                                  >
                                    editar
                                  </button>
                                  <button
                                    onClick={() => removeNote(m.id)}
                                    className="text-amber-700/60 hover:text-red-600 hover:underline"
                                  >
                                    excluir
                                  </button>
                                </>
                              )}
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
              {/* F12: toggle Responder Cliente vs Nota Interna — só no suporte */}
              {scope === 'support' && (
                <div className="mb-2 flex gap-1">
                  <button
                    onClick={() => setIsInternalMode(false)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      !isInternalMode ? 'bg-brand-600 text-white' : 'bg-base-200 text-base-content/60 hover:bg-base-300'
                    }`}
                  >
                    Responder Cliente
                  </button>
                  <button
                    onClick={() => setIsInternalMode(true)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      isInternalMode ? 'bg-amber-500 text-white' : 'bg-base-200 text-base-content/60 hover:bg-base-300'
                    }`}
                    title="Visível só pra equipe — nunca vai pro cliente"
                  >
                    🔒 Nota Interna (Privado)
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                {!isInternalMode && (
                  <button
                    onClick={suggest}
                    disabled={liaBusy}
                    title="Sugerir resposta com a Lia"
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500 disabled:opacity-50"
                  >
                    {liaBusy ? '...' : <><Icon name="bot" className="h-4 w-4" /> Lia</>}
                  </button>
                )}
                <input
                  className={`flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:ring-2 ${
                    isInternalMode ? 'focus:ring-amber-500/30 focus:border-amber-500' : 'focus:ring-brand-500/30 focus:border-brand-500'
                  }`}
                  style={
                    isInternalMode
                      ? { borderColor: '#fcd34d', background: '#fffbeb', color: 'var(--text-primary)' }
                      : { borderColor: 'var(--border-input)', background: 'var(--surface-input)', color: 'var(--text-primary)' }
                  }
                  placeholder={isInternalMode ? 'Nota interna — só a equipe vê...' : 'Digite uma mensagem...'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button
                  onClick={send}
                  className={`rounded-full px-5 py-2 text-sm text-white ${
                    isInternalMode ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-600 hover:bg-brand-700'
                  }`}
                >
                  {isInternalMode ? 'Salvar nota' : 'Enviar'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ── F14: Painel do Cliente & TMS (coluna da direita, só suporte) ──
          Reúne o que era espalhado no header (dono do chamado), no corpo do
          chat (resumo da IA, link de dev) num painel de contexto persistente
          — o analista não perde essa informação rolando a conversa pra cima. */}
      {scope === 'support' && active && (
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-base-200 bg-[var(--surface)]">
          <div className="border-b border-base-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">
            Painel do Cliente &amp; TMS
          </div>

          {/* Card do Cliente */}
          <div className="space-y-2 border-b border-base-200 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-semibold text-brand-600">
                {(active.contact?.name
                  ? active.contact.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('')
                  : displayPhone(active.phone).slice(0, 2)
                ).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-base-content">
                  {active.contact?.name || displayPhone(active.phone)}
                </div>
                <div className="truncate text-[11px] text-base-content/50">{displayPhone(active.phone)}</div>
              </div>
            </div>
            {tmsLookup?.customer?.email && (
              <div className="flex items-center gap-1.5 text-xs text-base-content/70">
                <Icon name="mail" className="h-3.5 w-3.5 shrink-0 text-base-content/40" />
                <span className="truncate">{tmsLookup.customer.email}</span>
              </div>
            )}
            {/* CNPJ ainda não vem no token do widget (gap do lado do TMS, não
                documentado formalmente — mostrado como placeholder honesto em
                vez de omitir: deixa visível que o dado existe como conceito). */}
            <div className="flex items-center gap-1.5 text-xs text-base-content/35" title="O token do widget do TMS ainda não envia CNPJ">
              <Icon name="building" className="h-3.5 w-3.5 shrink-0" />
              CNPJ — não disponível ainda
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {tmsLookup === null && (
                <span className="rounded-full bg-base-200 px-2 py-0.5 text-[11px] text-base-content/40">verificando TMS…</span>
              )}
              {tmsLookup?.found && tmsLookup.customer && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Cliente ativo{tmsLookup.customer.plan ? ` · ${tmsLookup.customer.plan}` : ''}
                </span>
              )}
              {tmsLookup !== null && !tmsLookup.found && (
                <span className="inline-flex items-center gap-1 rounded-full bg-base-200 px-2 py-0.5 text-[11px] text-base-content/50">
                  Prospect
                </span>
              )}
            </div>
          </div>

          {/* F16: Sobre este contato — edição inline, sem sair do atendimento
              (substitui a necessidade de ir em /contatos pra editar empresa/dono). */}
          <div className="space-y-2.5 border-b border-base-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-base-content/50">
              Sobre este contato
            </div>

            {/* Empresa */}
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-base-content/40">Empresa</div>
              {editingCompany ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={companyInput}
                    onChange={(e) => setCompanyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveContactField('company', companyInput).then(() => setEditingCompany(false));
                      if (e.key === 'Escape') setEditingCompany(false);
                    }}
                    className="w-full rounded-full border border-dashed border-base-300 bg-transparent px-2.5 py-1 text-xs text-base-content outline-none focus:border-brand-500"
                  />
                  <button
                    onClick={() => saveContactField('company', companyInput).then(() => setEditingCompany(false))}
                    className="shrink-0 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setCompanyInput(active.contact?.company ?? ''); setEditingCompany(true); }}
                  className="group/edit flex w-full items-center justify-between gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs text-base-content hover:bg-base-100"
                >
                  <span className="truncate">{active.contact?.company || <span className="text-base-content/35">Adicionar empresa</span>}</span>
                  <Icon name="edit" className="h-3 w-3 shrink-0 text-base-content/0 group-hover/edit:text-base-content/40" />
                </button>
              )}
            </div>

            {/* Dono da conta — manual, não vem do TMS */}
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-base-content/40">Dono da conta</div>
              {editingOwner ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={ownerInput}
                    onChange={(e) => setOwnerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveContactField('accountOwner', ownerInput).then(() => setEditingOwner(false));
                      if (e.key === 'Escape') setEditingOwner(false);
                    }}
                    className="w-full rounded-full border border-dashed border-base-300 bg-transparent px-2.5 py-1 text-xs text-base-content outline-none focus:border-brand-500"
                  />
                  <button
                    onClick={() => saveContactField('accountOwner', ownerInput).then(() => setEditingOwner(false))}
                    className="shrink-0 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setOwnerInput(active.contact?.accountOwner ?? ''); setEditingOwner(true); }}
                  className="group/edit flex w-full items-center justify-between gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs text-base-content hover:bg-base-100"
                >
                  <span className="truncate">{active.contact?.accountOwner || <span className="text-base-content/35">Adicionar dono da conta</span>}</span>
                  <Icon name="edit" className="h-3 w-3 shrink-0 text-base-content/0 group-hover/edit:text-base-content/40" />
                </button>
              )}
            </div>
          </div>

          {/* F16: Histórico de chamados deste contato — clicável, abre no meio da tela. */}
          {contactTickets.length > 0 && (
            <div className="border-b border-base-200 p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">
                Histórico de chamados
              </div>
              <div className="space-y-1">
                {contactTickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTicketById(t.id)}
                    disabled={t.id === active.id}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left text-xs hover:bg-base-100 disabled:bg-base-100 disabled:cursor-default"
                  >
                    <span className="truncate text-base-content/70">
                      {t.ticketNumber ? `#${t.ticketNumber}` : '—'} {t.ticketCategory ? `· ${t.ticketCategory}` : ''}
                    </span>
                    <ConversationStatusBadge status={t.status} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resumo da IA — F10 */}
          {active.status === 'escalated' && active.escalationSummary && (
            <div className="border-b border-base-200 bg-amber-50 p-4 dark:bg-amber-500/10">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                <Icon name="knowledge" className="h-3.5 w-3.5" /> Resumo da IA
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                {active.escalationSummary}
              </pre>
            </div>
          )}

          {/* Card de Engenharia / Dev — F13 */}
          <div className="border-b border-base-200 p-4">
            <div className="mb-2 flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">
                <Icon name="bot" className="h-3.5 w-3.5" /> Engenharia / Dev
              </span>
              {active.status === 'waiting_internal' && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  Aguardando Interno
                </span>
              )}
            </div>
            {editingIssue ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  value={issueUrlInput}
                  onChange={(e) => setIssueUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveLinkedIssue(issueUrlInput.trim() || null)}
                  placeholder="https://jira.../BUG-123..."
                  className="w-full rounded-full border border-dashed border-base-300 bg-transparent px-2.5 py-1 text-[11px] text-base-content outline-none placeholder:text-base-content/40 focus:border-brand-500"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => saveLinkedIssue(issueUrlInput.trim() || null)}
                    className="flex-1 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => { setEditingIssue(false); setIssueUrlInput(''); }}
                    className="rounded-full border border-base-300 px-2.5 py-1 text-[11px] text-base-content/60 hover:bg-base-100"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : active.linkedIssueUrl ? (
              <div className="space-y-1.5">
                <a
                  href={active.linkedIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 truncate rounded-lg bg-violet-100 px-2.5 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-300"
                  title={active.linkedIssueUrl}
                >
                  🔗 <span className="truncate">{active.linkedIssueUrl}</span>
                </a>
                <div className="flex gap-2 text-[11px]">
                  <button
                    onClick={() => { setIssueUrlInput(active.linkedIssueUrl ?? ''); setEditingIssue(true); }}
                    className="flex items-center gap-1 text-base-content/50 hover:text-base-content"
                  >
                    <Icon name="edit" className="h-3 w-3" /> Editar
                  </button>
                  <button
                    onClick={() => saveLinkedIssue(null)}
                    className="flex items-center gap-1 text-base-content/50 hover:text-red-500"
                  >
                    <Icon name="close" className="h-3 w-3" /> Remover
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setIssueUrlInput(''); setEditingIssue(true); }}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-base-300 py-2 text-[11px] text-base-content/50 hover:border-brand-500 hover:text-brand-600"
              >
                <Icon name="plus" className="h-3.5 w-3.5" /> Vincular issue (Jira/GitHub/ClickUp)
              </button>
            )}
          </div>

          {/* Ações Rápidas */}
          <div className="space-y-2 p-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">
              Ações Rápidas
            </div>
            {active.assignedAnalystId ? (
              <div className="flex items-center gap-1.5 rounded-lg bg-base-200 px-3 py-2 text-xs font-medium text-base-content/70">
                <Icon name="users" className="h-3.5 w-3.5 shrink-0" />
                {active.assignedAnalystId === user?.id
                  ? 'Você está com este chamado'
                  : `Com ${active.assignedAnalyst?.name ?? 'outro analista'}`}
              </div>
            ) : (
              <button
                // Item 1.4: este botão só existe quando a tela vê o chamado sem
                // dono — é essa premissa que vira precondição no backend.
                onClick={() => assignAnalyst(user?.id ?? null, { expectedAnalystId: null })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Icon name="check" className="h-4 w-4" /> Assumir Chamado
              </button>
            )}
            <Select
              value={active.assignedAnalystId ?? ''}
              onChange={(e) => assignAnalyst(e.target.value || null)}
              className="!h-9 w-full text-xs"
              title="Transferir para outro analista"
            >
              <option value="">Sem dono</option>
              {analysts.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.id}</option>)}
            </Select>
          </div>
        </aside>
      )}
    </div>
  );
}

// Inbox de Vendas (rota /inbox) — conversas comerciais.
export function InboxPage() {
  return <ConversationInbox scope="sales" />;
}
