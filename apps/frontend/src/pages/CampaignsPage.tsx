import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { listContacts, listTags, type TagCount } from '@/features/contact';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Badge, statusVariant } from '@/components/ui/Badge';
import { Button, Card, StatusBadge, Modal } from '@/shared/ui';

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
  // WhatsApp: default "todos os contatos". Email: default lista manual (fromContacts=false)
  // pois normalmente não há e-mails cadastrados nos contatos ainda
  const [fromContacts, setFromContacts] = useState(true);
  const [phonesText, setPhonesText] = useState('');
  // público do WhatsApp: todos ativos | por tag | manual
  const [audience, setAudience] = useState<'todos' | 'tag' | 'manual'>('todos');
  const [audienceTag, setAudienceTag] = useState('');
  const [tags, setTags] = useState<TagCount[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const location = useLocation();
  const [link, setLink] = useState('');
  const [media, setMedia] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Email-only fields
  const [emailLinkMode, setEmailLinkMode] = useState<'upload' | 'manual'>('upload');
  const [sendLinkOnFirst, setSendLinkOnFirst] = useState(false);
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
      // Para e-mail: o link é a URL do arquivo hospedado
      if (channel === 'email') setLink(r.data.url);
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
    setPhonesText(''); setEmailsText(''); setEmailSubject('');
    setChannel('whatsapp'); setFromContacts(true); setEmailLinkMode('upload'); setSendLinkOnFirst(false);
    setAudience('todos'); setAudienceTag('');
  }

  // carrega as tags para o seletor "por tag"
  useEffect(() => {
    listTags().then(setTags).catch(() => {});
  }, []);

  // recebe a seleção vinda da tela de Contatos ("Criar campanha com selecionados")
  useEffect(() => {
    const st = location.state as { phones?: { phone: string; name?: string }[] } | null;
    if (st?.phones?.length) {
      setPhonesText(st.phones.map((p) => p.phone).join('\n'));
      setAudience('manual');
      setChannel('whatsapp');
      setShow(true);
      window.history.replaceState({}, ''); // evita reabrir ao navegar de volta
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // abre o detalhe de uma campanha (destinatários + status)
  async function openDetail(c: Campaign) {
    setShowDetail(true);
    setDetailLoading(true);
    setDetailError(false);
    setDetail({ campaign: c, targets: [], counts: c.counts });
    try {
      const r = await api.get(`/campaigns/${c.id}`);
      setDetail(r.data);
    } catch {
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  }
  const targetTone = (s: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' =>
    s === 'sent' ? 'success'
      : s === 'failed' ? 'danger'
      : s === 'skipped' ? 'warning'
      : s === 'queued' || s === 'sending' ? 'info'
      : 'neutral';

  // pré-preenche o "Nova campanha" só com os que falharam/pularam
  function resendFailed() {
    const failed = (detail?.targets || []).filter((t: any) => t.status === 'failed' || t.status === 'skipped');
    if (failed.length === 0) { toast.info('Nenhum envio falhou nesta campanha.'); return; }
    setName(`Reenvio · ${detail.campaign.name}`);
    setTemplate(detail.campaign.template || template);
    setPhonesText(failed.map((t: any) => t.phone).join('\n'));
    setAudience('manual');
    setChannel('whatsapp');
    setShowDetail(false);
    setShow(true);
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
        if (link.trim()) { payload.link = link.trim(); payload.sendLinkOnFirst = sendLinkOnFirst; }
        if (limitMode === 'limit') payload.sendLimit = sendLimit;
        r = await api.post('/campaigns/email', payload);
      } else {
        const payload: any = { name: name.trim(), template: template.trim() };
        if (audience === 'todos') {
          payload.fromContacts = true;
        } else if (audience === 'tag') {
          const r2 = await listContacts({ tag: audienceTag, limit: 2000 });
          payload.phones = r2.items
            .filter((c) => c.status !== 'opted_out')
            .map((c) => ({ phone: c.phone, name: c.name }));
        } else {
          payload.phones = phonesText.split('\n').map((l) => l.trim()).filter(Boolean).map((p) => ({ phone: p.replace(/\D/g, '') }));
        }
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
        <Button onClick={() => setShow(true)}>+ Nova campanha</Button>
      </div>

      <div className="space-y-3">
        {loading && <SkeletonList rows={3} />}
        {!loading && items.length === 0 && (
          <EmptyState
            icon="📣"
            title="Nenhuma campanha ainda"
            description="Crie uma campanha de WhatsApp ou e-mail para disparar para seus leads."
            action={<Button onClick={() => setShow(true)}>+ Nova campanha</Button>}
          />
        )}
        {!loading && items.map((c) => {
          const total = Object.values(c.counts).reduce((a, b) => a + b, 0);
          const sent = c.counts.sent ?? 0;
          const pct = total ? Math.round((sent / total) * 100) : 0;
          const isEmail = c.channel === 'email';
          return (
            <Card
              key={c.id}
              onClick={() => openDetail(c)}
              className="cursor-pointer p-5 transition-shadow hover:shadow-card-hover"
            >
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
                    <Button onClick={(e) => { e.stopPropagation(); start(c); }} size="sm">▶ Iniciar</Button>
                  )}
                  {c.status === 'running' && (
                    <button onClick={(e) => { e.stopPropagation(); pause(c.id); }} className="h-7 rounded-lg bg-amber-500 px-3 text-xs text-white hover:bg-amber-400">⏸ Pausar</button>
                  )}
                  <Button onClick={(e) => { e.stopPropagation(); del(c); }} title="Excluir campanha" variant="outline" size="sm" className="text-red-500 hover:bg-red-50">🗑️</Button>
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
            </Card>
          );
        })}
      </div>

      {show && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4" onClick={() => setShow(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={create}
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)' }}
          >
            {/* Header fixo */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-base-200 px-7 py-4"
                 style={{ background: 'var(--surface-elevated)' }}>
              <h2 className="text-lg font-bold text-base-content">Nova campanha</h2>
              <button type="button" onClick={() => { setShow(false); resetForm(); }}
                      className="text-base-content/40 hover:text-base-content text-xl leading-none">✕</button>
            </div>

            <div className="px-7 py-5 space-y-5">

            {/* Canal */}
            <div className="flex rounded-xl border border-base-200 overflow-hidden text-sm font-medium">
              <button
                type="button"
                onClick={() => { setChannel('whatsapp'); setFromContacts(true); }}
                className={`flex-1 py-2.5 transition-colors ${channel === 'whatsapp' ? 'bg-green-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                onClick={() => { setChannel('email'); setFromContacts(false); }}
                className={`flex-1 py-2.5 transition-colors ${channel === 'email' ? 'bg-blue-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}
              >
                ✉️ E-mail
              </button>
            </div>

            {/* Nome */}
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">Nome da campanha</label>
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Prospecção Junho" required />
            </div>

            {channel === 'email' ? (
              <>
                {/* Assunto */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    Assunto <span className="text-error">*</span>
                    <span className="ml-2 font-normal text-base-content/30">evite MAIÚSCULAS, !!! e palavras de spam</span>
                  </label>
                  <input
                    className="input w-full"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Conheça o HiperTMS — gestão de fretes simplificada"
                    required
                  />
                  <p className="mt-1 text-[11px] text-base-content/35">
                    ✅ "Gestão de fretes para transportadoras" &nbsp;·&nbsp; ❌ "OFERTA!!! Grátis por tempo limitado"
                  </p>
                </div>

                {/* Corpo */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    Corpo do e-mail
                    <span className="ml-2 font-normal text-base-content/30">use {'{{nome}}'} e {'{{saudacao}}'}</span>
                  </label>
                  <textarea
                    className="input w-full py-2 text-sm"
                    style={{ minHeight: '160px', resize: 'vertical' }}
                    value={emailTemplate}
                    onChange={(e) => setEmailTemplate(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-[11px] text-base-content/35">
                    Assinatura + link de descadastro (LGPD) adicionados automaticamente no rodapé.
                  </p>
                </div>

                {/* Link / PDF */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    Anexo ou link (opcional)
                    <span className="ml-2 font-normal text-base-content/30">aparece no rodapé antes do descadastro</span>
                  </label>

                  {/* Toggle: upload vs link manual */}
                  <div className="mb-2 flex rounded-lg border border-base-200 overflow-hidden text-xs font-medium">
                    <button type="button" onClick={() => setEmailLinkMode('upload')}
                      className={`flex-1 py-2 transition-colors ${emailLinkMode === 'upload' ? 'bg-indigo-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}>
                      📎 Fazer upload do PDF
                    </button>
                    <button type="button" onClick={() => setEmailLinkMode('manual')}
                      className={`flex-1 py-2 transition-colors ${emailLinkMode === 'manual' ? 'bg-indigo-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}>
                      🔗 Colar link
                    </button>
                  </div>

                  {emailLinkMode === 'upload' ? (
                    <div className="rounded-lg border border-dashed border-base-300 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.ppt,.pptx"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              uploadFile(e.target.files[0]).then(() => {});
                            }
                          }}
                          className="text-xs flex-1"
                        />
                        {uploading && <span className="text-xs text-base-content/40 whitespace-nowrap">enviando...</span>}
                      </div>
                      {media && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-emerald-600">✅ {media.name}</span>
                          <span className="text-[11px] text-base-content/40 truncate">→ {media.url}</span>
                          <button type="button" onClick={() => { setMedia(null); setLink(''); }}
                                  className="ml-auto text-[11px] text-red-400 hover:text-red-600">✕</button>
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-base-content/35">
                        O arquivo é hospedado no servidor e enviado como link no e-mail — não como anexo direto.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <input
                        className="input w-full"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://drive.google.com/... ou https://hipertms.com.br/demo"
                      />
                      <p className="mt-1 text-[11px] text-base-content/35">
                        Links do Google Drive, Dropbox, site ou qualquer URL pública.
                      </p>
                    </div>
                  )}

                  {/* Quando enviar o link */}
                  {(link || media) && (
                    <div className="mt-3 rounded-xl border border-base-200 px-4 py-3">
                      <p className="mb-2 text-xs font-medium text-base-content/60">Quando enviar o link?</p>
                      <div className="flex flex-col gap-2">
                        <label className="flex cursor-pointer items-start gap-3">
                          <input type="radio" className="mt-0.5" checked={!sendLinkOnFirst}
                                 onChange={() => setSendLinkOnFirst(false)} />
                          <div>
                            <p className="text-sm font-medium text-base-content">Só após resposta <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Recomendado</span></p>
                            <p className="text-[11px] text-base-content/40">1º e-mail sem link → lead responde com interesse → Lia envia o link na conversa. Melhor entregabilidade.</p>
                          </div>
                        </label>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input type="radio" className="mt-0.5" checked={sendLinkOnFirst}
                                 onChange={() => setSendLinkOnFirst(true)} />
                          <div>
                            <p className="text-sm text-base-content/70">No 1º e-mail</p>
                            <p className="text-[11px] text-base-content/40">Envia o link direto. Mais risco de cair em spam.</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Destinatários */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    Destinatários <span className="text-error">*</span>
                  </label>
                  <div className="mb-2 flex rounded-lg border border-base-200 overflow-hidden text-xs font-medium">
                    <button type="button" onClick={() => setFromContacts(false)}
                      className={`flex-1 py-2 transition-colors ${!fromContacts ? 'bg-blue-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}>
                      ✍️ Digitar lista
                    </button>
                    <button type="button" onClick={() => setFromContacts(true)}
                      className={`flex-1 py-2 transition-colors ${fromContacts ? 'bg-blue-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}>
                      👥 Contatos com e-mail
                    </button>
                  </div>
                  {!fromContacts ? (
                    <>
                      <textarea
                        className="input w-full py-2 text-sm font-mono"
                        style={{ minHeight: '120px', resize: 'vertical' }}
                        placeholder={'joao@empresa.com\nmaria@transportadora.com.br\ncontato@logistica.com'}
                        value={emailsText}
                        onChange={(e) => setEmailsText(e.target.value)}
                        required={!fromContacts}
                      />
                      <p className="mt-1 text-[11px] text-base-content/40">
                        Um e-mail por linha · <strong>{emailsText.split('\n').filter((l) => l.includes('@')).length}</strong> e-mail(s) detectado(s)
                      </p>
                    </>
                  ) : (
                    <p className="rounded-lg bg-base-100 px-3 py-2.5 text-xs text-base-content/50">
                      Disparado para todos os contatos ativos com e-mail cadastrado. Opted-out excluídos automaticamente.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Mensagem WhatsApp */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    Mensagem
                    <span className="ml-2 font-normal text-base-content/30">use {'{{nome}}'} e {'{{saudacao}}'}</span>
                  </label>
                  <textarea
                    className="input w-full py-2"
                    style={{ minHeight: '100px', resize: 'vertical' }}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    required
                  />
                </div>

                {/* Destinatários WA — seletor de público */}
                <div>
                  <div className="mb-2 text-sm text-base-content/70">Quem vai receber?</div>
                  <div className="mb-2 flex gap-1 rounded-lg bg-base-200 p-1 text-sm">
                    {([['todos', 'Todos ativos'], ['tag', 'Por tag'], ['manual', 'Manual']] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setAudience(k)}
                        className={`flex-1 rounded-md py-1.5 transition-colors ${
                          audience === k ? 'bg-brand-500 text-white' : 'text-base-content/60 hover:text-base-content'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {audience === 'tag' && (
                    <div>
                      {tags.length === 0 ? (
                        <p className="text-xs text-base-content/40">Nenhuma tag ainda — crie tags na tela de Contatos.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {tags.map((t) => (
                            <button
                              key={t.tag}
                              type="button"
                              onClick={() => setAudienceTag(audienceTag === t.tag ? '' : t.tag)}
                              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                audienceTag === t.tag ? 'bg-brand-500 text-white' : 'border border-base-300 text-base-content/70 hover:bg-base-100'
                              }`}
                            >
                              {t.tag} <span className="opacity-60">{t.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {audienceTag && (
                        <div className="mt-2 rounded-lg bg-base-200 px-3 py-2 text-xs text-base-content/70">
                          → <strong className="text-base-content">{tags.find((t) => t.tag === audienceTag)?.count ?? 0} contatos</strong> com a tag "{audienceTag}" · opt-out é excluído no envio.
                        </div>
                      )}
                    </div>
                  )}

                  {audience === 'manual' && (
                    <textarea
                      className="input w-full py-2 font-mono text-sm"
                      style={{ minHeight: '90px', resize: 'vertical' }}
                      placeholder="Um telefone por linha (5511...)"
                      value={phonesText}
                      onChange={(e) => setPhonesText(e.target.value)}
                    />
                  )}
                </div>

                {/* Link + Anexo lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-base-content/60">Link (opcional)</label>
                    <input className="input w-full" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-base-content/60">Anexo (PDF/Word)</label>
                    <div className="flex flex-col gap-1">
                      <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                             onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} className="text-xs" />
                      {uploading && <span className="text-xs text-base-content/40">enviando...</span>}
                      {media && (
                        <>
                          <span className="text-xs text-emerald-600">✅ arquivo enviado</span>
                          <input
                            className="input mt-1 w-full text-xs"
                            value={media.name}
                            onChange={(e) => setMedia({ ...media, name: e.target.value })}
                            placeholder="Nome do anexo (ex.: Nossa apresentação)"
                            title="Nome que aparece pro cliente na mensagem"
                          />
                          <span className="text-[10px] text-base-content/35">É esse nome que vai antes do link do PDF na mensagem.</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-base-content/35">
                  Número: {numbers[0] ? `${numbers[0].sentToday}/${numbers[0].dailyLimit} hoje` : '—'} · delay 30–90s · anti-ban ativo
                </p>
              </>
            )}

            {/* Quantidade */}
            <div className="rounded-xl border border-base-200 px-4 py-3">
              <label className="mb-2 block text-xs font-medium text-base-content/60">Quantos enviar?</label>
              <div className="flex items-center gap-4 text-sm text-base-content/70">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={limitMode === 'all'} onChange={() => setLimitMode('all')} />
                  Todos (até o limite diário)
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" checked={limitMode === 'limit'} onChange={() => setLimitMode('limit')} />
                  Só
                  <input type="number" min={1} disabled={limitMode !== 'limit'}
                         value={sendLimit} onChange={(e) => setSendLimit(Number(e.target.value))}
                         className="input w-20 disabled:opacity-40" />
                </label>
              </div>
            </div>

            {channel === 'email' && (
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
                ⏱️ <strong>Anti-spam ativo:</strong> delay 90–180s entre envios · máx 50/dia · horário 8h–18h · link de opt-out em todos os e-mails.
              </div>
            )}

            </div>{/* fim px-7 py-5 */}

            {/* Footer fixo */}
            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-base-200 px-7 py-4"
                 style={{ background: 'var(--surface-elevated)' }}>
              <Button type="button" variant="ghost" onClick={() => { setShow(false); resetForm(); }}>Cancelar</Button>
              <Button loading={busy} className="px-6">
                {busy ? 'Criando...' : 'Criar campanha'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* modal de detalhe da campanha (resultados) */}
      <Modal
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={detail?.campaign?.name || 'Campanha'}
        size="lg"
      >
        {detail && (
          <>
            <p className="mb-2 whitespace-pre-line rounded-lg bg-base-200 px-3 py-2 text-xs text-base-content/70">
              {detail.campaign.template}
            </p>
            {(detail.campaign.subject || detail.campaign.mediaName || detail.campaign.link) && (
              <div className="mb-3 space-y-1 text-xs text-base-content/60">
                {detail.campaign.subject && (
                  <div>📧 Assunto: <span className="text-base-content/80">{detail.campaign.subject}</span></div>
                )}
                {detail.campaign.mediaName && (
                  <div>📎 Anexo: <span className="text-base-content/80">{detail.campaign.mediaName}</span></div>
                )}
                {detail.campaign.link && (
                  <div className="truncate">🔗 Link: <span className="text-base-content/80">{detail.campaign.link}</span></div>
                )}
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {Object.entries(detail.counts || {}).map(([s, n]) => (
                <StatusBadge key={s} tone={targetTone(s)}>
                  {s}: {n as number}
                </StatusBadge>
              ))}
              {Object.keys(detail.counts || {}).length === 0 && (
                <span className="text-xs text-base-content/40">Sem envios ainda.</span>
              )}
              {((detail.counts?.failed ?? 0) + (detail.counts?.skipped ?? 0)) > 0 && (
                <Button size="sm" variant="outline" className="ml-auto" onClick={resendFailed}>
                  ↻ Reenviar aos que falharam
                </Button>
              )}
            </div>
            {detailLoading ? (
              <div className="py-6 text-center text-sm text-base-content/50">Carregando destinatários…</div>
            ) : detail.targets?.length ? (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {detail.targets.map((t: any) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-base-200 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-base-content">{t.name || t.phone}</div>
                      {t.error && <div className="truncate text-[11px] text-red-500">{t.error}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.sentAt && (
                        <span className="text-[11px] text-base-content/40">
                          {new Date(t.sentAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                      <StatusBadge tone={targetTone(t.status)}>{t.status}</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            ) : detailError ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-4 text-center text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                Não foi possível carregar os destinatários.<br />
                O backend pode estar desatualizado — feche as janelas antigas e reinicie o servidor.
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-base-content/50">Sem destinatários.</div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
