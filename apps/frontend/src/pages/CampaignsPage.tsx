import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useLocation, Link } from 'react-router-dom';
import { api } from '@/shared/lib/api';
import { displayPhone, toBrPhone } from '@/shared/lib/phone';
import { listContacts, listTags, type TagCount, type Contact } from '@/entities/contact';
import {
  type Campaign,
  type SenderNumber,
  type SenderSettings,
  type EmailAudience,
  listCampaigns,
  getCampaign,
  createWhatsappCampaign,
  createEmailCampaign,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  cancelCampaign,
  retryFailedTargets,
  resendAllTargets,
  getEmailAudience,
  deleteCampaign,
  removeCampaignTarget,
  bulkDeleteCampaigns,
  setCampaignsArchived,
  uploadCampaignMedia,
  listSenderNumbers,
  getSenderSettings,
  saveSenderSettings,
} from '@/entities/campaign';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { Button, Card, StatusBadge, Modal, Icon, Badge, statusVariant } from '@/shared/ui';
import { StandardListPage } from '@/components/shared/StandardListPage';
import { campaignStatusLabel, targetStatusLabel, skipReasonLabel } from '@/shared/lib/campaignLabels';

type Channel = 'whatsapp' | 'email';

// DISP-003: destinatários por página no painel expandido. Antes a tela baixava a
// campanha INTEIRA (e o polling repetia isso a cada 8s), o que numa campanha de
// milhares de leads virava um payload enorme a cada ciclo.
const PAGE_TARGETS = 50;

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

/**
 * Lê a lista colada no campo "Destinatários" e devolve os endereços que vão de
 * fato virar alvo — a MESMA conta que o rodapé mostra e que vai no payload.
 *
 * Duas coisas mudaram aqui em 13/08/2026:
 *
 * O contador não desduplicava. Colar uma planilha com o mesmo endereço repetido
 * (ou escrito "Joao@X.com" numa linha e "joao@x.com" noutra) mostrava "500
 * detectados" e a campanha nascia com menos, sem explicação nenhuma na tela. O
 * backend já normaliza e desduplica na entrada — a tela é que contava outra
 * coisa. É o mesmo princípio que o próprio createEmailCampaign registra: a tela
 * mostra quem vai receber e o envio tem que concordar com ela, senão a tela
 * mente e o operador confia no número que viu.
 *
 * E só quebrava por `\n`. Copiar de Outlook ou de uma coluna de planilha traz
 * "a@x.com; b@y.com" numa linha só, e o campo respondia "0 e-mail(s)
 * detectado(s)" para uma lista visivelmente cheia — parece tela quebrada, não
 * formato errado. Vírgula e ponto-e-vírgula agora separam igual à quebra de
 * linha; o texto de ajuda embaixo do campo continua pedindo um por linha.
 *
 * O `toLowerCase` casa com o normalizeEmail do backend, que é quem decide se
 * dois endereços são a mesma pessoa para opt-out e dedup.
 */
export function parseEmailList(texto: string): string[] {
  const vistos = new Set<string>();
  return texto
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(isEmail)
    .map((e) => e.toLowerCase())
    .filter((e) => (vistos.has(e) ? false : vistos.add(e)));
}

// ── Spintax: quantas mensagens diferentes o template gera ──────────────────────
// Espelha spinVariants() do backend (application/sender/spintax.ts). Aqui é só
// para o contador da tela; quem sorteia de verdade é o backend, no envio.
const spinVariants = (text: string): number => {
  let total = 1;
  for (const m of text.matchAll(/\{([^{}]*\|[^{}]*)\}/g)) total *= m[1].split('|').length;
  return total;
};

/**
 * Contador de variações abaixo do campo de mensagem.
 *
 * Existe porque texto idêntico repetido é o sinal mais forte de spam para o
 * WhatsApp — mais que a cadência de envio. O número serve de termômetro: com uma
 * lista de 300 e uma única versão do texto, o usuário precisa ver isso na hora de
 * escrever, não depois do número cair.
 */
const SpintaxHint: React.FC<{ text: string; recipients: number }> = ({ text, recipients }) => {
  const variants = spinVariants(text);
  const poucas = variants < 4 && recipients > 30;
  return (
    <p className={`mt-1 text-[11px] ${poucas ? 'text-amber-500' : 'text-base-content/35'}`}>
      {variants > 1 ? (
        <>
          {variants} versões diferentes desta mensagem.{' '}
          {poucas && 'Poucas para o tamanho da lista — some mais opções.'}
        </>
      ) : (
        <>
          Todos recebem o texto <strong>idêntico</strong>. Use{' '}
          <code className="rounded bg-base-200 px-1">{'{Oi|Olá|Bom dia}'}</code> para variar e reduzir
          o risco de bloqueio.
        </>
      )}
    </p>
  );
};

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
  const [settings, setSettings] = useState<SenderSettings | null>(null);
  // Pré-visualização de "Contatos com e-mail": quem vai receber, com busca.
  // TESTE: reenviar para quem já recebeu. Só aparece quando o ambiente libera.
  const [ignoreDedup, setIgnoreDedup] = useState(false);
  const [emailAudience, setEmailAudience] = useState<EmailAudience | null>(null);
  const [emailAudienceSearch, setEmailAudienceSearch] = useState('');
  const [emailAudienceLoading, setEmailAudienceLoading] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [show, setShow] = useState(false);
  // Quantos contatos ativos existem — mostrado no formulário para o operador
  // ver ANTES de criar que a base está vazia (null = ainda não consultado).
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [campaignType, setCampaignType] = useState<'message' | 'status'>('message');
  // status-only fields
  const [statusMediaUrl, setStatusMediaUrl] = useState('');

  // WhatsApp fields
  const [name, setName] = useState('');
  // F8: produto/parceiro da campanha. O lead herda na conversa e a Lia busca só
  // o conhecimento desse produto. Vazio = produto principal.
  const [productCode, setProductCode] = useState('');
  // Produtos que já têm conhecimento — sugestão + aviso de produto sem base.
  const [productCodes, setProductCodes] = useState<{ productCode: string; artigos: number }[]>([]);
  useEffect(() => {
    api.get('/knowledge/product-codes')
      .then((r) => setProductCodes(r.data ?? []))
      .catch(() => setProductCodes([])); // sugestão é conveniência, não pode quebrar a tela
  }, []);
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
  // expansão inline (estilo Excel): múltiplas campanhas podem estar expandidas ao mesmo tempo
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [expandedDataMap, setExpandedDataMap] = useState<Record<string, any>>({});
  const [expandedLoadingIds, setExpandedLoadingIds] = useState<Record<string, boolean>>({});
  const [expandedSearchMap, setExpandedSearchMap] = useState<Record<string, string>>({});
  // DISP-003: página atual da lista de destinatários, por campanha expandida.
  const [expandedPageMap, setExpandedPageMap] = useState<Record<string, number>>({});
  // Espelho de {busca, página} lido pelo polling (o setInterval não enxerga o state atual).
  const targetsViewRef = useRef<Record<string, { search: string; page: number }>>({});
  const searchTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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
  // edição inline: quando não-null abre o painel "nova campanha" já preenchido
  const [editingId, setEditingId] = useState<string | null>(null);
  // edição de campanha (modal compacto — só rename quando já há envios)
  const [editC, setEditC] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editMsg, setEditMsg] = useState('');
  const [editLink, setEditLink] = useState('');
  // DISP-019: horário agendado editável (vazio = dispara ao iniciar)
  const [editSchedule, setEditSchedule] = useState('');
  const [editMedia, setEditMedia] = useState<{ url: string; name: string } | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  // lista de destinatários no modal de edição
  const [editTargets, setEditTargets] = useState<any[]>([]);
  const [editTargetsOpen, setEditTargetsOpen] = useState(false);
  const [editTargetsLoading, setEditTargetsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();
  // timer para distinguir single-click (detalhe) de double-click (editar)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function uploadFile(file: File) {
    // O anexo é MATERIAL enviado junto com a mensagem (PDF/Word/imagem), não a
    // lista de destinatários. Subir o CSV de contatos aqui era o engano mais
    // comum: a campanha nascia sem ninguém e o link do arquivo ainda ia colado
    // na mensagem. Barrar com explicação vale mais que qualquer texto de ajuda.
    if (/\.(csv|txt|xlsx?|tsv)$/i.test(file.name)) {
      toast.error(
        'Planilha não é anexo. Para carregar a lista de envio use Contatos → Importar. ' +
        'Aqui vai só material (PDF, Word ou imagem) enviado junto com a mensagem.',
      );
      return;
    }
    setUploading(true);
    try {
      const m = await uploadCampaignMedia(file);
      setMedia({ url: m.url, name: m.name });
      // Para e-mail: o link é a URL do arquivo hospedado
      if (channel === 'email') setLink(m.url);
    } finally {
      setUploading(false);
    }
  }

  async function load() {
    try {
      const [c, n, s] = await Promise.allSettled([
        listCampaigns(archivedView),
        listSenderNumbers(),
        getSenderSettings(),
      ]);
      if (c.status === 'fulfilled') setItems(c.value);
      if (n.status === 'fulfilled') setNumbers(n.value);
      if (s.status === 'fulfilled') setSettings(s.value);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    try {
      const updated = await saveSenderSettings(settings);
      setSettings(updated);
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
    await setCampaignsArchived(ids, archive);
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
    await bulkDeleteCampaigns(ids);
    toast.success(`${ids.length} campanha(s) excluída(s).`);
    setSelected(new Set());
    await load();
  }

  function resetForm() {
    setEditingId(null); setEditC(null); setEditTargets([]); setEditTargetsOpen(false);
    setName(''); setLink(localStorage.getItem('nexa_campaign_link') ?? ''); setMedia(null); setLimitMode('all');
    setEmailsText(''); setEmailSubject('');
    setChannel('whatsapp'); setCampaignType('message'); setStatusMediaUrl('');
    setFromContacts(true); setEmailLinkMode('upload'); setSendLinkOnFirst(false);
    setAudience('todos'); setAudienceTag('');
    setScheduledAt(''); setSchedEnabled(false); setSchedDayOffset(0); setSchedHour(null); setSchedMinute(0);
    setManualSelected(new Map()); setAvulsos([]); setAvulsoInput(''); setManualSearch(''); setSeedPhones([]);
    setManualLoaded(false); setManualError(false); setManualOpen(false);
    setManualSort('az'); setManualSnapshot(null);
    setProductCode('');
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

  // Ao abrir o formulário, conta os contatos ativos. Serve para avisar de cara
  // que a base está vazia, em vez de deixar o operador preencher tudo e tomar
  // um 400 no final (foi o que aconteceu na prática, mais de uma vez).
  useEffect(() => {
    if (!show) return;
    let cancelado = false;
    listContacts({ limit: 1 })
      .then((r) => { if (!cancelado) setActiveCount(r.total ?? r.items.length); })
      .catch(() => { if (!cancelado) setActiveCount(null); });
    return () => { cancelado = true; };
  }, [show]);

  // Pré-visualização de "Contatos com e-mail". Só busca quando a aba está aberta —
  // não faz sentido pagar a consulta enquanto o operador digita uma lista à mão.
  // 300ms de espera na digitação: sem isso é uma requisição por tecla.
  useEffect(() => {
    if (!show || channel !== 'email' || !fromContacts) return;
    let cancelado = false;
    setEmailAudienceLoading(true);
    const t = setTimeout(() => {
      getEmailAudience({ search: emailAudienceSearch, limit: 50 })
        .then((r) => { if (!cancelado) setEmailAudience(r); })
        .catch(() => { if (!cancelado) setEmailAudience(null); })
        .finally(() => { if (!cancelado) setEmailAudienceLoading(false); });
    }, emailAudienceSearch ? 300 : 0);
    return () => { cancelado = true; clearTimeout(t); };
  }, [show, channel, fromContacts, emailAudienceSearch]);

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

  /**
   * DISP-003: carrega UMA página de destinatários, já filtrada no servidor.
   *
   * A busca e a página vivem em `targetsViewRef` (não só no state) porque o
   * polling roda dentro de um setInterval — lendo do state ele congelaria na
   * primeira página com a busca vazia a cada 8s.
   */
  async function loadExpandedTargets(campaignId: string, view?: { search?: string; page?: number }) {
    const cur = targetsViewRef.current[campaignId] ?? { search: '', page: 0 };
    const next = { search: view?.search ?? cur.search, page: view?.page ?? cur.page };
    targetsViewRef.current[campaignId] = next;
    const d = await getCampaign(campaignId, {
      limit: PAGE_TARGETS,
      offset: next.page * PAGE_TARGETS,
      search: next.search.trim() || undefined,
    });
    setExpandedDataMap((prev) => (prev[campaignId] ? { ...prev, [campaignId]: d } : prev));
    return d;
  }

  // expande/colapsa a linha inline (estilo Excel) — cada campanha independente
  async function toggleExpand(c: Campaign) {
    if (expandedIds[c.id]) {
      setExpandedIds((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
      setExpandedDataMap((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
      setExpandedSearchMap((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
      setExpandedPageMap((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
      delete targetsViewRef.current[c.id];
      return;
    }
    setExpandedIds((prev) => ({ ...prev, [c.id]: true }));
    setExpandedSearchMap((prev) => ({ ...prev, [c.id]: '' }));
    setExpandedPageMap((prev) => ({ ...prev, [c.id]: 0 }));
    setExpandedLoadingIds((prev) => ({ ...prev, [c.id]: true }));
    setExpandedDataMap((prev) => ({ ...prev, [c.id]: { campaign: c, targets: [], counts: c.counts } }));
    try {
      await loadExpandedTargets(c.id, { search: '', page: 0 });
    } catch {
      // mantém o placeholder
    } finally {
      setExpandedLoadingIds((prev) => { const n = { ...prev }; delete n[c.id]; return n; });
    }
  }

  // troca de página da lista de destinatários (a busca atual é preservada)
  async function goToTargetsPage(campaignId: string, page: number) {
    setExpandedPageMap((prev) => ({ ...prev, [campaignId]: page }));
    setExpandedLoadingIds((prev) => ({ ...prev, [campaignId]: true }));
    try {
      await loadExpandedTargets(campaignId, { page });
    } catch {
      toast.error('Erro ao carregar a página.');
    } finally {
      setExpandedLoadingIds((prev) => { const n = { ...prev }; delete n[campaignId]; return n; });
    }
  }

  // busca no servidor com debounce — sempre volta para a 1ª página
  function onTargetsSearchChange(campaignId: string, value: string) {
    setExpandedSearchMap((prev) => ({ ...prev, [campaignId]: value }));
    setExpandedPageMap((prev) => ({ ...prev, [campaignId]: 0 }));
    clearTimeout(searchTimersRef.current[campaignId]);
    searchTimersRef.current[campaignId] = setTimeout(() => {
      void loadExpandedTargets(campaignId, { search: value, page: 0 }).catch(() => {});
    }, 350);
  }

  // Single click → expandir inline | Double click → editar (só rascunho)
  function handleCardClick(c: Campaign) {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      const sentOnDblClick = c.counts?.sent ?? 0;
      const canFullEdit = c.status === 'draft' || (c.status === 'paused' && sentOnDblClick === 0);
      if (canFullEdit) openFullEdit(c); else openEditCampaign(c);
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      toggleExpand(c);
    }, 250);
  }

  // polling ao vivo para cada campanha expandida
  const expandedIdsCount = Object.keys(expandedIds).length;
  useEffect(() => {
    if (expandedIdsCount === 0) return;
    const ids = Object.keys(expandedIds);
    const t = setInterval(async () => {
      for (const id of ids) {
        // DISP-003: recarrega só a página/busca atual (lida do ref, não do state)
        try { await loadExpandedTargets(id); } catch { /* silencioso */ }
      }
    }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedIdsCount]);

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

  // DISP-002: recoloca na fila os alvos que falharam, NA PRÓPRIA campanha.
  // Antes isto pré-preenchia uma campanha NOVA e forçava canal 'whatsapp' — o que
  // quebrava campanha de e-mail (os telefones sintéticos `email:<addr>` eram todos
  // recusados) e ainda oferecia reenvio para 'skipped' (opt-out, blocklist, cliente
  // TMS), que são exclusões deliberadas.
  async function resendFailed(campaignId: string) {
    try {
      const r = await retryFailedTargets(campaignId);
      if (r.requeued === 0) { toast.info('Nenhum envio falhou nesta campanha.'); return; }
      toast.success(
        `${r.requeued} envio(s) de volta à fila.` +
        (r.status === 'paused' ? ' A campanha está pausada — clique em Iniciar para disparar.' : ''),
      );
      await load();
      const d = await getCampaign(campaignId);
      setExpandedDataMap((prev) => (prev[campaignId] ? { ...prev, [campaignId]: d } : prev));
    } catch {
      toast.error('Erro ao reenviar as falhas.');
    }
  }

  /**
   * Reenvio TOTAL — recoloca na fila TODOS os alvos, inclusive quem já recebeu.
   *
   * Ferramenta de TESTE. O botão só aparece quando o ambiente libera
   * (`settings.resendAllEnabled` ← `CAMPAIGN_RESEND_ALL_ENABLED` no servidor) e o
   * servidor recusa com 403 quando desligado — desativar depois não exige deploy
   * de código, só tirar a variável.
   *
   * A confirmação diz o número e o custo em vez de só perguntar "tem certeza?":
   * mandar a MESMA mensagem de novo para quem já recebeu é um dos sinais mais
   * fortes de spam, e quem clica precisa saber que o preço é a entregabilidade do
   * domínio — não é uma ação como as outras da tela.
   */
  async function resendAll(c: any) {
    const counts = (c?.counts ?? {}) as Record<string, number>;
    const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);
    const ok = await confirm({
      title: 'Reenviar para TODOS?',
      message:
        `Isto recoloca ${total} destinatário(s) na fila, incluindo quem já recebeu esta campanha. ` +
        'Repetir a mesma mensagem para a mesma pessoa é um dos sinais mais fortes de spam e derruba ' +
        'a entrega do domínio inteiro. Para falar de novo com esta base, prefira Clonar e mudar o texto.',
      confirmLabel: 'Reenviar para todos',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const r = await resendAllTargets(c.id);
      toast.success(
        `${r.requeued} destinatário(s) de volta à fila.` +
        (r.status === 'paused' ? ' A campanha está pausada — clique em Iniciar para disparar.' : ''),
      );
      await load();
      const d = await getCampaign(c.id);
      setExpandedDataMap((prev) => (prev[c.id] ? { ...prev, [c.id]: d } : prev));
    } catch {
      toast.error('Erro ao reenviar. O reenvio total pode estar desligado neste ambiente.');
    }
  }

  // Clonar: pré-preenche o form de Nova campanha com nome/mensagem/canal (cria nova).
  function cloneCampaign(c: any) {
    resetForm();
    setName(`Cópia de ${c.name}`);
    if (c.channel === 'email') {
      setChannel('email');
      setEmailTemplate(c.template || '');
      if (c.subject) setEmailSubject(c.subject);
    } else if (c.type === 'status') {
      setChannel('whatsapp');
      setCampaignType('status');
      setTemplate(c.template || '');
      if (c.mediaUrl) setStatusMediaUrl(c.mediaUrl);
    } else {
      setChannel('whatsapp');
      setCampaignType('message');
      setTemplate(c.template || '');
    }
    setShow(true);
  }

  // Editar inline: abre o painel "nova campanha" preenchido com dados da campanha existente.
  function openFullEdit(c: any) {
    resetForm();
    setEditingId(c.id);
    setName(c.name || '');
    if (c.channel === 'email') {
      setChannel('email');
      setEmailTemplate(c.template || '');
      if (c.subject) setEmailSubject(c.subject);
      if (c.link) setLink(c.link);
    } else if (c.type === 'status') {
      setChannel('whatsapp');
      setCampaignType('status');
      setTemplate(c.template || '');
      if (c.mediaUrl) setStatusMediaUrl(c.mediaUrl);
    } else {
      setChannel('whatsapp');
      setCampaignType('message');
      setTemplate(c.template || '');
      if (c.link) setLink(c.link);
      if (c.mediaUrl) setMedia({ url: c.mediaUrl, name: c.mediaName || c.mediaUrl.split('/').pop() || 'arquivo' });
    }
    if (c.scheduledAt) {
      const d = new Date(c.scheduledAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      setScheduledAt(local.toISOString().slice(0, 16));
      setSchedEnabled(true);
    }
    setShow(true);
    // carrega destinatários existentes para mostrar a lista com botão de remover
    loadEditTargets(c.id);
  }

  // Editar compacto: só rename — para campanhas com envios parciais.
  function openEditCampaign(c: any) {
    setEditC(c);
    setEditName(c.name || '');
    setEditMsg(c.template || '');
    setEditLink(c.link || '');
    // datetime-local espera horário LOCAL sem timezone; o backend guarda ISO/UTC
    setEditSchedule(c.scheduledAt ? toLocalInput(new Date(c.scheduledAt)) : '');
    setEditMedia(c.mediaUrl ? { url: c.mediaUrl, name: c.mediaName || c.mediaUrl.split('/').pop() || 'arquivo' } : null);
    setEditTargets([]);
    setEditTargetsOpen(false);
  }

  async function uploadEditFile(file: File) {
    setEditUploading(true);
    try {
      const m = await uploadCampaignMedia(file);
      setEditMedia({ url: m.url, name: m.name });
    } finally {
      setEditUploading(false);
    }
  }

  async function loadEditTargets(campaignId: string) {
    setEditTargetsLoading(true);
    try {
      const d = await getCampaign(campaignId);
      setEditTargets(d.targets || []);
      setEditTargetsOpen(true);
    } catch {
      toast.error('Erro ao carregar destinatários.');
    } finally {
      setEditTargetsLoading(false);
    }
  }

  async function removeEditTarget(targetId: string) {
    const campaignId = editC?.id ?? editingId;
    if (!campaignId) return;
    try {
      await removeCampaignTarget(campaignId, targetId);
      setEditTargets((prev) => prev.filter((t) => t.id !== targetId));
      toast.success('Destinatário removido.');
    } catch {
      toast.error('Erro ao remover destinatário.');
    }
  }
  async function saveEditCampaign() {
    if (!editC) return;
    setEditBusy(true);
    const sentCount = editC.counts?.sent ?? 0;
    const isFullEdit = editC.status === 'draft' || (editC.status === 'paused' && sentCount === 0);
    try {
      const payload: any = { name: editName.trim() };
      if (isFullEdit) {
        payload.template = editMsg.trim();
        payload.link = editLink.trim() || null;
        payload.mediaUrl = editMedia?.url ?? null;
        payload.mediaName = editMedia?.name ?? null;
      }
      // DISP-019: reagendamento vale sempre que nada foi enviado (regra própria,
      // independente do isFullEdit). Vazio = remove o agendamento.
      if (sentCount === 0) {
        payload.scheduledAt = editSchedule ? new Date(editSchedule).toISOString() : null;
      }
      await updateCampaign(editC.id, payload);
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

    // MODO EDIÇÃO: atualiza campos da campanha existente (destinatários gerenciados separadamente)
    if (editingId) {
      if (!name.trim()) { setFormErrors({ name: 'Informe o nome da campanha' }); return; }
      const msgBody = channel === 'email' ? emailTemplate : template;
      if (!msgBody.trim()) { setFormErrors({ message: 'Escreva a mensagem' }); return; }
      setFormErrors({});
      setBusy(true);
      try {
        await updateCampaign(editingId, {
          name: name.trim(),
          template: msgBody.trim(),
          link: link.trim() || null,
          mediaUrl: (campaignType === 'status' ? statusMediaUrl.trim() : media?.url) || null,
          mediaName: (campaignType === 'status' ? null : media?.name) || null,
        });
        setShow(false); resetForm();
        toast.success('Campanha atualizada!');
        await load();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Erro ao atualizar campanha.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Status WhatsApp: validação e criação independente
    if (channel === 'whatsapp' && campaignType === 'status') {
      if (!name.trim()) { setFormErrors({ name: 'Informe o nome da campanha' }); return; }
      if (!template.trim()) { setFormErrors({ message: 'Escreva o texto do Status' }); return; }
      setFormErrors({});
      setBusy(true);
      try {
        const payload: any = { name: name.trim(), template: template.trim(), type: 'status' };
        if (productCode.trim()) payload.productCode = productCode.trim();
        if (statusMediaUrl.trim()) payload.mediaUrl = statusMediaUrl.trim();
        if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
        await createWhatsappCampaign(payload);
        setShow(false); resetForm();
        toast.success('Campanha de Status criada! Inicie para publicar no WhatsApp.');
        await load();
      } catch {
        toast.error('Erro ao criar campanha de Status.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // validação (Zod) — bloqueia o envio e mostra os erros, sem mexer no resto do fluxo
    const emailCount = channel === 'email' && !fromContacts
      ? parseEmailList(emailsText).length
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
      let r: {
        included?: number;
        skippedOptOut?: number;
        skippedBounced?: number;
        skippedInvalid?: number;
        warnings?: string[];
        _count?: { targets?: number };
      };
      if (channel === 'email') {
        const payload: any = {
          name: name.trim(),
          subject: emailSubject.trim(),
          template: emailTemplate.trim(),
        };
        if (productCode.trim()) payload.productCode = productCode.trim();
        if (fromContacts) payload.fromContacts = true;
        else payload.emails = parseEmailList(emailsText).map((e) => ({ email: e }));
        if (link.trim()) { payload.link = link.trim(); payload.sendLinkOnFirst = sendLinkOnFirst; }
        if (limitMode === 'limit') payload.sendLimit = sendLimit;
        if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
        // Ferramenta de teste: manda de novo para quem já recebeu. O servidor ignora
        // este campo quando o ambiente não libera (ver podeIgnorarDedup).
        if (ignoreDedup) payload.ignoreDedup = true;
        r = await createEmailCampaign(payload);
      } else {
        const payload: any = { name: name.trim(), template: template.trim() };
        if (productCode.trim()) payload.productCode = productCode.trim();
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
        // sendLinkOnFirst agora vale no WhatsApp também (antes o backend ignorava
        // e o link ia SEMPRE na 1ª mensagem — risco de ban em disparo frio)
        if (link.trim()) { payload.link = link.trim(); payload.sendLinkOnFirst = sendLinkOnFirst; }
        if (media) { payload.mediaUrl = media.url; payload.mediaName = media.name; }
        if (limitMode === 'limit') payload.sendLimit = sendLimit;
        if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();
        r = await createWhatsappCampaign(payload);
      }
      setShow(false);
      resetForm();
      const inc = r.included ?? r._count?.targets ?? 0;
      // Cada motivo de exclusão aparece separado: "20 pulados" sem dizer por quê
      // faz o operador desconfiar do disparo. E-mail inválido e devolução são
      // exclusivos do canal de e-mail, então só aparecem quando houver.
      const pulados = [
        r.skippedOptOut ? `${r.skippedOptOut} por opt-out` : '',
        r.skippedBounced ? `${r.skippedBounced} com e-mail que devolveu` : '',
        r.skippedInvalid ? `${r.skippedInvalid} com endereço inválido` : '',
      ].filter(Boolean);
      toast.success(
        `Campanha criada! ${inc} contato(s)${pulados.length ? ` · pulados: ${pulados.join(', ')}` : ''}.`,
      );
      // Avisos que não impedem a criação — hoje só o de variação de texto. Vão
      // num toast separado e persistente: enfiados no de sucesso passariam
      // batido, e a campanha ainda não começou a disparar, então dá tempo de
      // editar o texto antes de dar Iniciar.
      for (const w of r.warnings ?? []) toast.warning(w, { duration: 15000 });
      await load();
    } catch (err: any) {
      const raw = err?.response?.data?.message;
      const detail = Array.isArray(raw) ? raw.join(' · ') : (raw ?? err?.message ?? '');
      console.error('[campaign] create error', err?.response?.data ?? err);
      toast.error(detail ? `Erro: ${detail}` : 'Erro ao criar campanha.');
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
    try {
      await startCampaign(c.id);
      toast.success('Campanha iniciada');
      await load();
    } catch (err: any) {
      // acting_destructive_blocked: o modal de break-glass já apareceu e o usuário cancelou — sem toast de erro
      if (err?.response?.data?.code !== 'acting_destructive_blocked') {
        toast.error(err?.response?.data?.message || 'Erro ao iniciar campanha.');
      }
    }
  }
  async function pause(id: string) { await pauseCampaign(id); toast.info('Campanha pausada.'); await load(); }

  // DISP-004: cancelar é irreversível para os alvos na fila (viram 'skipped'),
  // então confirma antes — e a confirmação diz quantos deixarão de receber, que
  // é a informação que falta para decidir.
  async function cancel(c: Campaign) {
    const naFila = (c.counts?.queued ?? 0) + (c.counts?.sending ?? 0);
    const ok = await confirm({
      title: 'Cancelar campanha?',
      message: naFila > 0
        ? `${naFila} contato(s) ainda não receberam e sairão da fila. Quem já recebeu não é afetado. Não dá para desfazer — só criando uma campanha nova.`
        : 'Não há mais ninguém na fila. A campanha será encerrada.',
      confirmLabel: 'Cancelar campanha',
      variant: 'danger',
    });
    if (!ok) return;
    const r = await cancelCampaign(c.id);
    toast.info(r.cancelled > 0 ? `Campanha cancelada — ${r.cancelled} contato(s) retirados da fila.` : 'Campanha encerrada.');
    await load();
  }
  async function del(c: Campaign) {
    const ok = await confirm({
      title: 'Excluir campanha',
      message: `Excluir a campanha "${c.name}"? O histórico de envios dela também será apagado.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteCampaign(c.id);
      toast.success('Campanha excluída.');
      await load();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  return (
    <StandardListPage
      title="Disparo de Leads"
      breadcrumb={[{ label: 'Início', path: '/dashboard' }, { label: 'Disparo' }]}
      isLoading={loading && items.length === 0}
      hasData={items.length > 0}
      entityName="campanha(s)"
      headerActions={
        <>
          <Button variant="outline" onClick={() => setShowHours(true)}>
            <Icon name="calendar" className="h-4 w-4" /> Horários
          </Button>
          <Button onClick={() => setShow(true)}>+ Nova campanha</Button>
        </>
      }
      topContent={
        settings ? (
          <p className="mb-2 text-xs text-base-content/50">
            WhatsApp: {settings.waStartHour}h–{settings.waEndHour}h
            {numbers.length > 0 && <> · {numbers.map((n) => `${displayPhone(n.phone)}: ${n.sentToday}/${n.dailyLimit} hoje`).join(' · ')}</>}
            {' '}| E-mail: {settings.emailStartHour}h–{settings.emailEndHour}h · 50/dia · delay 90–180s (anti-spam)
          </p>
        ) : null
      }
      extraToolbar={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
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
      }
    >

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
                <div className="mb-2 text-xs font-medium text-base-content/60">{label}</div>
                <div className="flex items-end gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-base-content/40">Início</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={0} max={23}
                        value={settings[startKey]}
                        onChange={(e) => setSettings({ ...settings, [startKey]: Number(e.target.value) })}
                        className="input !w-20 text-center"
                      />
                      <span className="text-xs text-base-content/40">h</span>
                    </div>
                  </div>
                  <span className="mb-2 text-base-content/30">→</span>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] text-base-content/40">Fim</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min={0} max={23}
                        value={settings[endKey]}
                        onChange={(e) => setSettings({ ...settings, [endKey]: Number(e.target.value) })}
                        className="input !w-20 text-center"
                      />
                      <span className="text-xs text-base-content/40">h</span>
                    </div>
                  </div>
                  {/* A conta já denunciava o problema — "(-14h de janela)" —
                      e o Salvar continuava ligado. Janela de 0h ou negativa faz
                      `hora >= início && hora < fim` ser falso nas 24 horas: a
                      campanha nunca sai e nada na tela explica. Agora o número
                      fica vermelho e o Salvar trava. Achado em 13/08/2026. */}
                  <span
                    className={`mb-2 text-[11px] ${
                      settings[endKey] - settings[startKey] <= 0
                        ? 'font-semibold text-error'
                        : 'text-base-content/30'
                    }`}
                  >
                    ({settings[endKey] - settings[startKey]}h de janela)
                  </span>
                </div>
              </div>
            ))}
            {(settings.waEndHour <= settings.waStartHour ||
              settings.emailEndHour <= settings.emailStartHour) && (
              <p className="rounded-lg bg-error/10 px-3 py-2 text-[11px] text-error">
                O início precisa ser menor que o fim. Nesta janela nenhuma campanha sairia —
                ela ficaria em espera para sempre. Janela que vira a meia-noite (ex.: 22h → 8h)
                não é suportada.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setShowHours(false)}>Cancelar</Button>
              <Button
                disabled={
                  settings.waEndHour <= settings.waStartHour ||
                  settings.emailEndHour <= settings.emailStartHour
                }
              >
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>

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
          const isEmailCh = c.channel === 'email';
          const isExpanded = !!expandedIds[c.id];
          const exData = expandedDataMap[c.id] ?? null;
          const isLoadingExpand = !!expandedLoadingIds[c.id];
          const expandSearch = expandedSearchMap[c.id] ?? '';

          // DISP-003: a lista já vem filtrada e paginada do servidor — nada de
          // filtrar no browser (só enxergaria a página carregada).
          const pageTargets: any[] = exData?.targets ?? [];
          const targetsPage = expandedPageMap[c.id] ?? 0;
          const matching: number = exData?.matching ?? pageTargets.length;
          const pageCount = Math.max(1, Math.ceil(matching / PAGE_TARGETS));
          const firstOnPage = matching === 0 ? 0 : targetsPage * PAGE_TARGETS + 1;
          const lastOnPage = Math.min(matching, targetsPage * PAGE_TARGETS + pageTargets.length);

          return (
            <div key={c.id}>
              <Card
                onClick={() => handleCardClick(c)}
                className={`cursor-pointer p-5 transition-shadow hover:shadow-card-hover ${isExpanded ? 'rounded-b-none border-b-0' : ''}`}
                title={c.status === 'draft' ? 'Clique para expandir · Duplo clique para editar' : 'Clique para expandir contatos'}
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
                    <Badge variant={statusVariant(c.status)}>{campaignStatusLabel(c.status)}</Badge>
                    {isEmailCh
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-500/15"><Icon name="mail" className="h-3 w-3" /> e-mail</span>
                      : c.type === 'status'
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"><Icon name="zap" className="h-3 w-3" /> WA Status</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700 dark:bg-green-500/15"><Icon name="inbox" className="h-3 w-3" /> WhatsApp</span>
                    }
                    {c.scheduledAt && new Date(c.scheduledAt).getTime() > Date.now() && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        <Icon name="calendar" className="h-3 w-3" /> Agendada {new Date(c.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    {!archivedView && c.status !== 'running' && c.status !== 'done' && (
                      <Button onClick={(e) => { e.stopPropagation(); start(c); }} size="sm"><Icon name="play" className="h-3.5 w-3.5" /> Iniciar</Button>
                    )}
                    {!archivedView && c.status === 'running' && (
                      <button onClick={(e) => { e.stopPropagation(); pause(c.id); }} className="inline-flex h-7 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs text-white hover:bg-amber-400"><Icon name="pause" className="h-3.5 w-3.5" /> Pausar</button>
                    )}
                    {/* DISP-004: só faz sentido enquanto existe fila. Numa campanha
                        'done' não há o que cancelar, e em 'draft' o botão Excluir
                        já resolve. */}
                    {!archivedView && (c.status === 'running' || c.status === 'paused') && (
                      <Button onClick={(e) => { e.stopPropagation(); cancel(c); }} variant="outline" size="sm" title="Retira da fila quem ainda não recebeu e encerra a campanha"><Icon name="close" className="h-3.5 w-3.5" /> Cancelar</Button>
                    )}
                    {!archivedView && (
                      <Button onClick={(e) => {
                        e.stopPropagation();
                        const sentCnt = c.counts?.sent ?? 0;
                        const canFull = c.status === 'draft' || (c.status === 'paused' && sentCnt === 0);
                        if (canFull) openFullEdit(c); else openEditCampaign(c);
                      }} variant="outline" size="sm" title="Editar campanha"><Icon name="edit" className="h-3.5 w-3.5" /> Editar</Button>
                    )}
                    <Button onClick={(e) => { e.stopPropagation(); cloneCampaign(c); }} variant="outline" size="sm" title="Duplicar campanha"><Icon name="campaigns" className="h-3.5 w-3.5" /> Clonar</Button>
                    <Button onClick={(e) => { e.stopPropagation(); del(c); }} title="Excluir campanha" variant="outline" size="icon-sm" className="text-red-500 hover:bg-red-50"><Icon name="trash" className="h-4 w-4" /></Button>
                    {/* seta de expansão */}
                    <Icon name="chevronDown" className={`h-4 w-4 text-base-content/50 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>
                {isEmailCh && c.subject && (
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

              {/* Painel inline de contatos (estilo Excel) */}
              {isExpanded && (
                <div className="rounded-b-xl border border-t-0 border-base-200 bg-base-50 dark:bg-base-200/30 px-4 pt-3 pb-4">
                  {/* cabeçalho: contadores + campo de pesquisa */}
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(exData?.counts || c.counts).map(([s, n]) => (
                        <StatusBadge key={s} tone={targetTone(s)}>{s}: {n as number}</StatusBadge>
                      ))}
                    </div>
                    {(exData?.counts?.failed ?? 0) > 0 && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void resendFailed(c.id); }}>
                        <Icon name="refresh" className="h-4 w-4" /> Reenviar falhas
                      </Button>
                    )}
                    {/* Reenvio total: só existe quando o ambiente libera (ver resendAll). */}
                    {settings?.resendAllEnabled && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void resendAll({ id: c.id, counts: exData?.counts ?? c.counts }); }}>
                        <Icon name="refresh" className="h-4 w-4" /> Reenviar para todos
                      </Button>
                    )}
                    {/* campo de pesquisa */}
                    <div className="ml-auto flex items-center gap-2 rounded-lg border border-base-300 bg-white dark:bg-base-300 px-2.5 py-1.5 text-sm shadow-sm" onClick={(e) => e.stopPropagation()}>
                      <Icon name="search" className="h-4 w-4 text-base-content/40 shrink-0" />
                      <input
                        className="bg-transparent outline-none text-sm text-base-content placeholder:text-base-content/35 w-40"
                        placeholder="Pesquisar contato…"
                        value={expandSearch}
                        onChange={(e) => onTargetsSearchChange(c.id, e.target.value)}
                      />
                      {expandSearch && (
                        <button type="button" onClick={() => onTargetsSearchChange(c.id, '')} className="text-base-content/30 hover:text-base-content/60">
                          <Icon name="close" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* engagement (se disponível) */}
                  {exData?.engagement && (
                    <div className="mb-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-base-200 px-2 py-0.5 text-base-content/70">Entregue: {exData.engagement.delivered}</span>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-500/15">Lido: {exData.engagement.read}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15">Respondeu: {exData.engagement.replied}</span>
                      {/* DISP-009: "enviado" é o que o worker fez; o recibo é o que
                          o WhatsApp confirmou. Sem isto a tela dizia 100% enviada
                          com a sessão do WAHA caída. */}
                      {(exData.deliveryUnconfirmed ?? 0) > 0 && (
                        <span
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          title="Marcados como enviados, mas sem recibo do WhatsApp. Costuma indicar sessão instável — vale conferir a Saúde dos números."
                        >
                          Sem confirmação: {exData.deliveryUnconfirmed}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Campanha de Status: sem lista de destinatários */}
                  {c.type === 'status' ? (
                    <div className="py-4 text-center text-sm text-base-content/50">
                      {exData?.campaign?.statusPostedAt
                        ? <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><Icon name="check" className="h-4 w-4" /> Publicado em {new Date(exData.campaign.statusPostedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        : <span>Status será publicado no WhatsApp ao iniciar. Sem lista de destinatários — atinge todos os contatos que salvaram o número.</span>
                      }
                    </div>
                  ) : isLoadingExpand ? (
                    <div className="py-4 text-center text-sm text-base-content/40">Carregando contatos…</div>
                  ) : pageTargets.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {pageTargets.map((t: any) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-lg border border-base-200 bg-white dark:bg-base-300/50 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-base-content">{t.name || displayPhone(t.phone)}</div>
                            {t.name && <div className="truncate text-[11px] text-base-content/40">{displayPhone(t.phone)}</div>}
                            {t.error && <div className="truncate text-[11px] text-red-500">{t.error}</div>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2 ml-3">
                            {t.sentAt && (
                              <span className="text-[11px] text-base-content/40 hidden sm:block">
                                {new Date(t.sentAt).toLocaleString('pt-BR')}
                              </span>
                            )}
                            {engChip(t) && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${engChip(t)!.cls}`}>
                                {engChip(t)!.label}
                              </span>
                            )}
                            <StatusBadge tone={targetTone(t.status)}>{targetStatusLabel(t.status)}</StatusBadge>
                            {/* motivo do pulo/falha — antes ficava só no banco */}
                            {skipReasonLabel(t.error) && (
                              <span className="rounded-full bg-base-200 px-2 py-0.5 text-[10px] text-base-content/60">
                                {skipReasonLabel(t.error)}
                              </span>
                            )}
                            {exData?.campaign?.status === 'draft' && (
                              <button
                                type="button"
                                title="Remover destinatário"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await removeCampaignTarget(c.id, t.id);
                                    // DISP-003: recarrega a página — filtrar só no
                                    // cliente deixaria a página com 49 itens e
                                    // esconderia o alvo que subiu da página seguinte.
                                    await loadExpandedTargets(c.id);
                                    toast.success('Removido.');
                                  } catch {
                                    toast.error('Erro ao remover.');
                                  }
                                }}
                                className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Icon name="close" className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : exData && !isLoadingExpand ? (
                    <div className="py-4 text-center text-sm text-base-content/40">
                      {expandSearch ? 'Nenhum contato encontrado para essa busca.' : 'Sem destinatários (público automático).'}
                    </div>
                  ) : null}

                  {/* DISP-003: paginação da lista (só aparece se passar de uma página) */}
                  {c.type !== 'status' && matching > PAGE_TARGETS && (
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-base-content/50" onClick={(e) => e.stopPropagation()}>
                      <span>
                        {firstOnPage}–{lastOnPage} de {matching}
                        {expandSearch ? ' encontrados' : ' destinatários'}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={targetsPage === 0 || isLoadingExpand}
                          onClick={(e) => { e.stopPropagation(); void goToTargetsPage(c.id, targetsPage - 1); }}
                        >
                          Anterior
                        </Button>
                        <span>Página {targetsPage + 1} de {pageCount}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={targetsPage + 1 >= pageCount || isLoadingExpand}
                          onClick={(e) => { e.stopPropagation(); void goToTargetsPage(c.id, targetsPage + 1); }}
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editC && (() => {
        const sentCount = editC.counts?.sent ?? 0;
        const isFullEdit = editC.status === 'draft' || (editC.status === 'paused' && sentCount === 0);
        const isStatusCamp = editC.type === 'status';
        return (
        <Modal open onClose={() => setEditC(null)} title="Editar campanha" size="sm">
          <div className="space-y-3">
            {!isFullEdit && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                Campanha em andamento ({sentCount} enviados) — só é possível renomear.
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">Nome</label>
              <input className="input w-full" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            {/* DISP-019: reagendar. Vale sempre que NADA foi enviado ainda —
                inclusive em campanha já 'concluída' com tudo pulado, caso em que
                antes o horário ficava travado sem como corrigir. */}
            {sentCount === 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-base-content/60">
                  Agendamento {editSchedule && <span className="text-base-content/40">· deixe vazio para disparar ao iniciar</span>}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    className="input w-full"
                    value={editSchedule}
                    onChange={(e) => setEditSchedule(e.target.value)}
                  />
                  {editSchedule && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditSchedule('')}>
                      Limpar
                    </Button>
                  )}
                </div>
              </div>
            )}

            {isFullEdit && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    {isStatusCamp ? 'Texto do Status' : 'Mensagem'}
                    {isStatusCamp && <span className="ml-2 text-base-content/40">{editMsg.length}/700</span>}
                  </label>
                  <textarea className="input w-full py-2" style={{ minHeight: '110px', resize: 'vertical' }} value={editMsg} onChange={(e) => setEditMsg(e.target.value)} />
                </div>

                {/* Link — só para campanha mensagem */}
                {!isStatusCamp && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-base-content/60">Link (opcional)</label>
                    <input className="input w-full" placeholder="https://…" value={editLink} onChange={(e) => setEditLink(e.target.value)} />
                  </div>
                )}

                {/* Arquivo / mídia */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    {isStatusCamp ? 'Imagem (opcional)' : 'Arquivo (PDF, imagem…)'}
                  </label>
                  {editMedia ? (
                    <div className="flex items-center gap-2 rounded-lg border border-base-200 bg-base-100 px-3 py-2 text-xs">
                      <Icon name="upload" className="h-4 w-4 shrink-0 text-base-content/40" />
                      <span className="min-w-0 flex-1 truncate text-base-content/70">{editMedia.name}</span>
                      <button type="button" onClick={() => setEditMedia(null)} className="shrink-0 text-base-content/30 hover:text-red-500">
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    </div>
                  ) : isStatusCamp ? (
                    <input className="input w-full" placeholder="https://…" onChange={(e) => {
                      const v = e.target.value.trim();
                      if (v) setEditMedia({ url: v, name: v.split('/').pop() || 'imagem' });
                    }} />
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-base-300 px-3 py-2.5 text-xs text-base-content/50 hover:border-primary hover:text-primary">
                      <Icon name="upload" className="h-4 w-4" />
                      {editUploading ? 'Enviando…' : 'Clique para anexar arquivo'}
                      <input type="file" className="hidden" disabled={editUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEditFile(f); }} />
                    </label>
                  )}
                </div>

                {/* Editar destinatários — só para campanhas de mensagem */}
                {!isStatusCamp && (
                  <div className="rounded-lg border border-base-200">
                    <button
                      type="button"
                      onClick={() => editTargetsOpen ? setEditTargetsOpen(false) : loadEditTargets(editC.id)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-base-content/70 hover:bg-base-100 rounded-lg"
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="contacts" className="h-4 w-4" />
                        Editar contatos
                        {editTargets.length > 0 && (
                          <span className="rounded-full bg-base-200 px-2 py-0.5 text-[10px] text-base-content/60">{editTargets.length}</span>
                        )}
                      </span>
                      {editTargetsLoading
                        ? <span className="text-[11px] text-base-content/40">carregando…</span>
                        : <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${editTargetsOpen ? 'rotate-180' : ''}`} />
                      }
                    </button>

                    {editTargetsOpen && (
                      <div className="border-t border-base-200">
                        {editTargets.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-base-content/40">Sem destinatários registrados.</p>
                        ) : (
                          <div className="max-h-52 overflow-y-auto">
                            {editTargets.map((t: any) => (
                              <div key={t.id} className="flex items-center justify-between border-b border-base-200 px-3 py-2 last:border-0 hover:bg-base-50">
                                <div className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-base-content">{t.name || displayPhone(t.phone)}</span>
                                  {t.name && <span className="block truncate text-[11px] text-base-content/50">{displayPhone(t.phone)}</span>}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeEditTarget(t.id)}
                                  className="ml-3 shrink-0 rounded p-1 text-base-content/30 hover:bg-red-50 hover:text-red-500"
                                  title="Remover destinatário"
                                >
                                  <Icon name="close" className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setEditC(null)}>Cancelar</Button>
              <Button
                onClick={saveEditCampaign}
                loading={editBusy}
                disabled={!editName.trim() || (isFullEdit && !editMsg.trim())}
              >Salvar</Button>
            </div>
          </div>
        </Modal>
        );
      })()}

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
              <h2 className="text-lg font-bold text-base-content">{editingId ? 'Editar campanha' : 'Nova campanha'}</h2>
              <button type="button" onClick={() => { setShow(false); resetForm(); }}
                      className="text-base-content/40 hover:text-base-content"><Icon name="close" className="h-5 w-5" /></button>
            </div>

            <div className="px-7 pt-5 pb-8 space-y-5">

            {/* Canal / Tipo — bloqueado ao editar */}
            <div className={`flex rounded-xl border border-base-200 overflow-hidden text-sm font-medium ${editingId ? 'pointer-events-none opacity-60' : ''}`}>
              <button
                type="button"
                onClick={() => { setChannel('whatsapp'); setCampaignType('message'); setFromContacts(true); }}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-colors ${channel === 'whatsapp' && campaignType === 'message' ? 'bg-green-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}
              >
                <Icon name="inbox" className="h-4 w-4" /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => { setChannel('whatsapp'); setCampaignType('status'); }}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-colors ${channel === 'whatsapp' && campaignType === 'status' ? 'bg-purple-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}
              >
                <Icon name="zap" className="h-4 w-4" /> WA Status
              </button>
              <button
                type="button"
                onClick={() => { setChannel('email'); setCampaignType('message'); setFromContacts(false); }}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-colors ${channel === 'email' ? 'bg-blue-500 text-white' : 'bg-transparent text-base-content/50 hover:bg-base-100'}`}
              >
                <Icon name="mail" className="h-4 w-4" /> E-mail
              </button>
            </div>

            {/* Nome */}
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">Nome da campanha</label>
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promoção Julho" required />
              {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
            </div>

            {/* F8: produto/parceiro — define QUAL conhecimento a Lia usa com quem responder */}
            <div>
              <label className="mb-1 block text-xs font-medium text-base-content/60">
                Produto / parceiro <span className="font-normal text-base-content/40">(opcional)</span>
              </label>
              <input
                className="input w-full"
                list="campaign-product-codes"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="Deixe vazio para o produto principal"
              />
              <datalist id="campaign-product-codes">
                {productCodes.map((p) => <option key={p.productCode} value={p.productCode} />)}
              </datalist>
              {productCode.trim() && !productCodes.some((p) => p.productCode === productCode.trim()) ? (
                <p className="mt-1 text-xs text-amber-500">
                  Ainda não há conhecimento cadastrado para "{productCode.trim()}". A Lia vai responder
                  esses leads só com o conhecimento genérico — cadastre artigos deste produto em Base de
                  Conhecimento antes de disparar.
                </p>
              ) : (
                <p className="mt-1 text-xs text-base-content/40">
                  Quem responder esta campanha recebe respostas com o conhecimento deste produto.
                  {productCodes.length > 0 && (
                    <> Disponíveis: {productCodes.map((p) => p.productCode).join(' · ')}.</>
                  )}
                </p>
              )}
            </div>

            {/* ── WA Status: form simplificado ─────────────────────────────── */}
            {channel === 'whatsapp' && campaignType === 'status' && (
              <>
                <div className="rounded-xl border border-purple-200 bg-purple-50/50 px-4 py-3 text-xs text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300">
                  <strong>WhatsApp Status</strong> — publica uma vez no Stories do número conectado. Todos os contatos que salvaram o número veem. Dura 24h. Sem destinatários individuais.
                </div>
                <div>
                  <label className="mb-1 flex items-center justify-between text-xs font-medium text-base-content/60">
                    <span>Texto do Status</span>
                    <span className={`font-mono ${template.length > 700 ? 'text-red-500' : 'text-base-content/30'}`}>{template.length}/700</span>
                  </label>
                  <textarea
                    className="input w-full py-2 text-sm"
                    style={{ minHeight: '120px', resize: 'vertical' }}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder="Ex: 🔥 Promoção especial de julho! Entre em contato e garanta o desconto."
                  />
                  {formErrors.message && <p className="mt-1 text-xs text-red-500">{formErrors.message}</p>}
                </div>
              </>
            )}

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
                    <span className="ml-2 font-normal text-base-content/30">use {'{{nome}}'}, {'{{saudacao}}'} e {'{op1|op2}'}</span>
                  </label>
                  <textarea
                    className="input w-full py-2 text-sm"
                    style={{ minHeight: '160px', resize: 'vertical' }}
                    value={emailTemplate}
                    onChange={(e) => setEmailTemplate(e.target.value)}
                    required
                  />
                  <SpintaxHint
                    text={emailTemplate}
                    recipients={
                      fromContacts
                        ? (activeCount ?? 0)
                        : parseEmailList(emailsText).length
                    }
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
                            <p className="text-[11px] text-base-content/40">1ª mensagem sem link → lead responde com interesse → Lia envia o link na conversa. Melhor entregabilidade e menos risco de bloqueio.</p>
                          </div>
                        </label>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input type="radio" className="mt-0.5" checked={sendLinkOnFirst}
                                 onChange={() => setSendLinkOnFirst(true)} />
                          <div>
                            <p className="text-sm text-base-content/70">No 1º envio</p>
                            <p className="text-[11px] text-base-content/40">Envia o link direto. Mais risco de cair em spam (e-mail) ou de bloqueio do número (WhatsApp).</p>
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
                        Um e-mail por linha · <strong>{parseEmailList(emailsText).length}</strong> e-mail(s) detectado(s)
                      </p>
                    </>
                  ) : (
                    <div className="rounded-lg border border-base-200 bg-base-100">
                      {/* cabeçalho: quantos vão receber + busca */}
                      <div className="flex flex-wrap items-center gap-2 border-b border-base-200 px-3 py-2">
                        <span className="text-xs text-base-content/60">
                          {emailAudienceLoading && !emailAudience ? (
                            'Carregando destinatários…'
                          ) : (
                            <>
                              <strong className="text-base-content">{emailAudience?.totalAudiencia ?? 0}</strong> contato(s) vão receber
                            </>
                          )}
                        </span>
                        <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-base-300 bg-white dark:bg-base-300 px-2 py-1">
                          <Icon name="search" className="h-3.5 w-3.5 shrink-0 text-base-content/40" />
                          <input
                            className="w-36 bg-transparent text-xs outline-none placeholder:text-base-content/35"
                            placeholder="Buscar na lista…"
                            value={emailAudienceSearch}
                            onChange={(e) => setEmailAudienceSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* a lista em si — os últimos cadastrados primeiro */}
                      <div className="max-h-44 overflow-y-auto">
                        {emailAudience?.items.length ? (
                          emailAudience.items.map((ct) => (
                            <div key={ct.id} className="flex items-baseline gap-2 border-b border-base-200/60 px-3 py-1.5 last:border-0">
                              <span className="truncate text-xs text-base-content">{ct.name || '(sem nome)'}</span>
                              <span className="truncate text-[11px] text-base-content/50">{ct.email}</span>
                              {ct.company && <span className="ml-auto truncate text-[11px] text-base-content/35">{ct.company}</span>}
                            </div>
                          ))
                        ) : (
                          <p className="px-3 py-3 text-xs text-base-content/40">
                            {emailAudienceSearch
                              ? 'Nenhum contato com esse termo. A busca filtra só esta lista — o disparo continua indo para todos.'
                              : 'Nenhum contato ativo com e-mail cadastrado. Importe em Contatos antes de criar a campanha.'}
                          </p>
                        )}
                      </div>

                      {/* Rodapé honesto: a lista é uma janela, e o número de cima ainda
                          não desconta as exclusões que só acontecem na criação. */}
                      <p className="border-t border-base-200 px-3 py-1.5 text-[11px] text-base-content/40">
                        {emailAudienceSearch
                          ? `${emailAudience?.total ?? 0} na busca · mostrando até 50`
                          : `Mostrando os ${Math.min(emailAudience?.items.length ?? 0, 50)} mais recentes`}
                        {' · '}opted-out já excluídos; quem já recebeu campanha antes pode ser pulado no envio
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : campaignType === 'message' ? (
              <>
                {/* Mensagem WhatsApp */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-base-content/60">
                    Mensagem
                    <span className="ml-2 font-normal text-base-content/30">use {'{{nome}}'}, {'{{saudacao}}'} e {'{op1|op2}'}</span>
                  </label>
                  <textarea
                    className="input w-full py-2"
                    style={{ minHeight: '100px', resize: 'vertical' }}
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    required
                  />
                  {/* Em "todos"/"tag" o público real vem da base, não da seleção manual —
                      usa activeCount para o aviso não sumir justo na campanha grande. */}
                  <SpintaxHint
                    text={template}
                    recipients={
                      audience === 'manual'
                        ? manualSelected.size + avulsos.length
                        : (activeCount ?? 0)
                    }
                  />
                  {formErrors.message && <p className="mt-1 text-xs text-red-500">{formErrors.message}</p>}
                </div>

                {/* Destinatários WA */}
                {editingId ? (
                  /* modo edição: lista de contatos existentes com remoção */
                  <div className="rounded-xl border border-base-200">
                    <div className="flex items-center justify-between px-3 py-2.5 text-xs font-medium text-base-content/70">
                      <span className="flex items-center gap-2"><Icon name="contacts" className="h-4 w-4" /> Destinatários desta campanha</span>
                      {editTargetsLoading && <span className="text-[11px] text-base-content/40">carregando…</span>}
                    </div>
                    {!editTargetsLoading && (
                      <div className="border-t border-base-200">
                        {editTargets.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-base-content/40">Sem destinatários registrados (todos os contatos ativos).</p>
                        ) : (
                          <div className="max-h-52 overflow-y-auto">
                            {editTargets.map((t: any) => (
                              <div key={t.id} className="flex items-center justify-between border-b border-base-200 px-3 py-2 last:border-0 hover:bg-base-50">
                                <div className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-base-content">{t.name || displayPhone(t.phone)}</span>
                                  {t.name && <span className="block truncate text-[11px] text-base-content/50">{displayPhone(t.phone)}</span>}
                                </div>
                                <button type="button" onClick={() => removeEditTarget(t.id)}
                                  className="ml-3 shrink-0 rounded p-1 text-base-content/30 hover:bg-red-50 hover:text-red-500" title="Remover">
                                  <Icon name="close" className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm text-base-content/70">
                    <span>Quem vai receber?</span>
                    {activeCount !== null && (
                      <span className={activeCount === 0 ? 'text-xs font-medium text-red-500' : 'text-xs text-base-content/45'}>
                        {activeCount} contato(s) na base
                      </span>
                    )}
                  </div>
                  {/* Aviso ANTES de criar. Sem isto o operador só descobria que a
                      base estava vazia depois de preencher tudo e tomar um 400 —
                      e a tentação era subir o CSV no campo de Anexo, que não é
                      lista de envio. */}
                  {activeCount === 0 && (
                    <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      Nenhum contato cadastrado — não há para quem enviar.{' '}
                      <Link to="/contacts" className="font-semibold underline">
                        Importar contatos
                      </Link>
                      . O campo <strong>Anexo</strong> aqui embaixo é para material (PDF/Word), não para a lista.
                    </div>
                  )}
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
                )} {/* fim ternário editingId destinatários WA */}

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
                      {/* Mesmo padrão do modal de edição — antes era o input de
                          arquivo cru do navegador ("Escolher ficheiro"), que
                          destoava do resto da tela. */}
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-base-300 px-3 py-2.5 text-xs text-base-content/50 hover:border-brand-500 hover:text-brand-600">
                        <Icon name="upload" className="h-4 w-4" />
                        {uploading ? 'Enviando…' : 'Clique para anexar arquivo (PDF/Word)'}
                        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden" disabled={uploading}
                               onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                      </label>
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
            ) : null}

            {/* Quantidade — não se aplica para Status (1 publicação única) */}
            {campaignType !== 'status' && (
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
              {limitMode === 'limit' && audience === 'manual' && manualTotal > sendLimit && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Você selecionou {manualTotal} destinatário(s), mas o limite é {sendLimit} — só os primeiros {sendLimit} serão enviados nesta rodada.
                </p>
              )}
            </div>
            )}

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

            {/* Ferramenta de TESTE. Só existe quando o ambiente libera (a mesma
                variável do "Reenviar para todos"), então em produção nem aparece.
                O aviso diz o custo real: repetir a mesma mensagem para a mesma
                pessoa é o sinal de spam mais forte que existe. */}
            {channel === 'email' && settings?.resendAllEnabled && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={ignoreDedup}
                  onChange={(e) => setIgnoreDedup(e.target.checked)}
                />
                <span>
                  <strong>Reenviar para quem já recebeu</strong> — ignora o “já enviado” nesta campanha.
                  Serve para testar com o mesmo endereço várias vezes. Fora de teste, repetir a mesma
                  mensagem para a mesma pessoa derruba a entrega do domínio.
                </span>
              </label>
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
                {busy ? (editingId ? 'Salvando...' : 'Criando...') : (editingId ? 'Salvar alterações' : 'Criar campanha')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </StandardListPage>
  );
}
