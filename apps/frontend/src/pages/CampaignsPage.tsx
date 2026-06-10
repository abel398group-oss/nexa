import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Badge, statusVariant } from '@/components/ui/Badge';

interface Campaign {
  id: string;
  name: string;
  channel?: string;
  template: string;
  subject?: string | null;
  status: string;
  counts: Record<string, number>;
}
interface SenderNumber { phone: string; sentToday: number; dailyLimit: number; }

type Channel = 'whatsapp' | 'email';

export function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [numbers, setNumbers] = useState<SenderNumber[]>([]);
  const [show, setShow] = useState(false);
  const [channel, setChannel] = useState<Channel>('whatsapp');

  // WhatsApp fields
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('{{saudacao}}, {{nome}}! Aqui é a Lia do HiperTMS. Posso te apresentar nosso sistema de gestão de fretes?');
  const [fromContacts, setFromContacts] = useState(true);
  const [phonesText, setPhonesText] = useState('');
  const [link, setLink] = useState('');
  const [media, setMedia] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Email-only fields
  const [emailSubject, setEmailSubject] = useState('');
  const [emailsText, setEmailsText] = useState('');
  const [emailTemplate, setEmailTemplate] = useState(
    '{{saudacao}}, {{nome}}!\n\nAqui é a Lia do HiperTMS.\n\nGostaria de apresentar como nossa plataforma de gestão de fretes pode ajudar sua empresa a reduzir custos logísticos e emitir CT-e, MDF-e com muito mais agilidade.\n\nPosso enviar uma demonstração?',
  );

  // Shared
  const [limitMode, setLimitMode] = useState<'all' | 'limit'>('all');
  const [sendLimit, setSendLimit] = useState(30);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

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
    try {
      const [c, n] = await Promise.allSettled([api.get('/campaigns'), api.get('/sender/numbers')]);
      if (c.status === 'fulfilled') setItems(c.value.data);
      if (n.status === 'fulfilled') setNumbers(n.value.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  function resetForm() {
    setName(''); setLink(''); setMedia(null); setLimitMode('all');
    setPhonesText(''); setEmailsText(''); setEmailSubject(''); setChannel('whatsapp');
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let r: any;
      if (channel === 'email') {
        const payload: any = {
          name: name.trim(),
          subject: emailSubject.trim(),
          template: emailTemplate.trim(),
        };
        if (fromContacts) payload.fromContacts = true;
        else payload.emails = emailsText.split('\n').map((l) => l.trim()).filter((l) => l.includes('@')).map((e) => ({ email: e }));
        if (limitMode === 'limit') payload.sendLimit = sendLimit;
        r = await api.post('/campaigns/email', payload);
      } else {
        const payload: any = { name: name.trim(), template: template.trim() };
        if (fromContacts) payload.fromContacts = true;
        else payload.phones = phonesText.split('\n').map((l) => l.trim()).filter(Boolean).map((p) => ({ phone: p.replace(/\D/g, '') }));
        if (link.trim()) payload.link = link.trim();
        if (media) { payload.mediaUrl = media.url; payload.mediaName = media.name; }
        if (limitMode === 'limit') payload.sendLimit = sendLimit;
        r = await api.post('/campaigns', payload);
      }
      setShow(false);
      resetForm();
      const inc = r.data?.included ?? r.data?._count?.targets ?? 0;
      const skip = r.data?.skippedOptOut ?? 0;
      toast.success(`Campanha criada! ${inc} contato(s)${skip > 0 ? ` · ${skip} pulado(s) por opt-out` : ''}.`);
      await load();
    } catch {
      toast.error('Erro ao criar campanha.');
    } finally {
      setBusy(false);
    }
  }

  async function start(c: Campaign) {
    const channelLabel = c.channel === 'email' ? 'e-mails reais' : 'mensagens reais no WhatsApp';
    const ok = await confirm({
      title: 'Iniciar disparo',
      message: `Iniciar a campanha "${c.name}"? ${channelLabel.charAt(0).toUpperCase() + channelLabel.slice(1)} serão enviados respeitando horário e limites.`,
      variant: 'info',
      confirmLabel: 'Iniciar disparo',
    });
    if (!ok) return;
    await api.post(`/campaigns/${c.id}/start`);
    toast.success('Campanha iniciada 🚀');
    await load();
  }
  async function pause(id: string) { await api.post(`/campaigns/${id}/pause`); toast.info('Campanha pausada.'); await load(); }
  async function del(c: Campaign) {
    const ok = await confirm({
      title: 'Excluir campanha',
      message: `Excluir a campanha "${c.name}"? O histórico de envios dela também será apagado.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.delete(`/campaigns/${c.id}`);
      toast.success('Campanha excluída.');
      await load();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  return (
    <div className="h-full overflow-auto bg-base-100 p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-base-content">Disparo de Leads</h1>
          <p className="text-xs text-base-content/50">
            WhatsApp: 7h–19h · {numbers.map((n) => `${n.phone}: ${n.sentToday}/${n.dailyLimit} hoje`).join(' · ') || 'sem número'} &nbsp;|&nbsp;
            E-mail: 8h–18h · 50/dia · delay 90–180s (anti-spam)
          </p>
        </div>
        <button onClick={() => setShow(true)} className="btn-primary">+ Nova campanha</button>
      </div>

      <div className="space-y-3">
        {loading && <SkeletonList rows={3} />}
        {!loading && items.length === 0 && (
          <EmptyState
            icon="📣"
            title="Nenhuma campanha ainda"
            description="Crie uma campanha de WhatsApp ou e-mail para disparar para seus leads."
            action={<button onClick={() => setShow(true)} className="btn-primary">+ Nova campanha</button>}
          />
        )}
        {!loading && items.map((c) => {
          const total = Object.values(c.counts).reduce((a, b) => a + b, 0);
          const sent = c.counts.sent ?? 0;
          const pct = total ? Math.round((sent / total) * 100) : 0;
          const isEmail = c.channel === 'email';
          return (
            <div key={c.id} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-base-content">{c.name}</span>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  {isEmail
                    ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">✉️ e-mail</span>
                    : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">💬 WhatsApp</span>
                  }
                </div>
                <div className="flex gap-2">
                  {c.status !== 'running' && c.status !== 'done' && (
                    <button onClick={() => start(c)} className="btn-primary h-7 px-3 text-xs">▶ Iniciar</button>
                  )}
                  {c.status === 'running' && (
                    <button onClick={() => pause(c.id)} className="h-7 rounded-lg bg-amber-500 px-3 text-xs text-white hover:bg-amber-400">⏸ Pausar</button>
                  )}
                  <button onClick={() => del(c)} title="Excluir campanha" className="btn-outline h-7 px-2 text-xs text-red-500 hover:bg-red-50">🗑️</button>
                </div>
              </div>
              {isEmail && c.subject && (
                <p className="mt-1 text-xs font-medium text-base-content/60">📧 Assunto: {c.subject}</p>
              )}
              <p className="mt-1 text-xs text-base-content/40 line-clamp-1">{c.template}</p>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs text-base-content/40">
                  <span>{sent}/{total} enviados</span><span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-base-200">
                  <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 flex gap-2 text-[11px] text-base-content/40">
                  {Object.entries(c.counts).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {show && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" onClick={() => setShow(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={create}
            className="w-[30rem] max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-elevated"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)' }}
          >
            <h2 className="mb-4 text-lg font-bold text-base-content">Nova campanha</h2>

            {/* Canal */}
            <div className="mb-4 flex rounded-lg border border-base-200 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                className={`flex-1 py-2 transition-colors ${channel === 'whatsapp' ? 'bg-green-500 text-white font-medium' : 'bg-white text-base-content/60 hover:bg-base-100'}`}
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setChannel('email')}
                className={`flex-1 py-2 transition-colors ${channel === 'email' ? 'bg-blue-500 text-white font-medium' : 'bg-white text-base-content/60 hover:bg-base-100'}`}
              >
                ✉️ E-mail
              </button>
            </div>

            {/* Nome */}
            <label className="mb-1 block text-xs text-base-content/50">Nome da campanha</label>
            <input className="input mb-3 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Prospecção Junho" required />

            {channel === 'email' ? (
              <>
                {/* Assunto — crítico para deliverability */}
                <label className="mb-1 block text-xs text-base-content/50">
                  Assunto do e-mail <span className="text-error">*</span>
                  <span className="ml-1 text-base-content/30">(evite MAIÚSCULAS, !!! e palavras de spam)</span>
                </label>
                <input
                  className="input mb-1 w-full"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Conheça o HiperTMS — gestão de fretes simplificada"
                  required
                />
                <p className="mb-3 text-[11px] text-base-content/40">
                  ✅ Bom: "Gestão de fretes para transportadoras" &nbsp;|&nbsp; ❌ Ruim: "OFERTA!!! Grátis por tempo limitado"
                </p>

                {/* Template e-mail */}
                <label className="mb-1 block text-xs text-base-content/50">Corpo do e-mail (use {'{{nome}}'} e {'{{saudacao}}'})</label>
                <textarea className="input mb-3 h-36 w-full py-2 text-sm" value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)} required />
                <p className="mb-3 text-[11px] text-base-content/40">
                  O link de descadastro (LGPD) e a assinatura são adicionados automaticamente no rodapé.
                </p>

                {/* Lista de e-mails */}
                <label className="mb-2 flex items-center gap-2 text-sm text-base-content/70">
                  <input type="checkbox" checked={fromContacts} onChange={(e) => setFromContacts(e.target.checked)} />
                  Usar contatos com e-mail cadastrado
                </label>
                {!fromContacts && (
                  <>
                    <textarea
                      className="input mb-1 h-24 w-full py-2 text-sm font-mono"
                      placeholder={'joao@empresa.com\nmaria@logistica.com.br'}
                      value={emailsText}
                      onChange={(e) => setEmailsText(e.target.value)}
                    />
                    <p className="mb-3 text-[11px] text-base-content/40">Um e-mail por linha.</p>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Template WhatsApp */}
                <label className="mb-1 block text-xs text-base-content/50">Mensagem (use {'{{nome}}'} e {'{{saudacao}}'})</label>
                <textarea className="input mb-3 h-24 w-full py-2" value={template} onChange={(e) => setTemplate(e.target.value)} required />

                {/* Lista de telefones */}
                <label className="mb-2 flex items-center gap-2 text-sm text-base-content/70">
                  <input type="checkbox" checked={fromContacts} onChange={(e) => setFromContacts(e.target.checked)} />
                  Disparar para todos os contatos ativos
                </label>
                {!fromContacts && (
                  <textarea className="input mb-3 h-20 w-full py-2" placeholder="Um telefone por linha (5511...)" value={phonesText} onChange={(e) => setPhonesText(e.target.value)} />
                )}

                {/* Link */}
                <label className="mb-1 block text-xs text-base-content/50">Link (opcional — vai no final)</label>
                <input className="input mb-3 w-full" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />

                {/* Anexo */}
                <label className="mb-1 block text-xs text-base-content/50">Anexo (PDF/Word)</label>
                <div className="mb-3 flex items-center gap-2">
                  <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} className="text-xs" />
                  {uploading && <span className="text-xs text-base-content/40">enviando...</span>}
                  {media && <span className="text-xs text-emerald-600">✅ {media.name}</span>}
                </div>

                <p className="mb-3 text-[11px] text-base-content/40">
                  Número: {numbers[0] ? `${numbers[0].sentToday}/${numbers[0].dailyLimit} hoje` : '—'} · delay 30–90s · anti-ban ativo
                </p>
              </>
            )}

            {/* Quantidade */}
            <label className="mb-1 block text-xs text-base-content/50">Quantos enviar?</label>
            <div className="mb-4 flex items-center gap-3 text-sm text-base-content/70">
              <label className="flex items-center gap-1"><input type="radio" checked={limitMode === 'all'} onChange={() => setLimitMode('all')} /> Todos (até o limite diário)</label>
              <label className="flex items-center gap-1"><input type="radio" checked={limitMode === 'limit'} onChange={() => setLimitMode('limit')} /> Só</label>
              <input type="number" min={1} disabled={limitMode !== 'limit'} value={sendLimit} onChange={(e) => setSendLimit(Number(e.target.value))} className="input w-20 disabled:opacity-40" />
            </div>

            {channel === 'email' && (
              <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
                ⏱️ Anti-spam ativo: delay 90–180s entre e-mails · máx 50/dia · horário 8h–18h · link de opt-out obrigatório em todos os envios.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShow(false); resetForm(); }} className="btn-ghost">Cancelar</button>
              <button disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Criando...' : 'Criar campanha'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
