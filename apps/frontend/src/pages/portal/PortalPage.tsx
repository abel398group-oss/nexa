import { useCallback, useEffect, useRef, useState } from 'react';
import {
  portalApi,
  type PortalMe,
  type PortalTicketSummary,
  type PortalTicketDetail,
} from '@/lib/portalApi';
import { Button, Card, Input, Select, Textarea, Icon } from '@/shared/ui';

// Áreas/módulos do HiperTMS — o cliente escolhe onde está o problema.
const AREAS = [
  'Embarques', 'Cargas', 'Viagens', 'CT-e', 'MDF-e', 'NFe XML', 'Cotações',
  'Oportunidades', 'Cadastros', 'Frota', 'Compras', 'Financeiro', 'Precificação',
  'Usuários', 'Sistema', 'Outro',
];

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Aberto', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  waiting_customer: { label: 'Aguardando você', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  waiting_internal: { label: 'Em análise', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  escalated: { label: 'Com o suporte', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  closed: { label: 'Resolvido', cls: 'bg-base-200 text-base-content/60' },
  opt_out: { label: 'Encerrado', cls: 'bg-base-200 text-base-content/60' },
};
function statusOf(s: string) {
  return STATUS[s] ?? { label: s, cls: 'bg-base-200 text-base-content/60' };
}
const isOpenStatus = (s: string) => s !== 'closed' && s !== 'opt_out';

function fmt(ts?: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type Phase = 'loading' | 'no-session' | 'ready';

export function PortalPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [tickets, setTickets] = useState<PortalTicketSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortalTicketDetail | null>(null);
  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState<'abertos' | 'fechados'>('abertos');
  const [search, setSearch] = useState('');
  // form de abrir chamado
  const [ntSubject, setNtSubject] = useState('');
  const [ntArea, setNtArea] = useState('');
  const [ntPhone, setNtPhone] = useState('');
  const [draft, setDraft] = useState(''); // mensagem (chat) ou descrição (novo)
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── bootstrap: troca token da URL por sessão, depois confere /me ──────────
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const token = url.searchParams.get('t');
      if (token) {
        try { await portalApi.post('/session', { token }); } catch { /* token inválido → cai no /me */ }
        url.searchParams.delete('t');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
      try {
        const r = await portalApi.get<PortalMe>('/me');
        setMe(r.data);
        setPhase('ready');
      } catch {
        setPhase('no-session');
      }
    })();
  }, []);

  const loadTickets = useCallback(async () => {
    const r = await portalApi.get<{ items: PortalTicketSummary[]; total: number }>('/tickets', {
      params: { limit: 100, offset: 0 },
    });
    setTickets(r.data.items);
  }, []);

  useEffect(() => {
    if (phase === 'ready') loadTickets();
  }, [phase, loadTickets]);

  const loadDetail = useCallback(async (id: string) => {
    const r = await portalApi.get<PortalTicketDetail>(`/tickets/${id}`);
    setDetail(r.data);
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected);
    const t = setInterval(() => loadDetail(selected), 6000);
    return () => clearInterval(t);
  }, [selected, loadDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages.length]);

  function startNew() {
    setComposing(true);
    setSelected(null);
    setDetail(null);
    setDraft('');
    setNtSubject('');
    setNtArea('');
    setNtPhone(me?.phone ?? ''); // prefill do cadastro
  }

  async function openTicket() {
    if (!ntSubject.trim() || !draft.trim() || sending) return;
    setSending(true);
    try {
      const r = await portalApi.post<PortalTicketDetail>('/tickets', {
        subject: ntSubject.trim(),
        category: ntArea || undefined,
        message: draft.trim(),
        phone: ntPhone.trim() || undefined,
      });
      setDraft('');
      setComposing(false);
      setDetail(r.data);
      setSelected(r.data.id);
      await loadTickets();
    } finally {
      setSending(false);
    }
  }

  async function reply() {
    if (!draft.trim() || sending || !selected) return;
    setSending(true);
    try {
      const r = await portalApi.post<PortalTicketDetail>(`/tickets/${selected}/messages`, { message: draft.trim() });
      setDraft('');
      setDetail(r.data);
      loadTickets();
    } finally {
      setSending(false);
    }
  }

  async function logout() {
    try { await portalApi.post('/session/logout', {}); } finally { setMe(null); setPhase('no-session'); }
  }

  // ── estados de sessão ─────────────────────────────────────────────────────
  if (phase === 'loading') {
    return <div className="flex h-screen items-center justify-center bg-base-100 text-base-content/40">Carregando portal…</div>;
  }
  if (phase === 'no-session') {
    return (
      <div className="flex h-screen items-center justify-center bg-base-100 px-6">
        <Card className="max-w-md p-8 text-center">
          <div className="mb-3 flex justify-center text-base-content/30"><Icon name="support" className="h-10 w-10" /></div>
          <h1 className="text-lg font-bold text-base-content">Suporte HiperTMS</h1>
          <p className="mt-2 text-sm text-base-content/60">
            Abra o suporte pelo botão <strong>"Suporte"</strong> no seu painel do HiperTMS — você entra
            automaticamente, sem precisar de login.
          </p>
        </Card>
      </div>
    );
  }

  // ── portal pronto ─────────────────────────────────────────────────────────
  const abertos = tickets.filter((t) => isOpenStatus(t.status));
  const fechados = tickets.filter((t) => !isOpenStatus(t.status));
  const base = tab === 'abertos' ? abertos : fechados;
  const visible = search.trim()
    ? base.filter((t) => (t.rootCause || t.ticketCategory || '').toLowerCase().includes(search.toLowerCase()))
    : base;
  const plan = me?.contract?.plan as string | undefined;

  return (
    <div className="flex h-screen flex-col bg-base-100">
      {/* header */}
      <header className="flex items-center justify-between border-b border-base-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <Icon name="support" className="h-5 w-5 text-brand-500" />
          <span className="font-semibold text-base-content">Suporte HiperTMS</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="font-medium text-base-content">{me?.name ?? 'Cliente'}</div>
            {plan && <div className="text-[11px] text-base-content/50">Plano {plan}</div>}
          </div>
          <Button variant="outline" onClick={logout}><Icon name="power" className="h-4 w-4" /> Sair</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* lista de chamados */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-base-200">
          {/* cards de contagem (estilo DO) */}
          <div className="grid grid-cols-2 gap-2 p-3">
            <div className="rounded-lg bg-base-200/60 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-base-content/50">Abertos</div>
              <div className="text-xl font-bold text-base-content">{abertos.length}</div>
            </div>
            <div className="rounded-lg bg-base-200/60 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-base-content/50">Resolvidos</div>
              <div className="text-xl font-bold text-base-content">{fechados.length}</div>
            </div>
          </div>

          <div className="px-3">
            <Button className="w-full justify-center" onClick={startNew}><Icon name="plus" className="h-4 w-4" /> Abrir chamado</Button>
          </div>

          {/* abas */}
          <div className="mt-3 flex gap-1 px-3">
            {(['abertos', 'fechados'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${tab === t ? 'bg-base-200 text-base-content' : 'text-base-content/50 hover:bg-base-200/60'}`}
              >
                {t === 'abertos' ? `Abertos (${abertos.length})` : `Resolvidos (${fechados.length})`}
              </button>
            ))}
          </div>

          {/* busca */}
          <div className="px-3 py-2">
            <Input placeholder="Buscar por assunto…" value={search} onChange={(e) => setSearch(e.target.value)} className="text-sm" />
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-base-content/40">Nenhum chamado {tab === 'abertos' ? 'aberto' : 'resolvido'}.</p>
            ) : (
              visible.map((t) => {
                const st = statusOf(t.status);
                return (
                  <button
                    key={t.id}
                    onClick={() => { setComposing(false); setSelected(t.id); }}
                    className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${selected === t.id ? 'bg-base-200' : 'hover:bg-base-200/60'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                      {t.ticketCategory && <span className="text-[10px] text-base-content/40">{t.ticketCategory}</span>}
                    </div>
                    <div className="mt-1 truncate text-sm text-base-content">{t.rootCause || t.ticketCategory || 'Chamado de suporte'}</div>
                    <div className="text-[11px] text-base-content/40">{fmt(t.lastActivityAt || t.createdAt)}</div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* painel principal */}
        <main className="flex min-h-0 flex-1 flex-col">
          {composing ? (
            <NewTicket
              subject={ntSubject} setSubject={setNtSubject}
              area={ntArea} setArea={setNtArea}
              phone={ntPhone} setPhone={setNtPhone}
              description={draft} setDescription={setDraft}
              sending={sending} onSubmit={openTicket} onCancel={() => setComposing(false)}
            />
          ) : detail ? (
            <>
              <div className="flex items-center justify-between border-b border-base-200 px-5 py-3">
                <div>
                  <div className="text-sm font-semibold text-base-content">{detail.rootCause || detail.ticketCategory || 'Chamado'}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-base-content/40">
                    Aberto em {fmt(detail.createdAt)}
                    {detail.ticketCategory && <span className="rounded-full bg-base-200 px-2 py-0.5">{detail.ticketCategory}</span>}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusOf(detail.status).cls}`}>{statusOf(detail.status).label}</span>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
                {detail.messages.map((mmsg) => {
                  const mine = mmsg.direction === 'inbound';
                  return (
                    <div key={mmsg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-brand-500 text-white' : 'bg-base-200 text-base-content'}`}>
                        <div className="whitespace-pre-wrap">{mmsg.content}</div>
                        <div className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-base-content/40'}`}>{fmt(mmsg.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              {detail.status !== 'closed' && detail.status !== 'opt_out' && (
                <Composer draft={draft} setDraft={setDraft} sending={sending} onSubmit={reply} />
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-base-content/40">
              Selecione um chamado ou abra um novo.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── subcomponentes ──────────────────────────────────────────────────────────
function Composer({ draft, setDraft, sending, onSubmit }: {
  draft: string; setDraft: (v: string) => void; sending: boolean; onSubmit: () => void;
}) {
  return (
    <div className="border-t border-base-200 p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          placeholder="Escreva sua mensagem…"
          rows={1}
          className="min-h-[40px] flex-1 resize-none"
        />
        <Button onClick={onSubmit} disabled={sending || !draft.trim()}>
          <Icon name="send" className="h-4 w-4" /> Enviar
        </Button>
      </div>
    </div>
  );
}

function NewTicket({ subject, setSubject, area, setArea, phone, setPhone, description, setDescription, sending, onSubmit, onCancel }: {
  subject: string; setSubject: (v: string) => void;
  area: string; setArea: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  sending: boolean; onSubmit: () => void; onCancel: () => void;
}) {
  const valid = subject.trim() && description.trim();
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h2 className="text-lg font-bold text-base-content">Abrir um chamado</h2>
      <p className="mt-1 text-sm text-base-content/50">A Lia responde por aqui em instantes. Se não resolver, o suporte assume e pode te ligar.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-base-content/60">Assunto</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: Erro 562 ao emitir CT-e" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-base-content/60">Área do sistema</label>
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Selecione…</option>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-base-content/60">Telefone p/ contato</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
            <p className="mt-1 text-[11px] text-base-content/40">Caso o suporte precise te ligar.</p>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-base-content/60">Descrição</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Conte o que está acontecendo, com o máximo de detalhes." rows={5} />
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onSubmit} disabled={sending || !valid}>
          <Icon name="send" className="h-4 w-4" /> Abrir chamado
        </Button>
      </div>
    </div>
  );
}
