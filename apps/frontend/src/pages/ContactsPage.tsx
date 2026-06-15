import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Input, Textarea, Label, Select, StatusBadge, Breadcrumb, Icon, SkeletonList, EmptyState } from '@/shared/ui';
import { displayPhone } from '@/lib/phone';
import {
  type Contact,
  type ImportContactInput,
  type TagCount,
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
  importContacts,
  getContactCampaigns,
} from '@/features/contact';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';

const empty = { phone: '', name: '', company: '', email: '' };

// validação do form de contato (RHF + Zod) — telefone obrigatório; e-mail válido se preenchido
const contactSchema = z.object({
  phone: z.string().trim().min(8, 'Telefone inválido (DDD + número)'),
  name: z.string().trim().optional().or(z.literal('')),
  company: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
});
type ContactForm = z.infer<typeof contactSchema>;

export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false); // usado pelo modal de importação
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({ resolver: zodResolver(contactSchema), defaultValues: empty });
  const [showImport, setShowImport] = useState(false);
  const [csv, setCsv] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'optout'>('todos');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  // gerenciador de tags
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
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const queryClient = useQueryClient();

  // React Query: lista de contatos (busca aplicada no Enter + filtro de tag) e tags
  const { data, isLoading: loading } = useQuery({
    queryKey: ['contacts', appliedSearch, tagFilter],
    queryFn: () => listContacts({ search: appliedSearch, limit: 100, tag: tagFilter ?? undefined }),
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const { data: tags = [] } = useQuery({ queryKey: ['contact-tags'], queryFn: () => listTags() });
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['contact-tags'] }),
    ]);

  const onSubmit = async (formData: ContactForm) => {
    try {
      if (editId) {
        await updateContact(editId, formData); // edição (não reenvia source)
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
    reset({ phone: c.phone, name: c.name || '', company: c.company || '', email: c.email || '' });
    setShowForm(true);
  }

  async function reactivate(c: Contact) {
    const ok = await confirm({
      title: 'Reativar contato',
      message: `Reativar ${c.name || displayPhone(c.phone)}? Só faça isso se a pessoa CONSENTIU em voltar a receber mensagens (LGPD).`,
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
      message: 'Marcar como descadastrado? O contato deixa de receber disparos (LGPD). Você pode reativar depois, com consentimento.',
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
      message: `Excluir ${c.name || displayPhone(c.phone)}? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteContact(c.id);
      toast.success('Contato excluído.');
      await invalidate();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  // ── Seleção em massa ──────────────────────────────────────────────
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

  // ----- gerenciador de tags (renomear / excluir global) -----
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
      message: `Excluir a tag "${tag}" de todos os contatos? Os contatos não são apagados — só perdem essa etiqueta.`,
      variant: 'danger',
      confirmLabel: 'Excluir tag',
    });
    if (!ok) return;
    try {
      await deleteTag(tag);
      toast.success(`Tag "${tag}" excluída.`);
      if (tagFilter === tag) setTagFilter(null);
      await invalidate();
    } catch { toast.error('Erro ao excluir a tag.'); }
  }

  // Leva os selecionados (ativos) para a tela de Disparo, já como público manual.
  function createCampaignFromSelected() {
    const chosen = items.filter((c) => selected.has(c.id) && c.status !== 'opted_out');
    if (chosen.length === 0) { toast.error('Selecione contatos ativos.'); return; }
    navigate('/campaigns', {
      state: { phones: chosen.map((c) => ({ phone: c.phone, name: c.name })) },
    });
  }
  // Exclui todos os contatos selecionados (com confirmação).
  async function deleteSelected() {
    const n = selected.size;
    const ok = await confirm({
      title: 'Excluir selecionados',
      message: `Excluir ${n} contato(s)? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: `Excluir ${n}`,
    });
    if (!ok) return;
    try {
      // uma única requisição: apaga todos de uma vez (1 confirmação de break-glass, não N)
      const r = await bulkDeleteContacts([...selected]);
      toast.success(`${r.deleted} contato(s) excluído(s).`);
      await invalidate();
    } catch {
      toast.error('Erro ao excluir os contatos.');
    }
  }

  // ── Histórico de campanhas do contato ─────────────────────────────
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
      // formato por linha: telefone[,nome[,empresa]]
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
      if (contacts.length === 0) { toast.error('Nenhum telefone válido (use 55+DDD+número).'); setBusy(false); return; }
      const r = await importContacts(contacts);
      toast.success(`${r.imported} contatos importados.`);
      setCsv('');
      setImportTag('');
      setShowImport(false);
      await invalidate();
    } catch (e: any) {
      toast.error('Erro ao importar contatos.');
    } finally {
      setBusy(false);
    }
  }

  // lê arquivo .csv/.txt escolhido e joga o conteúdo na caixa
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(f, 'utf-8');
  }

  // baixa um arquivo-modelo de exemplo
  function baixarModelo() {
    // ; como separador (Excel pt-BR abre em colunas) + BOM (acentos corretos)
    const exemplo =
      '﻿' +
      'telefone;nome;empresa\n' +
      '5511999998888;João Silva;Transportadora Silva\n' +
      '5511988887777;Maria Souza;Souza Logística\n' +
      '5511977776666;;';
    const blob = new Blob([exemplo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_contatos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const badge = (s?: string) => {
    const map: Record<string, string> = {
      hot: 'bg-red-100 text-red-700',
      warm: 'bg-amber-100 text-amber-700',
      cold: 'bg-sky-100 text-sky-700',
    };
    return map[s ?? ''] || 'bg-base-200 text-base-content/60';
  };

  const chipCls = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-brand-500 text-white' : 'bg-base-200 text-base-content/70 hover:bg-base-300'
    }`;

  const optOutCount = items.filter((c) => c.status === 'opted_out').length;
  const shown = items.filter((c) =>
    filtro === 'todos' ? true : filtro === 'ativos' ? c.status !== 'opted_out' : c.status === 'opted_out',
  );

  return (
    <div className="flex h-full flex-col bg-base-100">
      {/* header */}
      <div className="flex items-center justify-between border-b border-base-200 bg-[var(--surface)] px-6 py-4">
        <div>
          <Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Contatos' }]} />
          <h1 className="text-lg font-bold text-base-content">Contatos</h1>
          <p className="text-xs text-base-content/50">{total} cadastrados{optOutCount > 0 && ` · ${optOutCount} descadastrado(s)`}</p>
        </div>
        <div className="flex gap-2">
          <Select
            className="!w-auto"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as any)}
            title="Filtrar por situação"
          >
            <option value="todos">Todos</option>
            <option value="ativos">Só ativos</option>
            <option value="optout">Só descadastrados</option>
          </Select>
          <Input
            className="!w-64"
            placeholder="Buscar nome, telefone, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setAppliedSearch(search)}
          />
          <Button variant="outline" onClick={() => setAppliedSearch(search)}>Buscar</Button>
          <Button variant="outline" onClick={() => { setShowImport(true); setImportMsg(''); }}><Icon name="upload" className="h-4 w-4" /> Importar</Button>
          <Button onClick={() => { setEditId(null); reset(empty); setShowForm(true); }}>+ Novo</Button>
        </div>
      </div>

      {/* filtro por tag + barra de seleção em massa */}
      {(tags.length > 0 || selected.size > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-base-200 bg-[var(--surface)] px-6 py-2.5">
          {selected.size === 0 ? (
            <>
              <span className="text-xs text-base-content/50">Tags:</span>
              <button onClick={() => setTagFilter(null)} className={chipCls(tagFilter === null)}>Todas</button>
              {tags.map((t) => (
                <button
                  key={t.tag}
                  onClick={() => setTagFilter(tagFilter === t.tag ? null : t.tag)}
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
              <Button variant="destructive" size="sm" onClick={deleteSelected}>
                Excluir
              </Button>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-xs text-base-content/50 hover:text-base-content"
              >
                Limpar seleção
              </button>
            </>
          )}
        </div>
      )}

      {/* tabela */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <SkeletonList rows={6} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Icon name="contacts" className="h-9 w-9" />}
            title={search || filtro !== 'todos' ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
            description={search || filtro !== 'todos' ? 'Tente outro filtro ou termo de busca.' : 'Importe sua lista ou cadastre o primeiro contato.'}
            action={
              <button onClick={() => { setShowImport(true); setImportMsg(''); }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
                <Icon name="upload" className="h-4 w-4" /> Importar contatos
              </button>
            }
          />
        ) : (
        <table className="w-full overflow-hidden rounded-xl text-sm" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-card)' }}>
          <thead className="border-b text-left text-xs uppercase" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={shown.length > 0 && selected.size === shown.length}
                  onChange={toggleAll}
                  className="size-4 align-middle accent-brand-500"
                  title="Selecionar todos"
                />
              </th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className={`border-b last:border-0 hover:bg-base-100 ${c.status === 'opted_out' ? 'opacity-60' : ''} ${selected.has(c.id) ? 'bg-brand-500/[0.06]' : ''}`} style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSel(c.id)}
                    className="size-4 align-middle accent-brand-500"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-base-content">
                  {c.name || '—'}
                  {c.status === 'opted_out' && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">descadastrado</span>
                  )}
                </td>
                <td className="px-4 py-3 text-base-content/80">{displayPhone(c.phone)}</td>
                <td className="px-4 py-3 text-base-content/80">{c.company || '—'}</td>
                <td className="px-4 py-3">
                  {c.tags && c.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-base-content/30">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badge(c.leadStatus)}`}>
                    {c.leadStatus || 'novo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-base-content/50">{c.source || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openHistory(c)} title="Campanhas recebidas" className="rounded-md px-2 py-1 text-base-content/50 hover:bg-base-200">
                      <Icon name="campaigns" className="h-4 w-4" />
                    </button>
                    {c.status === 'opted_out' && (
                      <button onClick={() => reactivate(c)} title="Reativar (com consentimento)" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-100"><Icon name="undo" className="h-3.5 w-3.5" /> Reativar</button>
                    )}
                    <button onClick={() => openEdit(c)} title="Editar" className="rounded-md px-2 py-1 text-base-content/50 hover:bg-base-200"><Icon name="edit" className="h-4 w-4" /></button>
                    <button onClick={() => del(c)} title="Excluir" className="rounded-md px-2 py-1 text-red-500 hover:bg-red-100"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* modal novo contato */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? 'Editar contato' : 'Novo contato'}
        size="sm"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {([
            { k: 'phone', label: 'Telefone (DDD + número)', ph: '11999998888' },
            { k: 'name', label: 'Nome', ph: 'João Silva' },
            { k: 'company', label: 'Empresa', ph: 'Transportadora X' },
            { k: 'email', label: 'Email', ph: 'joao@empresa.com' },
          ] as const).map((f) => (
            <div key={f.k}>
              <Label className="mb-1 block text-xs text-base-content/50">{f.label}</Label>
              <Input placeholder={f.ph} {...register(f.k)} />
              {errors[f.k] && <p className="mt-1 text-xs text-red-500">{errors[f.k]?.message}</p>}
            </div>
          ))}
          {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
          {/* ação de status (só ao editar): descadastrar (opt-out) ou reativar */}
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
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button loading={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>

      {/* modal importar */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Importar contatos" size="md">
        <form onSubmit={doImport} className="space-y-3">
          <p className="text-xs text-base-content/50">
            Formato: <code>telefone,nome,empresa</code> (ex: 11999998888,João,Transp X). Só o <strong>telefone</strong> é obrigatório (DDD + número).
          </p>

          {/* opção: subir arquivo .csv/.txt + baixar modelo */}
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

          <div>
            <Label className="mb-1 block text-xs text-base-content/60">Tag desta importação (opcional)</Label>
            <Input
              placeholder="Ex.: Feira-Junho, Lista-Indicação"
              value={importTag}
              onChange={(e) => setImportTag(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-base-content/40">
              Todos os contatos deste arquivo entram com essa tag — facilita escolher na campanha.
            </p>
          </div>

          <Textarea
            className="h-40 font-mono text-xs"
            placeholder={"5511999998888,João Silva,Transportadora X\n5511988887777,Maria"}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
          {importMsg && <p className="text-sm text-base-content/70">{importMsg}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShowImport(false)}>Fechar</Button>
            <Button loading={busy}>{busy ? 'Importando...' : 'Importar'}</Button>
          </div>
        </form>
      </Modal>

      {/* modal gerenciar tags */}
      <Modal open={showTagMgr} onClose={() => { setShowTagMgr(false); setRenamingTag(null); }} title="Gerenciar tags" size="sm">
        {tags.length === 0 ? (
          <p className="py-6 text-center text-sm text-base-content/50">
            Nenhuma tag ainda. Crie uma adicionando a um contato (no card do Inbox ou na seleção em massa).
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
          Para criar uma tag nova, adicione-a a um contato (no card do Inbox ou na seleção em massa). Renomear/excluir aqui vale pra todos os contatos.
        </p>
      </Modal>

      {/* modal histórico de campanhas do contato */}
      <Modal
        open={showHist}
        onClose={() => setShowHist(false)}
        title={`Campanhas recebidas — ${histContact?.name || histContact?.phone || ''}`}
        size="md"
      >
        {histLoading ? (
          <div className="py-8 text-center text-sm text-base-content/50">Carregando histórico…</div>
        ) : histList.length === 0 ? (
          <EmptyState
            icon={<Icon name="campaigns" className="h-9 w-9" />}
            title="Nenhuma campanha"
            description="Este contato ainda não recebeu nenhuma campanha."
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
                    {h.channel === 'email' ? 'e-mail' : 'WhatsApp'} ·{' '}
                    {new Date(h.createdAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <StatusBadge tone={histTone(h.status)}>{h.status}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
