import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import { displayPhone, toBrPhone } from '@/lib/phone';
import { listContacts, listTags, type TagCount, type Contact } from '@/features/contact';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button, Card, StatusBadge, Modal, PageContainer, PageHeader, Breadcrumb, Icon, Badge, statusVariant } from '@/shared/ui';

interface Campaign {
  id: string;
  name: string;
  channel?: string;
  template: string;
  subject?: string | null;
  status: string;
  scheduledAt?: string | null;
  counts: Record<string, number>;
}
interface SenderNumber { phone: string; sentToday: number; dailyLimit: number; }

type Channel = 'whatsapp' | 'email';

// Date → string aceita pelo <input type="datetime-local"> (horário LOCAL).
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// rótulo do dia no dropdown: Hoje / Amanhã / dia da semana + data
function dayLabel(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  if (offset === 0) return `Hoje (${data})`;
  if (offset === 1) return `Amanhã (${data})`;
  const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} (${data})`;
}

// Validação da campanha (Zod). Mantém a máquina do form intacta — só checa antes
// de enviar e devolve erros por campo (name / message / emailSubject / recipients).
const campaignSchema = z
  .object({
    channel: z.string(),
    name: z.string().trim().min(1, 'Informe o nome da campanha'),
    template: z.string(),
    emailSubject: z.string(),
    emailTemplate: z.string(),
    fromContacts: z.boolean(),
    emailCount: z.number(),
    audience: z.string(),
    audienceTag: z.string(),
    recipientCount: z.number(),
  })
  .superRefine((v, ctx) => {
    if (v.channel === 'email') {
      if (!v.emailSubject.trim()) ctx.addIssue({ code: 'custom', path: ['emailSubject'], message: 'Informe o assunto' });
      if (!v.emailTemplate.trim()) ctx.addIssue({ code: 'custom', path: ['message'], message: 'Escreva a mensagem do e-mail' });
      if (!v.fromContacts && v.emailCount === 0) ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'Adicione ao menos um e-mail válido' });
    } else {
      if (!v.template.trim()) ctx.addIssue({ code: 'custom', path: ['message'], message: 'Escreva a mensagem' });
      if (v.audience === 'tag' && !v.audienceTag) ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'Escolha uma tag' });
      if (v.audience === 'manual' && v.recipientCount === 0) ctx.addIssue({ code: 'custom', path: ['recipients'], message: 'Selecione ao menos um contato ou avulso' });
    }
  });

// validação real de e-mail (em vez de só checar '@')
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

export function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [numbers, setNumbers] = useState<SenderNumber[]>([]);
  // seleção em massa + visão de arquivadas
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archivedView, setArchivedView] = useState(false);
  // agendamento da nova campanha (datetime-local) + janela de envio do tenant
  const [scheduledAt, setScheduledAt] = useState('');
  const [schedEnabled, setSchedEnabled] = useState(false);
  const [schedDayOffset, setSchedDayOffset] = useState(0);
  const [schedHour, setSchedHour] = useState<number | null>(null);
  const [schedMinute, setSchedMinute] = useState(0);
  const [settings, setSettings] = useState<{ waStartHour: number; waEndHour: number; emailStartHour: number; emailEndHour: number } | null>(null);
  const [showHours, setShowHours] = useState(false);
  const [show, setShow] = useState(false);
  const [channel, setChannel] = useState<Channel>('whatsapp');

  // WhatsApp fields
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('{{saudacao}}, {{nome}}! Aqui é a Lia do HiperTMS. Posso te apresentar nosso sistema de gestão de fretes?');
  // WhatsApp: default "todos os contatos". Email: default lista manual (fromContacts=false)
  // pois normalmente não há e-mails cadastrados nos contatos ainda
  const [fromContacts, setFromContacts] = useState(true);
  // público do WhatsApp: todos ativos | por tag | manual
  const [audience, setAudience] = useState<'todos' | 'tag' | 'manual'>('todos');
  const [audienceTag, setAudienceTag] = useState('');
  // aba Manual: seletor de contatos + avulsos
  const [manualContacts, setManualContacts] = useState<Contact[]>([]);
  const [manualLoaded, setManualLoaded] = useState(false);
  const [manualError, setManualError] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [manualSort, setManualSort] = useState<'az' | 'za'>('az');
  const [manualSnapshot, setManualSnapshot] = useState<Map<string, { phone: string; name?: string }> | null>(null);
  const [manualSelected, setManualSelected] = useState<Map<string, { phone: string; name?: string }>>(new Map());
  const [avulsos, setAvulsos] = useState<string[]>([]);
  const [avulsoInput, setAvulsoInput] = useState('');
  const [seedPhones, setSeedPhones] = useState<{ phone: string; name?: string }[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const location = useLocation();
  // link fixo: memoriza o último link usado (não precisa redigitar a cada campanha)
  const [link, setLink] = useState(() => localStorage.getItem('nexa_campaign_link') ?? '');
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // edição de campanha em rascunho (modal compacto)
  const [editC, setEditC] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editMsg, setEditMsg] = useState('');
  const [editBusy, setEditBusy] = useState(false);
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
      const [c, n, s] = await Promise.allSettled([
        api.get('/campaigns', { params: { archived: archivedView } }),
        api.get('/sender/numbers'),
        api.get('/sender/settings'),
      ]);
      if (c.status === 'fulfilled') setItems(c.value.data);
      if (n.status === 'fulfilled') setNumbers(n.value.data);
      if (s.status === 'fulfilled') setSettings(s.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    try {
      const r = await api.put('/sender/settings', settings);
      setSettings(r.data);
      toast.success('Horários de envio atualizados.');
      setShowHours(false);
    } catch {
      toast.error('Erro ao salvar os horários.');
    }
  }
  useEffect(() => {
    setSelected(new Set()); // troca de visão limpa a seleção
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivedView]);

  // ----- seleção em massa -----
  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((c) => c.id))));
  }
  const allSelected = items.length > 0 && selected.size === items.length;

  async function archiveSelected(archive: boolean) {
    const ids = [...selected];
    if (!ids.length) return;
    await api.post(`/campaigns/${archive ? 'archive' : 'unarchive'}`, { ids });
    toast.success(archive ? `${ids.length} arquivada(s).` : `${ids.length} desarquivada(s).`);
    setSelected(new Set());
    await load();
  }
  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirm({
      title: 'Excluir campanhas',
      message: `Excluir ${ids.length} campanha(s) selecionada(s)? O histórico de envios delas também será apagado. Esta ação não pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    await api.post('/campaigns/bulk-delete', { ids });
    toast.success(`${ids.length} campanha(s) excluída(s).`);
    setSelected(new Set());
    await load();
  }

  function resetForm() {
    setName(''); setLink(localStorage.getItem('nexa_campaign_link') ?? ''); setMedia(null); setLimitMode('all');
    setEmailsText(''); setEmailSubject('');
    setChannel('whatsapp'); setFromContacts(true); setEmailLinkMode('upload'); setSendLinkOnFirst(false);
    setAudience('todos'); setAudienceTag('');
    setScheduledAt(''); setSchedEnabled(false); setSchedDayOffset(0); setSchedHour(null); setSchedMinute(0);
    setManualSelected(new Map()); setAvulsos([]); setAvulsoInput(''); setManualSearch(''); setSeedPhones([]);
    setManualLoaded(false); setManualError(false); setManualOpen(false);
    setManualSort('az'); setManualSnapshot(null);
    setFormErrors({});
  }

  // janela permitida do canal atual (puxa as settings do tenant; cai no default)
  const sendWindow = channel === 'email'
    ? { start: settings?.emailStartHour ?? 8, end: settings?.emailEndHour ?? 18 }
    : { start: settings?.waStartHour ?? 7, end: settings?.waEndHour ?? 19 };

  // horas disponíveis pra um dia (limitadas à janela; "hoje" inclui a hora atual p/ minutos futuros)
  function hoursFor(offset: number): number[] {
    const hours: number[] = [];
    for (let h = sendWindow.start; h < sendWindow.end; h++) hours.push(h);
    if (offset === 0) {
      const nowH = new Date().getHours();
      return hours.filter((h) => h >= nowH);
    }
    return hours;
  }

  // minutos disponíveis: lista completa, minuto a minuto (00 a 59)
  function minutesFor(_offset: number, _hour: number | null): number[] {
    return Array.from({ length: 60 }, (_, i) => i);
  }

  // recalcula scheduledAt a partir de dia + hora + minuto escolhidos
  function recomputeSchedule(offset: number, hour: number | null, minute: number) {
    if (hour == null) return setScheduledAt('');
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    setScheduledAt(toLocalInput(d));
  }

  function toggleSchedule(on: boolean) {
    setSchedEnabled(on);
    if (!on) { setSchedHour(null); setSchedMinute(0); setScheduledAt(''); }
  }
  function pickDay(offset: number) {
    setSchedDayOffset(offset);
    // revalida hora/minuto pro novo dia (ex.: virou "hoje")
    const validH = hoursFor(offset);
    const h = schedHour != null && validH.includes(schedHour) ? schedHour : null;
    const validM = minutesFor(offset, h);
    const m = validM.includes(schedMinute) ? schedMinute : (validM[0] ?? 0);
    setSchedHour(h); setSchedMinute(m);
    recomputeSchedule(offset, h, m);
  }
  function pickHour(hour: number) {
    setSchedHour(hour);
    const validM = minutesFor(schedDayOffset, hour);
    const m = validM.includes(schedMinute) ? schedMinute : (validM[0] ?? 0);
    setSchedMinute(m);
    recomputeSchedule(schedDayOffset, hour, m);
  }
  function pickMinute(minute: number) {
    setSchedMinute(minute);
    recomputeSchedule(schedDayOffset, schedHour, minute);
  }

  // ----- aba Manual: seletor de contatos + avulsos -----
  const onlyDigits = (s: string) => s.replace(/\D/g, '');

  async function loadManualContacts() {
    setManualError(false);
    try {
      const r = await listContacts({ limit: 2000 });
      setManualContacts(r.items);
      setManualLoaded(true);
    } catch {
      setManualError(true);
      setManualLoaded(true); // sai do "carregando" e mostra o erro/retry
    }
  }
  // carrega a base de contatos quando a aba Manual abre (uma vez)
  useEffect(() => {
    if (audience !== 'manual' || channel !== 'whatsapp' || manualLoaded) return;
    loadManualContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, channel, manualLoaded]);

  // reconcilia telefones pré-preenchidos (vindo de Contatos / reenvio): casa com a base ou vira avulso
  useEffect(() => {
    if (!seedPhones.length || !manualLoaded) return;
    const byPhone = new Map(manualContacts.map((c) => [onlyDigits(c.phone), c]));
    const sel = new Map(manualSelected);
    const extra: string[] = [];
    for (const sp of seedPhones) {
      const p = onlyDigits(sp.phone);
      const c = byPhone.get(p);
      if (c && c.status !== 'opted_out') sel.set(c.id, { phone: c.phone, name: c.name ?? undefined });
      else if (p.length >= 12 && !extra.includes(p)) extra.push(p);
    }
    setManualSelected(sel);
    setAvulsos((prev) => [...new Set([...prev, ...extra])]);
    setSeedPhones([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPhones, manualLoaded]);

  const manualFiltered = manualContacts
    .filter((c) => {
      const q = manualSearch.trim().toLowerCase();
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q)
        || c.phone.includes(onlyDigits(q))
        || (c.company || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const cmp = (a.name || a.phone).localeCompare(b.name || b.phone, 'pt-BR', { sensitivity: 'base' });
      return manualSort === 'za' ? -cmp : cmp;
    });

  // abre o dropdown guardando um snapshot (pra o Cancelar reverter)
  function openManual() {
    if (!manualOpen) setManualSnapshot(new Map(manualSelected));
    setManualOpen((o) => !o);
  }
  function cancelManual() {
    if (manualSnapshot) setManualSelected(manualSnapshot);
    setManualOpen(false);
  }
  const selectableVisible = manualFiltered.filter((c) => c.status !== 'opted_out');
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((c) => manualSelected.has(c.id));

  function toggleManualContact(c: Contact) {
    setManualSelected((prev) => {
      const n = new Map(prev);
      n.has(c.id) ? n.delete(c.id) : n.set(c.id, { phone: c.phone, name: c.name ?? undefined });
      return n;
    });
  }
  function toggleAllVisible() {
    setManualSelected((prev) => {
      const n = new Map(prev);
      if (allVisibleSelected) selectableVisible.forEach((c) => n.delete(c.id));
      else selectableVisible.forEach((c) => n.set(c.id, { phone: c.phone, name: c.name ?? undefined }));
      return n;
    });
  }
  function addAvulso() {
    const p = toBrPhone(avulsoInput); // aceita DDD+número, adiciona o 55
    if (p.length < 12) { toast.error('Telefone inválido — informe DDD + número.'); return; }
    const selPhones = new Set([...manualSelected.values()].map((v) => onlyDigits(v.phone)));
    if (avulsos.includes(p) || selPhones.has(p)) { toast.info('Esse telefone já está na lista.'); return; }
    setAvulsos((a) => [...a, p]);
    setAvulsoInput('');
  }
  // total de destinatários (avulsos já não duplicam selecionados)
  const manualTotal = manualSelected.size + avulsos.filter((p) => !new Set([...manualSelected.values()].map((v) => onlyDigits(v.phone))).has(p)).length;

  // carrega as tags para o seletor "por tag"
  useEffect(() => {
    listTags().then(setTags).catch(() => {});
  }, []);

  // recebe a seleção vinda da tela de Contatos ("Criar campanha com selecionados")
  useEffect(() => {
    const st = location.state as { phones?: { phone: string; name?: string }[] } | null;
    if (st?.phones?.length) {
      setSeedPhones(st.phones);
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

  // mantém o detalhe atualizado ao vivo enquanto o modal está aberto (sem piscar o loading)
  useEffect(() => {
    if (!showDetail || !detail?.campaign?.id) return;
    const id = detail.campaign.id;
    const t = setInterval(async () => {
      try {
        const r = await api.get(`/campaigns/${id}`);
        setDetail((cur: any) => (cur?.campaign?.id === id ? r.data : cur));
      } catch {
        /* silencioso — não atrapalha o modal */
      }
    }, 6000);
    return () => clearInterval(t);
  }, [showDetail, detail?.campaign?.id]);

  const targetTone = (s: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' =>
    s === 'sent' ? 'success'
      : s === 'failed' ? 'danger'
      : s === 'skipped' ? 'warning'
      : s === 'queued' || s === 'sending' ? 'info'
      : 'neutral';

  // chip de engajamento (entregue/lido/respondeu) a partir do ack + replied
  const engChip = (t: any): { label: string; cls: string } | null => {
    if (t?.replied) return { label: 'Respondeu', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15' };
    if (t?.ack >= 3) return { label: 'Lido', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15' };
    if (t?.ack >= 2) return { label: 'Entregue', cls: 'bg-base-200 text-base-content/60' };
    return null;
  };
  const outcomeLabel = (o: string) =>
    ({ won: 'Ganho', lost: 'Perdido', no_response: 'Sem resposta', opt_out: 'Opt-out', em_aberto: 'Em aberto' } as Record<string, string>)[o] || o;

  // pré-preenche o "Nova campanha" só com os que falharam/pularam
  function resendFailed() {
    const failed = (detail?.targets || []).filter((t: any) => t.status === 'failed' || t.status === 'skipped');
    if (failed.length === 0) { toast.info('Nenhum envio falhou nesta campanha.'); return; }
    setName(`Reenvio · ${detail.campaign.name}`);
    setTemplate(detail.campaign.template || template);
    setSeedPhones(failed.map((t: any) => ({ phone: t.phone })));
    setAudience('manual');
    setChannel('whatsapp');
    setShowDetail(false);
    setShow(true);
  }

  // Clonar: pré-preenche o form de Nova campanha com nome/mensagem/canal (cria nova).
  function cloneCampaign(c: any) {
    resetForm();
    setName(`Cópia de ${c.name}`);
    if (c.channel === 'email') {
      setChannel('email');
      setEmailTemplate(c.template || '');
      if (c.subject) setEmailSubject(c.subject);
    } else {
      setChannel('whatsapp');
      setTemplate(c.template || '');
    }
    setShow(true);
  }

  // Editar (só rascunho): abre modal compacto com nome + mensagem.
  function openEditCampaign(c: any) {
    setEditC(c);
    setEditName(c.name || '');
    setEditMsg(c.template || '');
  }
  async function saveEditCampaign() {
    if (!editC) return;
    setEditBusy(true);
    try {
      await api.patch(`/campaigns/${editC.id}`, { name: editName.trim(), template: editMsg.trim() });
      toast.success('Campanha atualizada!');
      setEditC(null);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao editar a campanha.');
    } finally {
      setEditBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    // validação (Zod) — bloqueia o envio e mostra os erros, sem mexer no resto do fluxo
    const emailCount = channel === 'email' && !fromContacts
      ? emailsText.split('\n').map((l) => l.trim()).filter((l) => isEmail(l)).length
      : 0;
    const recipientCount = manualSelected.size + avulsos.length;
    const check = campaignSchema.safeParse({
      channel, name, template, emailSubject, emailTemplate, fromContacts,
      emailCount, audience, audienceTag, recipientCount,
    });
    if (!check.success) {
      const errs: Record<string, string> = {};
      for (const issue of check.error.issues) errs[String(issue.path[0])] = issue.message;
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
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
        else payload.emails = emailsText.split('\n').map((l) => l.trim()).filter((l) => isEmail(l)).map((e) => ({ email: e }));
        if (link.trim()) { payload.link = link.trim(); payload.sendLinkOnFirst = sendLinkOnFirst; }
        if (limitMode === 'limit') payload.sendLimit = sendLimit;
        if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
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
          // união sem duplicar: contatos selecionados (com nome) + avulsos
          const fromSel = [...manualSelected.values()].map((v) => ({ phone: onlyDigits(v.phone), name: v.name }));
          const seenPhones = new Set(fromSel.map((c) => c.phone));
          const extras = avulsos.filter((p) => !seenPhones.has(p)).map((p) => ({ phone: p }));
          payload.phones = [...fromSel, ...extras];
        }
        if (link.trim()) payload.link = link.trim();
        if (media) { payload.mediaUrl = media.url; payload.mediaName = media.name; }
        if (limitMode === 'limit') payload.sendLimit = sendLimit;
        if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
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
    toast.success('Campanha iniciada');
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
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Disparo' }]} />}
        title="Disparo de Leads"
        subtitle={
          <>
            WhatsApp: {settings ? `${settings.waStartHour}h–${settings.waEndHour}h` : '—'} · {numbers.map((n) => `${displayPhone(n.phone)}: ${n.sentToday}/${n.dailyLimit} hoje`).join(' · ') || 'sem número'} &nbsp;|&nbsp; E-mail: {settings ? `${settings.emailStartHour}h–${settings.emailEndHour}h` : '—'} · 50/dia · delay 90–180s (anti-spam)
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setShowHours(true)}>
              <Icon name="calendar" className="h-4 w-4" /> Horários
            </Button>
            <Button onClick={() => setShow(true)}>+ Nova campanha</Button>
          </>
        }
      />

      {/* modal: janela de horário de envio (por tenant, por canal) */}
      <Modal open={showHours} onClose={() => setShowHours(false)} title="Horários de envio" size="sm">
        {settings && (
          <form onSubmit={saveSettings} className="space-y-4">
            <p className="text-xs text-base-content/55">
              Janela em que o sistema dispara (horário de Brasília). Fora dela, as campanhas ficam
              em espera — ajuda no anti-bloqueio e no bom senso (LGPD). Vale pra todas as campanhas.
            </p>
            {([
              ['WhatsApp', 'waStartHour', 'waEndHour'],
              ['E-mail', 'emailStartHour', 'emailEndHour'],
            ] as const).map(([label, startKey, endKey]) => (
              <div key={label}>
                <div className="mb-1 text-xs font-medium text-base-content/60">{label}</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={23}
                    value={settings[startKey]}
                    onChange={(e) => setSettings({ ...settings, [startKey]: Number(e.target.value) })}
                    className="input !w-20 text-center"
                  />
                  <span className="text-base-content/40">às</span>
                  <input
                    type="number" min={0} max={23}
                    value={settings[endKey]}
                    onChange={(e) => setSettings({ ...settings, [endKey]: Number(e.target.value) })}
                    className="input !w-20 text-center"
                  />
                  <span className="text-xs text-base-content/40">h</span>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setShowHours(false)}>Cancelar</Button>
              <Button>Salvar</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* barra: filtro Ativas/Arquivadas + ações em massa */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-base-300 p-0.5 text-xs font-medium">
          <button
            onClick={() => setArchivedView(false)}
            className={`rounded-md px-3 py-1.5 transition-colors ${!archivedView ? 'bg-brand-500 text-white' : 'text-base-content/60 hover:bg-base-200'}`}
          >
            Ativas
          </button>
          <button
            onClick={() => setArchivedView(true)}
            className={`rounded-md px-3 py-1.5 transition-colors ${archivedView ? 'bg-brand-500 text-white' : 'text-base-content/60 hover:bg-base-200'}`}
          >
            Arquivadas
          </button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-base-content/70">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-base-300 accent-brand-500"
              />
              Selecionar todos
            </label>
            {selected.size > 0 && (
              <>
                <span className="text-xs text-base-content/50">{selected.size} selecionada(s)</span>
                {archivedView ? (
                  <Button size="sm" variant="outline" onClick={() => archiveSelected(false)}>
                    <Icon name="undo" className="h-4 w-4" /> Desarquivar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => archiveSelected(true)}>
                    <Icon name="archive" className="h-4 w-4" /> Arquivar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={deleteSelected} className="text-red-500 hover:bg-red-50">
                  <Icon name="trash" className="h-4 w-4" /> Excluir
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {loading && <SkeletonList rows={3} />}
        {!loading && items.length === 0 && (
          archivedView ? (
            <EmptyState
              icon={<Icon name="archive" className="h-9 w-9" />}
              title="Nenhuma campanha arquivada"
              description="Campanhas que você arquivar ficam guardadas aqui, sem aparecer na lista de ativas."
            />
          ) : (
            <EmptyState
              icon={<Icon name="campaigns" className="h-9 w-9" />}
              title="Nenhuma campanha ainda"
              description="Crie uma campanha de WhatsApp ou e-mail para disparar para seus leads."
              action={<Button onClick={() => setShow(true)}>+ Nova campanha</Button>}
            />
          )
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
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSel(c.id)}
                    className="h-4 w-4 shrink-0 rounded border-base-300 accent-brand-500"
                    title="Selecionar"
                  />
                  <span className="font-semibold text-base-content">{c.name}</span>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  {isEmail
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700"><Icon name="mail" className="h-3 w-3" /> e-mail</span>
                    : <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700"><Icon name="inbox" className="h-3 w-3" /> WhatsApp</span>
                  }
                  {c.scheduledAt && new Date(c.scheduledAt).getTime() > Date.now() && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      <Icon name="calendar" className="h-3 w-3" /> Agendada {new Date(c.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!archivedView && c.status !== 'running' && c.status !== 'done' && (
                    <Button onClick={(e) => { e.stopPropagation(); start(c); }} size="sm"><Icon name="play" className="h-3.5 w-3.5" /> Iniciar</Button>
                  )}
                  {!archivedView && c.status === 'running' && (
                    <button onClick={(e) => { e.stopPropagation(); pause(c.id); }} className="inline-flex h-7 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs text-white hover:bg-amber-400"><Icon name="pause" className="h-3.5 w-3.5" /> Pausar</button>
                  )}
                  {!archivedView && c.status === 'draft' && (
                    <Button onClick={(e) => { e.stopPropagation(); openEditCampaign(c); }} variant="outline" size="sm" title="Editar campanha"><Icon name="edit" className="h-3.5 w-3.5" /> Editar</Button>
                  )}
                  <Button onClick={(e) => { e.stopPropagation(); cloneCampaign(c); }} variant="outline" size="sm" title="Duplicar campanha"><Icon name="campaigns" className="h-3.5 w-3.5" /> Clonar</Button>
                  <Button onClick={(e) => { e.stopPropagation(); del(c); }} title="Excluir campanha" variant="outline" size="icon-sm" className="text-red-500 hover:bg-red-50"><Icon name="trash" className="h-4 w-4" /></Button>
                </div>
              </div>
              {isEmail && c.subject && (
                <p className="mt-1 text-xs font-medium text-base-content/60">Assunto: {c.subject}</p>
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

      {editC && (
        <Modal open onClose={() => setEditC(null)} title="Editar campanha" size="sm">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">Nome</label>
              <input className="input w-full" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">Mensagem</label>
              <textarea className="input w-full py-2" style={{ minHeight: '110px', resize: 'vertical' }} value={editMsg} onChange={(e) => setEditMsg(e.target.value)} />
            </div>
            <p className="text-[11px] text-base-content/40">Só é possível editar campanha que ainda não foi iniciada.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setEditC(null)}>Cancelar</Button>
              <Button onClick={saveEditCampaign} loading={editBusy} disabled={!editName.trim() || !editMsg.trim()}>Salvar</Button>
            </div>
          </div>
        </Modal>
      )}

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
                      className="text-base-content/40 hover:text-base-content"><Icon name="close" className="h-5 w-5" /></button>
            </div>

            <div className="px-7 pt-5 pb-8 space-y-5">

            {/* Canal */}
            <div className="flex rounded-xl border border-base-200 overflow-hidden text-sm font-medium">
              <button
                type="button"
                onClick={() => { setChannel('whatsapp'); setFromContacts(true); }}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-colors ${channel === 'whatsapp' ? 'bg-green-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}
              >
                <Icon name="inbox" className="h-4 w-4" /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => { setChannel('email'); setFromContacts(false); }}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-colors ${channel === 'email' ? 'bg-blue-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}
              >
                <Icon name="mail" className="h-4 w-4" /> E-mail
              </button>
            </div>

            {/* Nome */}
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">Nome da campanha</label>
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Prospecção Junho" required />
              {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
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
                    Bom: "Gestão de fretes para transportadoras" &nbsp;·&nbsp; Evite: "OFERTA!!! Grátis por tempo limitado"
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
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2 transition-colors ${emailLinkMode === 'upload' ? 'bg-indigo-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}>
                      <Icon name="upload" className="h-4 w-4" /> Fazer upload do PDF
                    </button>
                    <button type="button" onClick={() => setEmailLinkMode('manual')}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2 transition-colors ${emailLinkMode === 'manual' ? 'bg-indigo-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}>
                      Colar link
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
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Icon name="check" className="h-3.5 w-3.5" /> {media.name}</span>
                          <span className="text-[11px] text-base-content/40 truncate">→ {media.url}</span>
                          <button type="button" onClick={() => { setMedia(null); setLink(''); }}
                                  className="ml-auto text-red-400 hover:text-red-600"><Icon name="close" className="h-3.5 w-3.5" /></button>
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
                      Digitar lista
                    </button>
                    <button type="button" onClick={() => setFromContacts(true)}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2 transition-colors ${fromContacts ? 'bg-blue-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}>
                      <Icon name="contacts" className="h-4 w-4" /> Contatos com e-mail
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
                        Um e-mail por linha · <strong>{emailsText.split('\n').filter((l) => isEmail(l)).length}</strong> e-mail(s) detectado(s)
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
                  {formErrors.message && <p className="mt-1 text-xs text-red-500">{formErrors.message}</p>}
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
                    <div className="space-y-2">
                      {/* seletor estilo filtro do Excel: clica no botão e abre a lista */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={openManual}
                          className="input flex w-full items-center justify-between text-sm"
                        >
                          <span className={manualSelected.size ? 'text-base-content' : 'text-base-content/50'}>
                            {manualSelected.size ? `${manualSelected.size} contato(s) selecionado(s)` : 'Selecionar contatos da base…'}
                          </span>
                          <Icon name="chevronDown" className={`h-4 w-4 shrink-0 text-base-content/40 transition-transform ${manualOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {manualOpen && (
                          <>
                            {/* backdrop: fecha ao clicar fora */}
                            <div className="fixed inset-0 z-10" onClick={() => setManualOpen(false)} />
                            <div className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-xl border border-base-200 bg-[var(--surface-elevated)] shadow-elevated">
                              {/* classificar A→Z / Z→A */}
                              <div className="border-b border-base-200 py-1">
                                <button type="button" onClick={() => setManualSort('az')}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-base-100 ${manualSort === 'az' ? 'font-semibold text-brand-600' : 'text-base-content/70'}`}>
                                  <span className="font-mono text-[10px]">A→Z</span> Classificar de A a Z
                                </button>
                                <button type="button" onClick={() => setManualSort('za')}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-base-100 ${manualSort === 'za' ? 'font-semibold text-brand-600' : 'text-base-content/70'}`}>
                                  <span className="font-mono text-[10px]">Z→A</span> Classificar de Z a A
                                </button>
                              </div>
                              {/* pesquisar */}
                              <div className="border-b border-base-200 p-2">
                                <input
                                  autoFocus
                                  className="input w-full text-sm"
                                  placeholder="Pesquisar"
                                  value={manualSearch}
                                  onChange={(e) => setManualSearch(e.target.value)}
                                />
                              </div>
                              {/* checklist */}
                              <div className="max-h-56 overflow-auto">
                                {manualLoaded && !manualError && selectableVisible.length > 0 && (
                                  <label className="flex cursor-pointer items-center gap-2.5 border-b border-base-200 px-3 py-2 hover:bg-base-100">
                                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="h-4 w-4 shrink-0 accent-brand-500" />
                                    <span className="text-sm font-medium text-base-content">(Selecionar Tudo)</span>
                                  </label>
                                )}
                                {!manualLoaded ? (
                                  <p className="px-3 py-6 text-center text-xs text-base-content/40">Carregando contatos…</p>
                                ) : manualError ? (
                                  <p className="px-3 py-6 text-center text-xs text-base-content/50">
                                    Não foi possível carregar os contatos.{' '}
                                    <button type="button" onClick={loadManualContacts} className="font-medium text-brand-600 hover:underline">tentar de novo</button>
                                  </p>
                                ) : manualFiltered.length === 0 ? (
                                  <p className="px-3 py-6 text-center text-xs text-base-content/40">Nenhum contato encontrado. Use "avulso" abaixo.</p>
                                ) : (
                                  manualFiltered.map((c) => {
                                    const optedOut = c.status === 'opted_out';
                                    const checked = manualSelected.has(c.id);
                                    const initials = (c.name || c.phone).trim().slice(0, 2).toUpperCase();
                                    return (
                                      <label
                                        key={c.id}
                                        className={`flex items-center gap-2.5 border-b border-base-200 px-3 py-2 last:border-0 ${
                                          optedOut ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-base-100'
                                        } ${checked ? 'bg-brand-500/[0.06]' : ''}`}
                                      >
                                        <input
                                          type="checkbox"
                                          disabled={optedOut}
                                          checked={checked}
                                          onChange={() => toggleManualContact(c)}
                                          className="h-4 w-4 shrink-0 accent-brand-500 disabled:opacity-40"
                                        />
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-base-200 text-[10px] font-semibold text-base-content/60">
                                          {initials}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-sm font-medium text-base-content">
                                            {c.name || '—'}
                                            {optedOut && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700">descadastrado</span>}
                                          </span>
                                          <span className="block truncate text-[11px] text-base-content/50">
                                            {displayPhone(c.phone)}{c.company ? ` · ${c.company}` : ''}
                                          </span>
                                        </span>
                                        {!!c.tags?.length && (
                                          <span className="flex shrink-0 flex-wrap justify-end gap-1">
                                            {c.tags.slice(0, 2).map((t) => (
                                              <span key={t} className="rounded-full bg-base-200 px-1.5 py-0.5 text-[9px] text-base-content/60">{t}</span>
                                            ))}
                                          </span>
                                        )}
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                              <div className="flex items-center justify-end gap-2 border-t border-base-200 p-2">
                                <button type="button" onClick={cancelManual} className="rounded-md border border-base-300 px-4 py-1 text-xs font-medium text-base-content/70 hover:bg-base-100">
                                  Cancelar
                                </button>
                                <button type="button" onClick={() => setManualOpen(false)} className="rounded-md bg-brand-500 px-5 py-1 text-xs font-semibold text-white hover:bg-brand-600">
                                  OK
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* adicionar avulso */}
                      <div className="flex items-center gap-2">
                        <input
                          className="input flex-1 text-sm"
                          placeholder="Adicionar avulso (DDD + número)"
                          value={avulsoInput}
                          onChange={(e) => setAvulsoInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAvulso(); } }}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={addAvulso}>
                          <Icon name="plus" className="h-4 w-4" /> Adicionar
                        </Button>
                      </div>
                      {avulsos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {avulsos.map((p) => (
                            <span key={p} className="inline-flex items-center gap-1 rounded-full bg-base-200 px-2 py-0.5 text-[11px] text-base-content/70">
                              {displayPhone(p)}
                              <button type="button" onClick={() => setAvulsos((a) => a.filter((x) => x !== p))} className="text-base-content/40 hover:text-red-500">
                                <Icon name="close" className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* rodapé somando */}
                      <div className="rounded-lg bg-base-200 px-3 py-2 text-xs text-base-content/70">
                        <strong className="text-base-content">{manualSelected.size}</strong> contato(s) + <strong className="text-base-content">{avulsos.length}</strong> avulso(s) = <strong className="text-brand-600">{manualTotal} destinatário(s)</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Link + Anexo lado a lado */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-base-content/60">Link (opcional · fica salvo)</label>
                    <input
                      className="input w-full"
                      value={link}
                      onChange={(e) => { setLink(e.target.value); localStorage.setItem('nexa_campaign_link', e.target.value); }}
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-base-content/60">Anexo (PDF/Word)</label>
                    <div className="flex flex-col gap-1">
                      <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                             onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} className="text-xs" />
                      {uploading && <span className="text-xs text-base-content/40">enviando...</span>}
                      {media && (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Icon name="check" className="h-3.5 w-3.5" /> arquivo enviado</span>
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

                <p className="text-[11px] text-base-content/70">
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

            {/* Agendamento (opcional) — dia + hora dentro do horário permitido */}
            <div className="rounded-xl border border-base-200 px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-base-content/70">
                <input
                  type="checkbox"
                  checked={schedEnabled}
                  onChange={(e) => toggleSchedule(e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                Agendar início
              </label>

              {/* aviso do horário permitido (janela do canal) */}
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <Icon name="alert" className="h-3.5 w-3.5" />
                Horário permitido: {sendWindow.start}h–{sendWindow.end}h ({channel === 'email' ? 'e-mail' : 'WhatsApp'})
              </div>

              {schedEnabled && (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-base-content/50">Dia</label>
                    <select
                      value={schedDayOffset}
                      onChange={(e) => pickDay(Number(e.target.value))}
                      className="input text-sm"
                    >
                      {Array.from({ length: 14 }, (_, i) => (
                        <option key={i} value={i}>{dayLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-base-content/50">Hora</label>
                    <select
                      value={schedHour ?? ''}
                      onChange={(e) => pickHour(Number(e.target.value))}
                      className="input text-sm"
                    >
                      <option value="" disabled>Escolha</option>
                      {hoursFor(schedDayOffset).map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-base-content/50">Minutos</label>
                    <select
                      value={schedMinute}
                      onChange={(e) => pickMinute(Number(e.target.value))}
                      disabled={schedHour == null}
                      className="input text-sm disabled:opacity-40"
                    >
                      {minutesFor(schedDayOffset, schedHour).map((m) => (
                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <p className="mt-2 text-[11px] text-base-content/40">
                {scheduledAt
                  ? `Dispara em ${new Date(scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
                  : `Sem agendar: você inicia manual e o envio acontece dentro do horário permitido (${sendWindow.start}h–${sendWindow.end}h).`}
              </p>
            </div>

            {channel === 'email' && (
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-700">
<strong>Anti-spam ativo:</strong> delay 90–180s entre envios · máx 50/dia · link de opt-out em todos os e-mails.
              </div>
            )}

            </div>{/* fim px-7 py-5 */}

            {Object.keys(formErrors).length > 0 && (
              <div className="border-t border-base-200 bg-red-50 px-7 py-3 text-sm text-red-600 dark:bg-red-500/10">
                Revise antes de criar: {Object.values(formErrors).join(' · ')}
              </div>
            )}

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
                  <div>Assunto: <span className="text-base-content/80">{detail.campaign.subject}</span></div>
                )}
                {detail.campaign.mediaName && (
                  <div>Anexo: <span className="text-base-content/80">{detail.campaign.mediaName}</span></div>
                )}
                {detail.campaign.link && (
                  <div className="truncate">Link: <span className="text-base-content/80">{detail.campaign.link}</span></div>
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
                  <Icon name="refresh" className="h-4 w-4" /> Reenviar aos que falharam
                </Button>
              )}
            </div>

            {detail.engagement && (
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-base-200 px-2 py-0.5 text-base-content/70">Entregue: {detail.engagement.delivered}</span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-500/15">Lido: {detail.engagement.read}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15">Respondeu: {detail.engagement.replied}</span>
              </div>
            )}

            {detail.conversion && detail.conversion.conversations > 0 && (
              <div className="mb-3 rounded-lg border border-base-200 px-3 py-2 text-xs text-base-content/70">
                <span className="font-medium text-base-content">Conversão:</span> {detail.conversion.conversations} conversa(s) originada(s)
                {Object.entries(detail.conversion.byOutcome).map(([k, v]) => (
                  <span key={k} className="ml-2">· {outcomeLabel(k)}: {v as number}</span>
                ))}
              </div>
            )}

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
                      <div className="truncate font-medium text-base-content">{t.name || displayPhone(t.phone)}</div>
                      {t.error && <div className="truncate text-[11px] text-red-500">{t.error}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.sentAt && (
                        <span className="text-[11px] text-base-content/40">
                          {new Date(t.sentAt).toLocaleString('pt-BR')}
                        </span>
                      )}
                      {engChip(t) && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${engChip(t)!.cls}`}>
                          {engChip(t)!.label}
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
    </PageContainer>
  );
}
