import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { displayPhone } from '@/shared/lib/phone';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { Button, Input, Icon, Badge } from '@/shared/ui';
import {
  type Seller,
  type SellerKpi,
  listSellers,
  listSellerKpis,
  createSeller,
  updateSeller,
  toggleSellerActive,
  deleteSeller,
  bulkDeleteSellers,
} from '@/entities/seller';
import { StandardListPage } from '@/components/shared/StandardListPage';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';

const sellerSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome'),
  phone: z.string().trim().min(8, 'WhatsApp invalido (ex.: 5511999990000)'),
  email: z.string().trim().email('E-mail invalido').optional().or(z.literal('')),
  password: z.string().trim().min(6, 'Minimo 6 caracteres').optional().or(z.literal('')),
});
type SellerForm = z.infer<typeof sellerSchema>;
const emptyForm: SellerForm = { name: '', phone: '', email: '', password: '' };

function KpiTable({ kpis }: { kpis: SellerKpi[] }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-base-content/70">Desempenho de vendas</h2>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead
            className="border-b text-left text-xs uppercase"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <tr>
              <th className="px-4 py-2.5">Vendedor</th>
              <th className="px-4 py-2.5">Leads</th>
              <th className="px-4 py-2.5">Em andamento</th>
              <th className="px-4 py-2.5">Ganhos</th>
              <th className="px-4 py-2.5">Perdidos</th>
              <th className="px-4 py-2.5">Conversao</th>
            </tr>
          </thead>
          <tbody>
            {kpis.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-base-content/40">Sem dados ainda.</td></tr>
            )}
            {kpis.map((k) => (
              <tr key={k.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-2.5 font-medium text-base-content">{k.name}</td>
                <td className="px-4 py-2.5 text-base-content/70">{k.leads}</td>
                <td className="px-4 py-2.5 text-base-content/70">{k.emAndamento}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{k.ganhos}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{k.perdidos}</span>
                </td>
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
    </div>
  );
}

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ['sellers', debouncedSearch],
    queryFn: () => listSellers(debouncedSearch),
  });
  const { data: kpis = [] } = useQuery<SellerKpi[]>({
    queryKey: ['sellers-kpis'],
    queryFn: listSellerKpis,
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
      message: `Excluir ${ids.length} vendedor(es)? As conversas atribuidas e os logins sao desvinculados (nao apagados).`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await bulkDeleteSellers(ids);
      toast.success(`${ids.length} vendedor(es) excluido(s).`);
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
        await updateSeller(editId, payload);
        toast.success('Vendedor atualizado!');
      } else {
        await createSeller(payload);
        toast.success('Vendedor adicionado!');
      }
      reset(emptyForm);
      setEditId(null);
      await invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      const txt = Array.isArray(m) ? m.join(', ') : m || 'Erro';
      setError('root', { message: txt });
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
      message: `Excluir ${s.name}? As conversas dele ficam sem responsavel e o login (se houver) e desvinculado.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await deleteSeller(s.id);
      toast.success('Vendedor excluido.');
      await invalidate();
    } catch {
      toast.error('Erro ao excluir.');
    }
  }

  async function toggle(s: Seller) {
    await toggleSellerActive(s.id, !s.active);
    await invalidate();
  }

  const columns: DataTableColumn<Seller>[] = [
    {
      id: 'select',
      width: '44px',
      header: (
        <input
          type="checkbox"
          checked={items.length > 0 && selected.size === items.length}
          onChange={toggleAll}
          className="size-4 align-middle accent-brand-500"
          title="Selecionar todos"
        />
      ),
      mobileHidden: true,
      cell: (s) => (
        <input
          type="checkbox"
          checked={selected.has(s.id)}
          onChange={() => toggleSel(s.id)}
          className="size-4 align-middle accent-brand-500"
        />
      ),
    },
    {
      id: 'name',
      header: 'Nome',
      mobileTitle: true,
      cell: (s) => (
        <div>
          <span className="font-medium text-base-content">{s.name}</span>
          <div className="text-[11px] text-base-content/40">{s.loginEmail || 'sem login'}</div>
        </div>
      ),
    },
    {
      id: 'phone',
      header: 'WhatsApp',
      mobileHidden: true,
      cell: (s) => <span className="text-base-content/70">{displayPhone(s.phone)}</span>,
    },
    {
      id: 'assignedCount',
      header: 'Leads recebidos',
      mobileHidden: true,
      cell: (s) => <span className="text-base-content/70">{s.assignedCount}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      mobileLabel: 'Status',
      cell: (s) => <Badge variant={s.active ? 'success' : 'neutral'}>{s.active ? 'ativo' : 'inativo'}</Badge>,
    },
    {
      id: 'toggle',
      header: '',
      mobileHidden: true,
      cell: (s) => (
        <Button variant="outline" size="sm" onClick={() => toggle(s)}>
          {s.active ? 'Desativar' : 'Ativar'}
        </Button>
      ),
    },
  ];

  return (
    <StandardListPage
      title="Vendedores"
      breadcrumb={[{ label: 'Inicio', to: '/dashboard' }, { label: 'Vendedores' }]}
      description="Leads quentes sao distribuidos (round-robin) e notificados no WhatsApp"
      isLoading={loading}
      hasData={items.length > 0}
      entityName="vendedor(es)"
      topContent={
        <>
          <KpiTable kpis={kpis} />
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
                <Input type="password" placeholder={editId ? 'Nova senha (vazio = manter)' : 'Senha (min. 6)'} {...register('password')} />
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
            {errors.root && <p className="mb-2 text-sm text-red-500">{errors.root.message}</p>}
            <p className="text-xs text-base-content/40">
              {editId
                ? 'Editando — altere nome/WhatsApp. Pra dar/trocar login: preencha e-mail + senha. Pra so resetar a senha: deixe o e-mail e digite a nova senha.'
                : 'Preencha e-mail + senha para o vendedor ter login proprio (ve so a carteira dele).'}
            </p>
          </form>
        </>
      }
      extraToolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="!w-64"
            placeholder="Buscar vendedor (nome ou telefone)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {selected.size > 0 && (
            <>
              <span className="text-xs text-base-content/50">{selected.size} selecionado(s)</span>
              <Button size="sm" variant="outline" onClick={deleteSelected} className="text-red-500 hover:bg-red-50">
                <Icon name="trash" className="h-4 w-4" /> Excluir
              </Button>
            </>
          )}
        </div>
      }
    >
      <DataTable
        columns={columns}
        rows={items}
        getRowId={(s) => s.id}
        rowClassName={(s) => selected.has(s.id) ? 'bg-brand-500/[0.06]' : undefined}
        rowActions={(s) => [
          { label: 'Editar', onClick: () => openEdit(s) },
          { label: s.active ? 'Desativar' : 'Ativar', onClick: () => toggle(s) },
          { label: 'Excluir', onClick: () => del(s), destructive: true },
        ]}
        empty={{
          icon: <Icon name="sellers" className="h-9 w-9" />,
          title: 'Nenhum vendedor cadastrado',
          description: 'Adicione um vendedor no formulario acima.',
        }}
      />
    </StandardListPage>
  );
}
