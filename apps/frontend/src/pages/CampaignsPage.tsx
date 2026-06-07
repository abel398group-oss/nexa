import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Campaign {
  id: string;
  name: string;
  template: string;
  status: string;
  counts: Record<string, number>;
}
interface SenderNumber { phone: string; sentToday: number; dailyLimit: number; }

export function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [numbers, setNumbers] = useState<SenderNumber[]>([]);
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('Oi {{nome}}! Aqui é a Lia do HiperTMS. Posso te apresentar nosso sistema de gestão de fretes?');
  const [fromContacts, setFromContacts] = useState(true);
  const [phonesText, setPhonesText] = useState('');
  const [link, setLink] = useState('');
  const [media, setMedia] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [limitMode, setLimitMode] = useState<'all' | 'limit'>('all');
  const [sendLimit, setSendLimit] = useState(30);
  const [busy, setBusy] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/campaigns/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMedia({ url: r.data.url, name: r.data.name });
    } finally {
      setUploading(false);
    }
  }

  async function load() {
    const [c, n] = await Promise.all([api.get('/campaigns'), api.get('/sender/numbers')]);
    setItems(c.data);
    setNumbers(n.data);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: any = { name: name.trim(), template: template.trim() };
      if (fromContacts) payload.fromContacts = true;
      else payload.phones = phonesText.split('\n').map((l) => l.trim()).filter(Boolean).map((p) => ({ phone: p.replace(/\D/g, '') }));
      if (link.trim()) payload.link = link.trim();
      if (media) { payload.mediaUrl = media.url; payload.mediaName = media.name; }
      if (limitMode === 'limit') payload.sendLimit = sendLimit;
      await api.post('/campaigns', payload);
      setShow(false);
      setName(''); setLink(''); setMedia(null); setLimitMode('all');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function start(id: string) { await api.post(`/campaigns/${id}/start`); await load(); }
  async function pause(id: string) { await api.post(`/campaigns/${id}/pause`); await load(); }

  const statusColor: Record<string, string> = {
    draft: 'bg-zinc-100 text-zinc-600', running: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-amber-100 text-amber-700', done: 'bg-sky-100 text-sky-700',
  };

  return (
    <div className="h-full overflow-auto bg-zinc-50 p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">Disparo de Leads</h1>
          <p className="text-xs text-zinc-400">
            Horário comercial 7h-19h · {numbers.map((n) => `${n.phone}: ${n.sentToday}/${n.dailyLimit} hoje`).join(' · ') || 'sem número'}
          </p>
        </div>
        <button onClick={() => setShow(true)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">+ Nova campanha</button>
      </div>

      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-zinc-400">Nenhuma campanha ainda.</p>}
        {items.map((c) => {
          const total = Object.values(c.counts).reduce((a, b) => a + b, 0);
          const sent = c.counts.sent ?? 0;
          const pct = total ? Math.round((sent / total) * 100) : 0;
          return (
            <div key={c.id} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-zinc-800">{c.name}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${statusColor[c.status]}`}>{c.status}</span>
                </div>
                <div className="flex gap-2">
                  {c.status !== 'running' && c.status !== 'done' && (
                    <button onClick={() => start(c.id)} className="rounded-lg bg-brand-600 px-3 py-1 text-xs text-white hover:bg-brand-500">▶ Iniciar</button>
                  )}
                  {c.status === 'running' && (
                    <button onClick={() => pause(c.id)} className="rounded-lg bg-amber-500 px-3 py-1 text-xs text-white hover:bg-amber-400">⏸ Pausar</button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-500">{c.template}</p>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-zinc-400">
                  <span>{sent}/{total} enviados</span><span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 flex gap-2 text-[11px] text-zinc-400">
                  {Object.entries(c.counts).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30" onClick={() => setShow(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="w-[28rem] rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-zinc-800">Nova campanha</h2>
            <label className="mb-1 block text-xs text-zinc-500">Nome</label>
            <input className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Frete Junho" />
            <label className="mb-1 block text-xs text-zinc-500">Mensagem (use {'{{nome}}'} pra personalizar)</label>
            <textarea className="mb-3 h-24 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" value={template} onChange={(e) => setTemplate(e.target.value)} />
            <label className="mb-2 flex items-center gap-2 text-sm text-zinc-600">
              <input type="checkbox" checked={fromContacts} onChange={(e) => setFromContacts(e.target.checked)} />
              Disparar para todos os contatos ativos
            </label>
            {!fromContacts && (
              <textarea className="mb-3 h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Um telefone por linha (5511...)" value={phonesText} onChange={(e) => setPhonesText(e.target.value)} />
            )}

            {/* Link */}
            <label className="mb-1 block text-xs text-zinc-500">Link (opcional — vai no final da mensagem)</label>
            <input className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://... (portfólio, site)" />

            {/* Anexo */}
            <label className="mb-1 block text-xs text-zinc-500">Anexo (PDF/Word — portfólio)</label>
            <div className="mb-3 flex items-center gap-2">
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} className="text-xs" />
              {uploading && <span className="text-xs text-zinc-400">enviando...</span>}
              {media && <span className="text-xs text-emerald-600">✅ {media.name}</span>}
            </div>

            {/* Quantidade */}
            <label className="mb-1 block text-xs text-zinc-500">Quantos enviar?</label>
            <div className="mb-3 flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1"><input type="radio" checked={limitMode === 'all'} onChange={() => setLimitMode('all')} /> Todos (até o limite diário)</label>
              <label className="flex items-center gap-1"><input type="radio" checked={limitMode === 'limit'} onChange={() => setLimitMode('limit')} /> Só</label>
              <input type="number" min={1} disabled={limitMode !== 'limit'} value={sendLimit} onChange={(e) => setSendLimit(Number(e.target.value))} className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-sm disabled:opacity-40" />
            </div>
            <p className="mb-3 text-[11px] text-zinc-400">Limite diário do número: {numbers[0] ? `${numbers[0].sentToday}/${numbers[0].dailyLimit} hoje` : '—'}. O sistema respeita horário comercial e o anti-ban automaticamente.</p>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShow(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-500">Cancelar</button>
              <button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50">{busy ? 'Criando...' : 'Criar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
