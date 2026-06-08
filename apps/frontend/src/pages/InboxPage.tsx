import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface Conversation { id: string; phone: string; status: string; assignedSeller?: { name: string } | null; outcome?: string | null; }
interface Message { id: string; direction: string; content: string; createdAt: string; }

export function InboxPage() {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [liaBusy, setLiaBusy] = useState(false);
  const [liaInfo, setLiaInfo] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // carrega conversas
  useEffect(() => {
    api.get('/conversations')
      .then((r) => setConvs(r.data.items))
      .finally(() => setLoadingConvs(false));
  }, []);

  // conecta socket
  useEffect(() => {
    const s = io('/', { path: '/ws', transports: ['websocket'] });
    socketRef.current = s;
    s.on('message', (msg: Message) => setMessages((prev) => [...prev, msg]));
    return () => { s.close(); };
  }, []);

  // mantém a conversa sempre na mensagem mais recente (que fica no TOPO)
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = 0;
  }, [active?.id, messages.length]);

  // abre conversa
  function openConv(c: Conversation) {
    setActive(c);
    api.get(`/conversations/${c.id}/messages`).then((r) => setMessages(r.data));
    socketRef.current?.emit('join', { conversationId: c.id });
  }

  async function send() {
    if (!active || !text.trim()) return;
    await api.post(`/conversations/${active.id}/messages`, { direction: 'outbound', content: text });
    setText('');
    setLiaInfo('');
    // a mensagem volta via WebSocket
  }

  // marca resultado da venda (KPI dos vendedores)
  async function setOutcome(outcome: 'won' | 'lost' | null) {
    if (!active) return;
    await api.patch(`/conversations/${active.id}/outcome`, { outcome });
    setActive({ ...active, outcome });
    setConvs((prev) => prev.map((c) => (c.id === active.id ? { ...c, outcome } : c)));
  }

  // Lia sugere resposta com base na última mensagem do cliente + KB
  async function suggest() {
    if (!active) return;
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
    const question = lastInbound?.content || 'Olá, tudo bem?';
    setLiaBusy(true);
    setLiaInfo('');
    try {
      const r = await api.post('/agent/handle', { message: question, conversationId: active.id });
      setText(r.data.draft);
      const agentEmoji: Record<string, string> = { sales: '💰', support: '🛠️', human: '🙋', optout: '🚫' };
      const route = r.data.route || {};
      const fontes = (r.data.usedKnowledge || []).map((k: any) => k.title).join(', ');
      setLiaInfo(
        `${agentEmoji[route.agent] || '✨'} ${route.agent} · ${route.intent} · score ${route.leadScore}` +
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
      {/* sidebar conversas */}
      <aside className="flex w-80 flex-col border-r border-base-200 bg-white">
        <div className="border-b border-base-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-base-content/50">
          Conversas
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs && <div className="p-3"><SkeletonList rows={5} /></div>}
          {!loadingConvs && convs.length === 0 && (
            <div className="p-3">
              <EmptyState icon="💬" title="Nenhuma conversa" description="As conversas do WhatsApp aparecem aqui assim que um lead mandar mensagem." />
            </div>
          )}
          {!loadingConvs && convs.map((c) => (
            <button
              key={c.id}
              onClick={() => openConv(c)}
              className={`block w-full border-b px-4 py-3 text-left text-sm hover:bg-zinc-50 ${active?.id === c.id ? 'bg-zinc-100' : ''}`}
            >
              <div className="font-medium text-zinc-700">{c.phone}</div>
              <div className="flex items-center gap-1 text-xs text-zinc-400">
                {c.status}
                {c.assignedSeller && (
                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                    🧑‍💼 {c.assignedSeller.name}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t p-3 text-xs text-zinc-400">{user?.email}</div>
      </aside>

      {/* thread */}
      <main className="flex flex-1 flex-col bg-zinc-50">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-zinc-400">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b bg-white px-4 py-3">
              <span className="font-medium text-zinc-700">{active.phone}</span>
              <div className="flex items-center gap-1.5">
                <span className="mr-1 text-xs text-zinc-400">Resultado:</span>
                <button
                  onClick={() => setOutcome(active.outcome === 'won' ? null : 'won')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active.outcome === 'won' ? 'bg-emerald-600 text-white' : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
                >✅ Ganhou</button>
                <button
                  onClick={() => setOutcome(active.outcome === 'lost' ? null : 'lost')}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${active.outcome === 'lost' ? 'bg-red-600 text-white' : 'border border-zinc-300 text-zinc-600 hover:bg-zinc-50'}`}
                >❌ Perdeu</button>
              </div>
            </div>
            <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {[...messages].reverse().map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-md rounded-2xl px-4 py-2 text-sm ${m.direction === 'outbound' ? 'bg-brand-500 text-white' : 'bg-white text-zinc-700 shadow'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t bg-white p-3">
              {liaInfo && <div className="mb-2 px-2 text-xs text-brand-600">✨ {liaInfo}</div>}
              <div className="flex gap-2">
                <button
                  onClick={suggest}
                  disabled={liaBusy}
                  title="Sugerir resposta com a Lia (IA + base de conhecimento)"
                  className="rounded-full bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {liaBusy ? '...' : '✨ Lia'}
                </button>
                <input
                  className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm"
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
