import { useCallback, useEffect, useRef, useState } from 'react';
import {
  portalApi,
  type PortalMe,
  type PortalTicketSummary,
  type PortalTicketDetail,
} from '@/lib/portalApi';
import { Button, Card, Textarea, Icon } from '@/shared/ui';

// ── rótulos / estilos de status (ConversationStatus) ───────────────────────
const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Aberto', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  waiting_customer: { label: 'Aguardando você', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  waiting_internal: { label: 'Em análise', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  escalated: { label: 'Escalado', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  closed: { label: 'Fechado', cls: 'bg-base-200 text-base-content/60' },
  opt_out: { label: 'Encerrado', cls: 'bg-base-200 text-base-content/60' },
};
function statusOf(s: string) {
  return STATUS[s] ?? { label: s, cls: 'bg-base-200 text-base-content/60' };
}
const CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'E-mail', portal: 'Portal' };

function fmt(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type Phase = 'loading' | 'no-session' | 'ready';

export function PortalPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [tickets, setTickets] = useState<PortalTicketSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortalTicketDetail | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── bootstrap: troca token da URL por sessão, depois confere /me ──────────
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const token = url.searchParams.get('t');
      if (token) {
        try {
          await portalApi.post('/session', { token });
        } catch {
          /* token inválido/expirado → cai no /me abaixo e mostra no-session */
        }
        // remove o token da URL (não deixa vazar em histórico)
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

  // ── detalhe do chamado selecionado + polling enquanto aberto ──────────────
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

  async function openTicket() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const r = await portalApi.post<PortalTicketDetail>('/tickets', { message: draft.trim() });
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
    try {
      await portalApi.post('/session/logout', {});
    } finally {
      setMe(null);
      setPhase('no-session');
    }
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

  // ── portal pronto (master-detail) ─────────────────────────────────────────
  const plan = me?.contract?.plan as string | undefined;
  return (
    <div className="flex h-screen flex-col bg-base-100">
      {/* header */}
      <header className="flex items-center justify-between border-b border-base-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <Icon name="support" className="h-5 w-5 text-brand-500" />
          <span className="font-semibold text-base-content">Suporte</span>
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
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/50">Meus chamados</span>
            <Button onClick={() => { setComposing(true); setSelected(null); setDetail(null); setDraft(''); }}>
              <Icon name="plus" className="h-4 w-4" /> Novo
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {tickets.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-base-content/40">Nenhum chamado ainda.</p>
            ) : (
              tickets.map((t) => {
                const st = statusOf(t.status);
                return (
                  <button
                    key={t.id}
                    onClick={() => { setComposing(false); setSelected(t.id); }}
                    className={`mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${selected === t.id ? 'bg-base-200' : 'hover:bg-base-200/60'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                      <span className="text-[10px] text-base-content/40">{CHANNEL[t.sourceChannel] ?? t.sourceChannel}</span>
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
            <NewTicket draft={draft} setDraft={setDraft} sending={sending} onSubmit={openTicket} onCancel={() => setComposing(false)} />
          ) : detail ? (
            <>
              <div className="flex items-center justify-between border-b border-base-200 px-5 py-3">
                <div>
                  <div className="text-sm font-semibold text-base-content">{detail.rootCause || detail.ticketCategory || 'Chamado'}</div>
                  <div className="mt-0.5 text-[11px] text-base-content/40">Aberto em {fmt(detail.createdAt)}</div>
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
                <Composer draft={draft} setDraft={setDraft} sending={sending} onSubmit={reply} placeholder="Escreva sua mensagem…" />
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
function Composer({ draft, setDraft, sending, onSubmit, placeholder }: {
  draft: string; setDraft: (v: string) => void; sending: boolean; onSubmit: () => void; placeholder: string;
}) {
  return (
    <div className="border-t border-base-200 p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          placeholder={placeholder}
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

function NewTicket({ draft, setDraft, sending, onSubmit, onCancel }: {
  draft: string; setDraft: (v: string) => void; sending: boolean; onSubmit: () => void; onCancel: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h2 className="text-lg font-bold text-base-content">Abrir um chamado</h2>
      <p className="mt-1 text-sm text-base-content/50">Descreva o que você precisa. A Lia responde por aqui em instantes.</p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ex.: Estou com erro 562 ao emitir um CT-e…"
        rows={5}
        className="mt-4"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onSubmit} disabled={sending || !draft.trim()}>
          <Icon name="send" className="h-4 w-4" /> Abrir chamado
        </Button>
      </div>
    </div>
  );
}
