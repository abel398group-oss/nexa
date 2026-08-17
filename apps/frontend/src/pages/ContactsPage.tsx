import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/shared/lib/cn';
import { useUnsavedGuard } from '@/shared/lib/useUnsavedGuard';
import {
  Button, Modal, Input, Textarea, Label, Select,
  StatusBadge, Badge, Icon, EmptyState,
} from '@/shared/ui';
import { displayPhone } from '@/shared/lib/phone';
import {
  type Contact,
  type ImportContactInput,
  type ContactCampaign,
  listContacts,
  listTags,
  bulkTagContacts,
  renameTag,
  deleteTag,
  createContact,
  updateContact,
  reactivateContact,
  optOutContact,
  deleteContact,
  bulkDeleteContacts,
  bulkBlockContacts,
  bulkUnblockContacts,
  importContacts,
  transferContacts,
  getContactCampaigns,
} from '@/entities/contact';
import { listSellersMini } from '@/entities/seller';
import { useAuth } from '@/app/providers/AuthContext';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { StandardListPage } from '@/components/shared/StandardListPage';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';

const empty = { phone: '', name: '', company: '', email: '', notes: '' };

const contactSchema = z.object({
  phone: z.string().trim().min(8, 'Telefone invalido (DDD + numero)'),
  name: z.string().trim().optional().or(z.literal('')),
  company: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('E-mail invalido').optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});
type ContactForm = z.infer<typeof contactSchema>;
const PAGE = 50;

const leadVariant = (s?: string): 'error' | 'warning' | 'info' | 'neutral' =>
  s === 'hot' ? 'error' : s === 'warm' ? 'warning' : s === 'cold' ? 'info' : 'neutral';

const chipCls = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? 'bg-brand-500 text-white' : 'bg-base-200 text-base-content/70 hover:bg-base-300'
  }`;

/** Header de coluna sortavel */
function SortBtn({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: 'name' | 'company' | 'leadStatus' | 'source';
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (k: 'name' | 'company' | 'leadStatus' | 'source') => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="inline-flex cursor-pointer select-none items-center gap-1 text-xs font-semibold uppercase tracking-wide hover:text-base-content"
    >
      {label}
      {sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );
}

export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ContactForm>({ resolver: zodResolver(contactSchema), defaultValues: empty });

  // Perder um cadastro meio preenchido por F5 ou por fechar a aba sem querer.
  // `isDirty` do react-hook-form volta a false depois do `reset()` que o submit
  // faz, entao o aviso some sozinho assim que salva.
  useUnsavedGuard(isDirty && !isSubmitting);
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'optout'>('todos');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<'name' | 'company' | 'leadStatus' | 'source' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showTagMgr, setShowTagMgr] = useState(false);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importTag, setImportTag] = useState('');
  const [bulkTagValue, setBulkTagValue] = useState('');
  const [showHist, setShowHist] = useState(false);
  const [histContact, setHistContact] = useState<Contact | null>(null);
  const [histList, setHistList] = useState<ContactCampaign[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  // Carteira (11/08/2026): filtro e transferência são do admin. O vendedor já
  // está olhando a própria carteira — a coluna "Vendedor" repetiria o nome dele
  // em toda linha, e o filtro não teria o que filtrar.
  const { user } = useAuth();
  const ehAdmin = user?.role === 'admin';
  const [ownerFilter, setOwnerFilter] = useState<string>('');
  // Esta tela é a "Leads" do Market, e cliente do TMS mora na mesma tabela — entra
  // pelo web chat com o id externo no lugar do telefone. Sem recorte, a base de
  // prospecção lista quem já é cliente, com UUID na coluna do telefone. Começa em
  // 'lead' porque é para isso que se abre a tela; os outros dois estão a um clique.
  const [baseFiltro, setBaseFiltro] = useState<'lead' | 'cliente' | 'todos'>('lead');
  const [importOwner, setImportOwner] = useState<string>('');
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  function toggleSort(k: 'name' | 'company' | 'leadStatus' | 'source') {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  }

  // Vendedores para o filtro, a coluna e o seletor da importação. Só o admin
  // precisa — para o vendedor a consulta nem sai.
  const { data: vendedores = [] } = useQuery({
    queryKey: ['sellers-mini'],
    queryFn: listSellersMini,
    enabled: ehAdmin,
    staleTime: 5 * 60_000,
  });
  const nomeDoVendedor = (id?: string | null) =>
    id ? vendedores.find((v) => v.id === id)?.name ?? 'Vendedor removido' : null;

  const statusParam = filtro === 'ativos' ? 'active' : filtro === 'optout' ? 'opted_out' : undefined;
  const { data, isLoading: loading } = useQuery({
    queryKey: ['contacts', appliedSearch, tagFilter, filtro, page, ownerFilter, baseFiltro],
    queryFn: () =>
      listContacts({
        search: appliedSearch, tag: tagFilter ?? undefined, status: statusParam,
        owner: ownerFilter || undefined, base: baseFiltro, limit: PAGE, offset: page * PAGE,
      }),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const { data: tags = [] } = useQuery({ queryKey: ['contact-tags'], queryFn: () => listTags() });
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['contact-tags'] }),
    ]);

  const shown = sortKey
    ? [...items].sort((a, b) => {
        const av = ((a as any)[sortKey] ?? '').toString().toLowerCase();
        const bv = ((b as any)[sortKey] ?? '').toString().toLowerCase();
        const cmp = av.localeCompare(bv, 'pt-BR');
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : items;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const onSubmit = async (formData: ContactForm) => {
    try {
      if (editId) {
        await updateContact(editId, formData);
        toast.success('Contato atualizado!');
      } else {
        await createContact(formData);
        toast.success('Contato salvo!');
      }
      reset(empty);
      setEditId(null);
      setShowForm(false);
      await invalidate();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError('root', { message: Array.isArray(msg) ? msg.join(', ') : msg || 'Erro ao salvar' });
    }
  };

  function openEdit(c: Contact) {
    setEditId(c.id);
    reset({ phone: c.phone, name: c.name || '', company: c.company || '', email: c.email || '', notes: c.notes || '' });
    setShowForm(true);
  }

  async function reactivate(c: Contact) {
    const ok = await confirm({
      title: 'Reativar contato',
      message: `Reativar ${c.name || displayPhone(c.phone)}? So faca isso se a pessoa CONSENTIU em voltar a receber mensagens (LGPD).`,
      variant: 'warning',
      confirmLabel: 'Reativar',
    });
    if (!ok) return;
    try {
      await reactivateContact(c.id);
      toast.success('Contato reativado.');
      await invalidate();
    } catch {
      toast.error('Erro ao reativar.');
    }
  }

  async function optOut(id: string) {
    const ok = await confirm({
      title: 'Descadastrar contato (opt-out)',
      message: 'Marcar como descadastrado? O contato deixa de receber disparos (LGPD). Voce pode reativar depois, com consentimento.',
      variant: 'warning',
      confirmLabel: 'Descadastrar',
    });
    if (!ok) return;
    try {
      await optOutContact(id);
      toast.success('Contato descadastrado (opt-out).');
      setShowForm(false);
      await invalidate();
    } catch {
      toast.error('Erro ao descadastrar.');
    }
  }

  async function del(c: Contact) {
    const ok = await confirm({
      title: 'Excluir contato',
      message: `Excluir ${c.name || displayPhone(c.phone)}? Esta acao nao pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteContact(c.id);
      toast.success('Contato excluido.');
      await invalidate();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  function toggleSel(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => (s.size === shown.length ? new Set() : new Set(shown.map((c) => c.id))));
  }
  async function addTagToSelected() {
    const tag = bulkTagValue.trim();
    if (!tag) { toast.error('Digite o nome da tag.'); return; }
    try {
      await bulkTagContacts([...selected], tag, 'add');
      toast.success(`Tag "${tag}" adicionada a ${selected.size} contato(s).`);
      setBulkTagValue('');
      await invalidate();
    } catch {
      toast.error('Erro ao adicionar tag.');
    }
  }

  async function doRenameTag(from: string) {
    const to = renameValue.trim();
    if (!to || to === from) { setRenamingTag(null); return; }
    try {
      await renameTag(from, to);
      toast.success(`Tag renomeada para "${to}".`);
      setRenamingTag(null); setRenameValue('');
      if (tagFilter === from) setTagFilter(to);
      await invalidate();
    } catch { toast.error('Erro ao renomear a tag.'); }
  }
  async function doDeleteTag(tag: string) {
    const ok = await confirm({
      title: 'Excluir tag',
      message: `Excluir a tag "${tag}" de todos os contatos? Os contatos nao sao apagados.`,
      variant: 'danger',
      confirmLabel: 'Excluir tag',
    });
    if (!ok) return;
    try {
      await deleteTag(tag);
      toast.success(`Tag "${tag}" excluida.`);
      if (tagFilter === tag) setTagFilter(null);
      await invalidate();
    } catch { toast.error('Erro ao excluir a tag.'); }
  }

  function createCampaignFromSelected() {
    const chosen = items.filter((c) => selected.has(c.id) && c.status !== 'opted_out');
    if (chosen.length === 0) { toast.error('Selecione contatos ativos.'); return; }
    navigate('/campaigns', { state: { phones: chosen.map((c) => ({ phone: c.phone, name: c.name })) } });
  }
  // Blocklist (concorrentes): bloqueados nunca recebem campanha; reversível.
  async function blockSelected() {
    const n = selected.size;
    const ok = await confirm({
      title: 'Bloquear selecionados',
      message: `Bloquear ${n} contato(s)? Eles NUNCA vao receber campanhas (use para concorrentes). Da para desbloquear depois.`,
      confirmLabel: `Bloquear ${n}`,
    });
    if (!ok) return;
    try {
      const r = await bulkBlockContacts([...selected]);
      toast.success(`${r.blocked} contato(s) bloqueado(s).`);
      setSelected(new Set());
      await invalidate();
    } catch {
      toast.error('Erro ao bloquear os contatos.');
    }
  }

  async function unblockSelected() {
    try {
      const r = await bulkUnblockContacts([...selected]);
      toast.success(`${r.unblocked} contato(s) desbloqueado(s).`);
      setSelected(new Set());
      await invalidate();
    } catch {
      toast.error('Erro ao desbloquear os contatos.');
    }
  }

  /**
   * Passa a carteira para outro vendedor. As CONVERSAS vão junto — deixá-las com
   * o dono antigo daria a ele o histórico de um lead que não é mais dele, e o
   * novo dono começaria sem contexto.
   */
  async function transferirSelecionados(sellerId: string | null) {
    const n = selected.size;
    const nome = sellerId ? nomeDoVendedor(sellerId) : 'sem dono';
    const ok = await confirm({
      title: `Transferir ${n} contato(s)?`,
      message: `Eles passam para ${nome}, com as conversas junto. O dono anterior deixa de vê-los.`,
      confirmLabel: 'Transferir',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    try {
      const r = await transferContacts([...selected], sellerId);
      toast.success(`${r.transferidos} contato(s) e ${r.conversas} conversa(s) → ${nome}.`);
      setSelected(new Set());
      await invalidate();
    } catch {
      toast.error('Erro ao transferir os contatos.');
    }
  }

  async function deleteSelected() {
    const n = selected.size;
    const ok = await confirm({
      title: 'Excluir selecionados',
      message: `Excluir ${n} contato(s)? Esta acao nao pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: `Excluir ${n}`,
    });
    if (!ok) return;
    try {
      const r = await bulkDeleteContacts([...selected]);
      toast.success(`${r.deleted} contato(s) excluido(s).`);
      await invalidate();
    } catch {
      toast.error('Erro ao excluir os contatos.');
    }
  }

  async function openHistory(c: Contact) {
    setHistContact(c);
    setShowHist(true);
    setHistLoading(true);
    try {
      setHistList(await getContactCampaigns(c.id));
    } catch {
      setHistList([]);
    } finally {
      setHistLoading(false);
    }
  }
  const histTone = (s: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' =>
    s === 'sent' ? 'success'
      : s === 'failed' ? 'danger'
      : s === 'skipped' ? 'warning'
      : s === 'queued' || s === 'sending' ? 'info'
      : 'neutral';

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setImportMsg('');
    try {
      const contacts: ImportContactInput[] = csv
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [phone, name, company] = l.split(/[,;\t]/).map((x) => x?.trim());
          const tag = importTag.trim();
          return {
            phone: (phone || '').replace(/\D/g, ''),
            name: name || undefined,
            company: company || undefined,
            source: 'import',
            tags: tag ? [tag] : undefined,
          };
        })
        .filter((c) => c.phone.length >= 12);
      if (contacts.length === 0) { toast.error('Nenhum telefone valido (use 55+DDD+numero).'); setBusy(false); return; }
      const r = await importContacts(contacts, importOwner || null);
      toast.success(`${r.imported} contatos importados.`);
      setCsv(''); setImportTag(''); setImportOwner(''); setShowImport(false);
      await invalidate();
    } catch {
      toast.error('Erro ao importar contatos.');
    } finally {
      setBusy(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(f, 'utf-8');
  }

  function baixarModelo() {
    const exemplo = '﻿' + 'telefone;nome;empresa\n5511999998888;Joao Silva;Transportadora Silva\n5511988887777;Maria Souza;Souza Logistica\n5511977776666;;';
    const blob = new Blob([exemplo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo_contatos.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Colunas da tabela ──────────────────────────────────────────────────────

  const columns: DataTableColumn<Contact>[] = [
    {
      id: 'select',
      width: '44px',
      header: (
        <input
          type="checkbox"
          checked={shown.length > 0 && selected.size === shown.length}
          onChange={toggleAll}
          className="size-4 align-middle accent-brand-500"
          title="Selecionar todos"
        />
      ),
      mobileHidden: true,
      cell: (c) => (
        <input
          type="checkbox"
          checked={selected.has(c.id)}
          onChange={() => toggleSel(c.id)}
          className="size-4 align-middle accent-brand-500"
        />
      ),
    },
    {
      id: 'name',
      header: <SortBtn label="Nome" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      mobileTitle: true,
      cell: (c) => (
        <span className="font-medium text-base-content">
          {c.name || '—'}
          {c.status === 'opted_out' && (
            <span className="ml-2"><Badge variant="error">descadastrado</Badge></span>
          )}
          {c.status === 'blocked' && (
            <span className="ml-2"><Badge variant="error">🚫 bloqueado</Badge></span>
          )}
        </span>
      ),
    },
    {
      id: 'phone',
      header: 'Telefone',
      cell: (c) => <span className="text-base-content/80">{displayPhone(c.phone)}</span>,
      mobileHidden: true,
    },
    {
      id: 'company',
      header: <SortBtn label="Empresa" col="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      mobileHidden: true,
      cell: (c) => <span className="text-base-content/80">{c.company || '—'}</span>,
    },
    {
      id: 'tags',
      header: 'Tags',
      mobileHidden: true,
      cell: (c) =>
        c.tags && c.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {c.tags.map((t) => (
              <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-base-content/30">—</span>
        ),
    },
    {
      id: 'leadStatus',
      header: <SortBtn label="Lead" col="leadStatus" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      mobileLabel: 'Lead',
      cell: (c) => <Badge variant={leadVariant(c.leadStatus)}>{c.leadStatus || 'novo'}</Badge>,
    },
    {
      id: 'source',
      header: <SortBtn label="Origem" col="source" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />,
      mobileHidden: true,
      cell: (c) => <span className="text-xs text-base-content/50">{c.source || '—'}</span>,
    },
    // Só na visão do admin: para o vendedor seria o nome dele repetido em toda linha.
    ...(ehAdmin
      ? [{
          id: 'vendedor',
          header: <>Vendedor</>,
          mobileHidden: true,
          cell: (c: Contact) =>
            c.ownerSellerId ? (
              <Badge variant="info">{nomeDoVendedor(c.ownerSellerId)}</Badge>
            ) : (
              <span className="text-xs text-base-content/40">sem dono</span>
            ),
        } as DataTableColumn<Contact>]
      : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <StandardListPage
        title="Contatos"
        breadcrumb={[{ label: 'Contatos' }]}
        totalItems={total}
        entityName="contato(s)"
        isLoading={loading}
        hasData={shown.length > 0}
        headerActions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowImport(true); setImportMsg(''); }}>
              <Icon name="upload" className="h-4 w-4" /> Importar
            </Button>
            <Button onClick={() => { setEditId(null); reset(empty); setShowForm(true); }}>+ Novo</Button>
          </div>
        }
        extraToolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="!w-auto"
              value={baseFiltro}
              onChange={(e) => { setBaseFiltro(e.target.value as 'lead' | 'cliente' | 'todos'); setPage(0); }}
              title="Leads de prospeccao ou clientes que ja usam o TMS"
            >
              <option value="lead">Leads</option>
              <option value="cliente">Clientes do TMS</option>
              <option value="todos">Leads e clientes</option>
            </Select>
            <Select
              className="!w-auto"
              value={filtro}
              onChange={(e) => { setFiltro(e.target.value as 'todos' | 'ativos' | 'optout'); setPage(0); }}
              title="Filtrar por situacao"
            >
              <option value="todos">Todos</option>
              <option value="ativos">So ativos</option>
              <option value="optout">So descadastrados</option>
            </Select>
            {/* Carteira: só o admin vê mais de uma. "Sem dono" é o que falta distribuir. */}
            {ehAdmin && (
              <Select
                className="!w-auto"
                value={ownerFilter}
                onChange={(e) => { setOwnerFilter(e.target.value); setPage(0); }}
                title="Filtrar por vendedor"
              >
                <option value="">Vendedor: todos</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                <option value="sem-dono">Sem dono</option>
              </Select>
            )}
            <div className="flex items-center gap-1">
              <Input
                className="!w-64"
                placeholder="Buscar nome, telefone, empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setAppliedSearch(search); setPage(0); } }}
              />
              <Button variant="outline" onClick={() => { setAppliedSearch(search); setPage(0); }}>Buscar</Button>
            </div>
          </div>
        }
        topContent={
          (tags.length > 0 || selected.size > 0) ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-base-300 bg-[var(--surface)] px-4 py-2.5">
              {selected.size === 0 ? (
                <>
                  <span className="text-xs text-base-content/50">Tags:</span>
                  <button onClick={() => { setTagFilter(null); setPage(0); }} className={chipCls(tagFilter === null)}>Todas</button>
                  {tags.map((t) => (
                    <button
                      key={t.tag}
                      onClick={() => { setTagFilter(tagFilter === t.tag ? null : t.tag); setPage(0); }}
                      className={chipCls(tagFilter === t.tag)}
                    >
                      {t.tag} <span className="opacity-60">{t.count}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowTagMgr(true)}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-base-300 px-3 py-1 text-xs font-medium text-base-content/70 hover:bg-base-100"
                  >
                    <Icon name="dots" className="h-3.5 w-3.5" /> Gerenciar tags
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-brand-600">{selected.size} selecionado(s)</span>
                  <Button size="sm" onClick={createCampaignFromSelected}>Criar campanha</Button>
                  <div className="flex items-center gap-1">
                    <Input
                      className="!w-40"
                      placeholder="nome da tag"
                      value={bulkTagValue}
                      onChange={(e) => setBulkTagValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addTagToSelected()}
                    />
                    <Button variant="outline" size="sm" onClick={addTagToSelected}>+ Tag</Button>
                  </div>
                  {ehAdmin && (
                    <Select
                      className="!w-44"
                      value=""
                      onChange={(e) => e.target.value && transferirSelecionados(
                        e.target.value === 'sem-dono' ? null : e.target.value,
                      )}
                    >
                      <option value="">Transferir para…</option>
                      {vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      <option value="sem-dono">— deixar sem dono —</option>
                    </Select>
                  )}
                  <Button variant="outline" size="sm" onClick={blockSelected}>🚫 Bloquear</Button>
                  <Button variant="outline" size="sm" onClick={unblockSelected}>Desbloquear</Button>
                  <Button variant="destructive" size="sm" onClick={deleteSelected}>Excluir</Button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="ml-auto text-xs text-base-content/50 hover:text-base-content"
                  >
                    Limpar selecao
                  </button>
                </>
              )}
            </div>
          ) : undefined
        }
        pagination={{
          page: page + 1,
          pageCount: pages,
          onPageChange: (p) => setPage(p - 1),
        }}
      >
        <DataTable
          columns={columns}
          rows={shown}
          getRowId={(c) => c.id}
          rowClassName={(c) =>
            cn(
              c.status === 'opted_out' && 'opacity-60',
              selected.has(c.id) && 'bg-brand-500/[0.06]',
            ) || undefined
          }
          rowActions={(c) => [
            { label: 'Historico de campanhas', onClick: () => openHistory(c) },
            ...(c.status === 'opted_out'
              ? [{ label: 'Reativar contato', onClick: () => reactivate(c) }]
              : []),
            { label: 'Editar', onClick: () => openEdit(c) },
            { label: 'Excluir', onClick: () => del(c), destructive: true },
          ]}
          empty={{
            title: search || filtro !== 'todos' ? 'Nenhum contato encontrado' : 'Nenhum contato ainda',
            description: search || filtro !== 'todos'
              ? 'Tente outro filtro ou termo de busca.'
              : 'Importe sua lista ou cadastre o primeiro contato.',
            action: (
              <button
                onClick={() => { setShowImport(true); setImportMsg(''); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
              >
                <Icon name="upload" className="h-4 w-4" /> Importar contatos
              </button>
            ),
          }}
        />
      </StandardListPage>

      {/* Modal novo/editar contato */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? 'Editar contato' : 'Novo contato'}
        size="sm"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {([
            { k: 'phone', label: 'Telefone (DDD + numero)', ph: '11999998888' },
            { k: 'name', label: 'Nome', ph: 'Joao Silva' },
            { k: 'company', label: 'Empresa', ph: 'Transportadora X' },
            { k: 'email', label: 'Email', ph: 'joao@empresa.com' },
          ] as const).map((f) => (
            <div key={f.k}>
              <Label className="mb-1 block text-xs text-base-content/50">{f.label}</Label>
              <Input placeholder={f.ph} {...register(f.k)} />
              {errors[f.k] && <p className="mt-1 text-xs text-red-500">{errors[f.k]?.message}</p>}
            </div>
          ))}
          <div>
            <Label className="mb-1 block text-xs text-base-content/50">Notas internas</Label>
            <Textarea placeholder="Anotacoes sobre o lead (visivel pra equipe)" rows={3} {...register('notes')} />
          </div>
          {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
          {editId && (() => {
            const editing = items.find((c) => c.id === editId);
            if (!editing) return null;
            return editing.status === 'opted_out' ? (
              <button
                type="button"
                onClick={() => { setShowForm(false); reactivate(editing); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
              >
                <Icon name="undo" className="h-4 w-4" /> Reativar contato
              </button>
            ) : (
              <button
                type="button"
                onClick={() => optOut(editId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
              >
                <Icon name="ban" className="h-4 w-4" /> Marcar como descadastrado (opt-out)
              </button>
            );
          })()}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button loading={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal importar */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar contatos" size="md">
        <form onSubmit={doImport} className="space-y-3">
          <p className="text-xs text-base-content/50">
            Formato: <code>telefone,nome,empresa</code> (ex: 11999998888,Joao,Transp X). So o <strong>telefone</strong> e obrigatorio (DDD + numero).
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-base-300 bg-base-200 p-3">
            <label className="btn-primary inline-flex cursor-pointer items-center gap-1.5 text-xs">
              <Icon name="upload" className="h-4 w-4" /> Escolher arquivo (.csv ou .txt)
              <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onPickFile} />
            </label>
            <Button type="button" variant="outline" size="sm" onClick={baixarModelo}>
              <Icon name="download" className="h-4 w-4" /> Baixar modelo
            </Button>
            <span className="text-[11px] text-base-content/40">ou cole abaixo</span>
          </div>
          {/*
            De quem é a lista. É o único lugar onde alguém decide isso — daí em
            diante a campanha, a conversa e o que cada um enxerga saem sozinhos.
            Só o admin escolhe: o vendedor importando fica com a própria lista.
          */}
          {ehAdmin && (
            <div>
              <Label className="mb-1 block text-xs text-base-content/60">Vendedor responsavel</Label>
              <Select value={importOwner} onChange={(e) => setImportOwner(e.target.value)}>
                <option value="">Sem dono (todos veem)</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
              <p className="mt-1 text-[11px] text-base-content/40">
                {importOwner
                  ? 'Só esse vendedor e você vao ver estes contatos.'
                  : 'Sem dono, a lista fica visivel para todos os vendedores.'}
              </p>
            </div>
          )}
          <div>
            <Label className="mb-1 block text-xs text-base-content/60">Tag desta importacao (opcional)</Label>
            <Input
              placeholder="Ex.: Feira-Junho, Lista-Indicacao"
              value={importTag}
              onChange={(e) => setImportTag(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-base-content/40">
              Todos os contatos deste arquivo entram com essa tag.
            </p>
          </div>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            placeholder={"11999998888,Joao Silva,Transp X\n11988887777,Maria Souza"}
            className="font-mono text-xs"
          />
          {importMsg && <p className="text-sm text-base-content/70">{importMsg}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShowImport(false)}>Fechar</Button>
            <Button loading={busy}>{busy ? 'Importando...' : 'Importar'}</Button>
          </div>
        </form>
      </Modal>

      {/* Modal gerenciar tags */}
      <Modal open={showTagMgr} onClose={() => { setShowTagMgr(false); setRenamingTag(null); }} title="Gerenciar tags" size="sm">
        {tags.length === 0 ? (
          <p className="py-6 text-center text-sm text-base-content/50">
            Nenhuma tag ainda. Crie uma adicionando a um contato no Inbox ou na selecao em massa.
          </p>
        ) : (
          <div className="space-y-1">
            {tags.map((t) => (
              <div key={t.tag} className="flex items-center gap-2 rounded-lg border border-base-200 px-3 py-2">
                {renamingTag === t.tag ? (
                  <>
                    <Input
                      className="flex-1"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') doRenameTag(t.tag); if (e.key === 'Escape') setRenamingTag(null); }}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => doRenameTag(t.tag)}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenamingTag(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate text-sm font-medium text-base-content">{t.tag}</span>
                    <span className="shrink-0 text-xs text-base-content/40">{t.count} contato(s)</span>
                    <button onClick={() => { setRenamingTag(t.tag); setRenameValue(t.tag); }} title="Renomear" className="rounded-md px-2 py-1 text-base-content/50 hover:bg-base-200">
                      <Icon name="edit" className="h-4 w-4" />
                    </button>
                    <button onClick={() => doDeleteTag(t.tag)} title="Excluir" className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-base-content/40">
          Para criar uma tag nova, adicione-a a um contato. Renomear/excluir aqui vale pra todos os contatos.
        </p>
      </Modal>

      {/* Modal historico de campanhas */}
      <Modal
        open={showHist}
        onClose={() => setShowHist(false)}
        title={`Campanhas recebidas — ${histContact?.name || histContact?.phone || ''}`}
        size="md"
      >
        {histLoading ? (
          <div className="py-8 text-center text-sm text-base-content/50">Carregando historico...</div>
        ) : histList.length === 0 ? (
          <EmptyState
            icon={<Icon name="campaigns" className="h-9 w-9" />}
            title="Nenhuma campanha"
            description="Este contato ainda nao recebeu nenhuma campanha."
          />
        ) : (
          <div className="space-y-2">
            {histList.map((h, i) => (
              <div
                key={h.campaignId + i}
                className="flex items-center justify-between rounded-lg border border-base-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-base-content">{h.name}</div>
                  <div className="text-[11px] text-base-content/50">
                    {h.channel === 'email' ? 'e-mail' : 'WhatsApp'} {new Date(h.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <StatusBadge tone={histTone(h.status)}>{h.status}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
