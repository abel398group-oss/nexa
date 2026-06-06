import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface Conversation { id: string; phone: string; status: string; }
interface Message { id: string; direction: string; content: string; createdAt: string; }

export function InboxPage() {
  const { user, logout } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [liaBusy, setLiaBusy] = useState(false);
  const [liaInfo, setLiaInfo] = useState('');
  const socketRef = useRef<Socket | null>(null);

  // carrega conversas
  useEffect(() => {
    api.get('/conversations').then((r) => setConvs(r.data.items));
  }, []);

  // conecta socket
  useEffect(() => {
    const s = io('/', { path: '/ws', transports: ['websocket'] });
    socketRef.current = s;
    s.on('message', (msg: Message) => setMessages((prev) => [...prev, msg]));
    return () => { s.close(); };
  }, []);

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
      <aside className="flex w-80 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b p-4">
          <span className="font-bold text-slate-800">Nexa · Inbox</span>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600">sair</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && <p className="p-4 text-sm text-slate-400">Nenhuma conversa ainda.</p>}
          {convs.map((c) => (
            <button
              key={c.id}
              onClick={() => openConv(c)}
              className={`block w-full border-b px-4 py-3 text-left text-sm hover:bg-slate-50 ${active?.id === c.id ? 'bg-slate-100' : ''}`}
            >
              <div className="font-medium text-slate-700">{c.phone}</div>
              <div className="text-xs text-slate-400">{c.status}</div>
            </button>
          ))}
        </div>
        <div className="border-t p-3 text-xs text-slate-400">{user?.email}</div>
      </aside>

      {/* thread */}
      <main className="flex flex-1 flex-col bg-slate-50">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="border-b bg-white p-4 font-medium text-slate-700">{active.phone}</div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-md rounded-2xl px-4 py-2 text-sm ${m.direction === 'outbound' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-700 shadow'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t bg-white p-3">
              {liaInfo && <div className="mb-2 px-2 text-xs text-emerald-600">✨ {liaInfo}</div>}
              <div className="flex gap-2">
                <button
                  onClick={suggest}
                  disabled={liaBusy}
                  title="Sugerir resposta com a Lia (IA + base de conhecimento)"
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {liaBusy ? '...' : '✨ Lia'}
                </button>
                <input
                  className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm"
                  placeholder="Digite uma mensagem..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button onClick={send} className="rounded-full bg-slate-800 px-5 py-2 text-sm text-white hover:bg-slate-700">
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
