import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { displayPhone } from '@/lib/phone';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { Button, Input, PageContainer, PageHeader, Breadcrumb, Icon, Badge, SkeletonList, EmptyState } from '@/shared/ui';

// E8 — fatia 2: validação de formulário por schema (RHF + Zod), como referência.
// email/password são opcionais; quando preenchidos, precisam ser válidos.
const sellerSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome'),
  phone: z.string().trim().min(8, 'WhatsApp inválido (ex.: 5511999990000)'),
  email: z.string().trim().email('E-mail inválido').optional().or(z.literal('')),
  password: z.string().trim().min(6, 'Mínimo 6 caracteres').optional().or(z.literal('')),
});
type SellerForm = z.infer<typeof sellerSchema>;
const emptyForm: SellerForm = { name: '', phone: '', email: '', password: '' };

interface Seller {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  assignedCount: number;
  loginEmail?: string | null;
}
interface Kpi { id: string; name: string; leads: number; emAndamento: number; ganhos: number; perdidos: number; taxaConversao: number; }

export function SellersPage() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SellerForm>({ resolver: zodResolver(sellerSchema), defaultValues: emptyForm });
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  // debounce da busca (250ms) → alimenta a queryKey
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // React Query: lista de vendedores (busca) + KPIs por vendedor
  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ['sellers', debouncedSearch],
    queryFn: () => api.get('/sellers', { params: { search: debouncedSearch || undefined } }).then((r) => r.data as Seller[]),
  });
  const { data: kpis = [] } = useQuery({
    queryKey: ['sellers-kpis'],
    queryFn: () => api.get('/metrics/sellers').then((r) => r.data as Kpi[]),
  });
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sellers'] }),
      queryClient.invalidateQueries({ queryKey: ['sellers-kpis'] }),
    ]);

  function toggleSel(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected((s) => (s.size === items.length ? new Set() : new Set(items.map((x) => x.id))));
  }
  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const ok = await confirm({
      title: 'Excluir vendedores',
      message: `Excluir ${ids.length} vendedor(es)? As conversas atribuídas e os logins são desvinculados (não apagados).`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.post('/sellers/bulk-delete', { ids });
      toast.success(`${ids.length} vendedor(es) excluído(s).`);
      setSelected(new Set());
      await invalidate();
    } catch { toast.error('Erro ao excluir em lote.'); }
  }

  const onSubmit = async (data: SellerForm) => {
    const payload = {
      name: data.name,
      phone: data.phone,
      email: data.email || undefined,
      password: data.password || undefined,
    };
    try {
      if (editId) {
        await api.patch(`/sellers/${editId}`, payload);
        toast.success('Vendedor atualizado!');
      } else {
        await api.post('/sellers', payload);
        toast.success('Vendedor adicionado!');
      }
      reset(emptyForm);
      setEditId(null);
      await invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      const txt = Array.isArray(m) ? m.join(', ') : m || 'Erro';
      setError('root', { message: txt }); // erro vindo do backend
      toast.error(txt);
    }
  };

  function openEdit(s: Seller) {
    setEditId(s.id);
    reset({ name: s.name, phone: s.phone, email: s.loginEmail || '', password: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cancelEdit() {
    setEditId(null);
    reset(emptyForm);
  }
  async function del(s: Seller) {
    const ok = await confirm({
      title: 'Excluir vendedor',
      message: `Excluir ${s.name}? As conversas dele ficam sem responsável e o login (se houver) é desvinculado.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.delete(`/sellers/${s.id}`);
      toast.success('Vendedor excluído.');
      await invalidate();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  async function toggle(s: Seller) {
    await api.patch(`/sellers/${s.id}/active`, { active: !s.active });
    await invalidate();
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Vendedores' }]} />}
        title="Vendedores"
        subtitle="Leads quentes são distribuídos (round-robin) e notificados no WhatsApp"
      />

      {/* ===== KPIs de desempenho ===== */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-base-content/70">Desempenho de vendas</h2>
        {loading ? (
          <SkeletonList rows={2} />
        ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <tr>
                <th className="px-4 py-2.5">Vendedor</th>
                <th className="px-4 py-2.5">Leads</th>
                <th className="px-4 py-2.5">Em andamento</th>
                <th className="px-4 py-2.5">Ganhos</th>
                <th className="px-4 py-2.5">Perdidos</th>
                <th className="px-4 py-2.5">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {kpis.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-base-content/40">Sem dados ainda.</td></tr>}
              {kpis.map((k) => (
                <tr key={k.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2.5 font-medium text-base-content">{k.name}</td>
                  <td className="px-4 py-2.5 text-base-content/70">{k.leads}</td>
                  <td className="px-4 py-2.5 text-base-content/70">{k.emAndamento}</td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{k.ganhos}</span></td>
                  <td className="px-4 py-2.5"><span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{k.perdidos}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-base-200">
                        <div className="h-full bg-brand-500" style={{ width: `${k.taxaConversao}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-base-content">{k.taxaConversao}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card mb-6 p-4">
        <div className="mb-2 flex flex-wrap items-start gap-2">
          <div className="flex-1">
            <Input placeholder="Nome do vendedor" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div className="flex-1">
            <Input placeholder="WhatsApp (5511...)" {...register('phone')} />
            {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message}</p>}
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-start gap-2">
          <div className="flex-1">
            <Input placeholder={editId ? 'E-mail de login' : 'E-mail de login (opcional)'} {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <div className="flex-1">
            <Input type="password" placeholder={editId ? 'Nova senha (vazio = manter)' : 'Senha (mín. 6)'} {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <Button loading={isSubmitting}>
            {editId ? 'Salvar' : '+ Adicionar'}
          </Button>
          {editId && (
            <Button type="button" variant="ghost" onClick={cancelEdit}>
              Cancelar
            </Button>
          )}
        </div>
        <p className="text-xs text-base-content/40">
          {editId
            ? 'Editando — altere nome/WhatsApp. Pra dar/trocar login: preencha e-mail + senha. Pra só resetar a senha: deixe o e-mail e digite a nova senha.'
            : 'Preencha e-mail + senha para o vendedor ter login próprio (vê só a carteira dele).'}
        </p>
      </form>
      {errors.root && <p className="mb-4 text-sm text-red-500">{errors.root.message}</p>}

      {/* busca + ações em lote */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="!w-64" placeholder="Buscar vendedor (nome ou telefone)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {selected.size > 0 && (
          <>
            <span className="text-xs text-base-content/50">{selected.size} selecionado(s)</span>
            <Button size="sm" variant="outline" onClick={deleteSelected} className="text-red-500 hover:bg-red-50">
              <Icon name="trash" className="h-4 w-4" /> Excluir
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Icon name="sellers" className="h-9 w-9" />} title="Nenhum vendedor cadastrado" description="Adicione um vendedor no formulário acima — ele recebe os leads quentes." />
      ) : (
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase" style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={items.length > 0 && selected.size === items.length} onChange={toggleAll} className="h-4 w-4 align-middle accent-brand-500" />
              </th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Leads recebidos</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-base-content/40">Nenhum vendedor. Adicione um acima.</td></tr>}
            {items.map((s) => (
              <tr key={s.id} className={`border-b last:border-0 ${selected.has(s.id) ? 'bg-brand-500/[0.06]' : ''}`} style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSel(s.id)} className="h-4 w-4 align-middle accent-brand-500" />
                </td>
                <td className="px-4 py-3 font-medium text-base-content">
                  {s.name}
                  <div className="text-[11px] font-normal text-base-content/40">{s.loginEmail || 'sem login'}</div>
                </td>
                <td className="px-4 py-3 text-base-content/70">{displayPhone(s.phone)}</td>
                <td className="px-4 py-3 text-base-content/70">{s.assignedCount}</td>
                <td className="px-4 py-3">
                  <Badge variant={s.active ? 'success' : 'neutral'}>{s.active ? 'ativo' : 'inativo'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => toggle(s)}>
                      {s.active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <button onClick={() => openEdit(s)} title="Editar" className="rounded-md px-2 py-1 text-base-content/50 hover:bg-base-200"><Icon name="edit" className="h-4 w-4" /></button>
                    <button onClick={() => del(s)} title="Excluir" className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50"><Icon name="trash" className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </PageContainer>
  );
}
