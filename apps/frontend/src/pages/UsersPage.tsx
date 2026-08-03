import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { Button, Card, Modal, Input, Icon } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { StandardListPage } from '@/components/shared/StandardListPage';

const PAGE_SIZE = 20;

interface User {
  id: string; email: string; name?: string; role: string;
  permissions: string[]; isActive: boolean;
}

const userSchema = z.object({
  name: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('E-mail invalido'),
  password: z.string().trim().min(6, 'Minimo 6 caracteres'),
  role: z.string(),
  permissions: z.array(z.string()),
});
type UserForm = z.infer<typeof userSchema>;
const emptyUser: UserForm = { name: '', email: '', password: '', role: 'operacional', permissions: [] };

const AREA_LABEL: Record<string, string> = {
  dashboard: 'Painel', inbox: 'Inbox', contacts: 'Contatos', knowledge: 'Conhecimento',
  sellers: 'Vendedores', campaigns: 'Disparo', opportunities: 'Leads / Funil',
  metrics: 'Metricas', ai_control: 'Controle da IA', users: 'Usuarios',
};
// Precisa espelhar AREAS do backend (users.service.ts) — o que nao estiver la e
// descartado no create/update.
const ALL_AREAS = [
  'dashboard', 'inbox', 'contacts', 'knowledge', 'sellers',
  'campaigns', 'opportunities', 'metrics', 'ai_control', 'users',
];

// Conjuntos prontos para os papeis do dia a dia — o admin ainda pode ajustar
// marcando/desmarcando area por area depois de criar.
const PRESETS: { id: string; label: string; hint: string; areas: string[] }[] = [
  { id: 'suporte', label: 'Suporte', hint: 'Atende o inbox e consulta a base',
    areas: ['dashboard', 'inbox', 'contacts', 'knowledge'] },
  { id: 'vendas', label: 'Vendas', hint: 'Disparo de leads e funil',
    areas: ['dashboard', 'inbox', 'contacts', 'campaigns', 'opportunities'] },
  { id: 'suporte_vendas', label: 'Suporte + Vendas', hint: 'As duas frentes',
    areas: ['dashboard', 'inbox', 'contacts', 'knowledge', 'campaigns', 'opportunities', 'metrics'] },
];

export function UsersPage() {
  const [show, setShow] = useState(false);
  const {
    register, handleSubmit, reset, setError, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserForm>({ resolver: zodResolver(userSchema), defaultValues: emptyUser });
  const formRole = watch('role');
  const formPerms = watch('permissions');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  // edicao de usuario existente (tipo de acesso + reset de senha)
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState('operacional');
  const [editPassword, setEditPassword] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['users', debouncedSearch],
    queryFn: () => api.get('/users', { params: { search: debouncedSearch || undefined } }).then((r) => r.data as User[]),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const roles = [...new Set(items.map((u) => u.role))];
  const shown = items.filter((u) => u.role !== 'vendedor' && (!roleFilter || u.role === roleFilter));

  // Reset page quando filtro ou busca muda.
  useEffect(() => { setPage(1); }, [debouncedSearch, roleFilter]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [shown, page],
  );

  async function del(u: User) {
    const ok = await confirm({
      title: 'Excluir usuario',
      message: `Excluir o login de ${u.name || u.email}? Ele perde o acesso imediatamente.`,
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success('Usuario excluido.');
      await invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao excluir o usuario.');
    }
  }

  function togglePerm(set: string[], p: string) {
    return set.includes(p) ? set.filter((x) => x !== p) : [...set, p];
  }

  const onSubmit = async (data: UserForm) => {
    try {
      await api.post('/users', data);
      setShow(false);
      reset(emptyUser);
      await invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError('root', { message: Array.isArray(m) ? m.join(', ') : m || 'Erro' });
    }
  };

  async function savePerms(u: User, perms: string[]) {
    queryClient.setQueryData<User[]>(['users', debouncedSearch], (prev) =>
      prev?.map((x) => (x.id === u.id ? { ...x, permissions: perms } : x)) ?? prev,
    );
    await api.patch(`/users/${u.id}`, { permissions: perms });
  }
  async function toggleActive(u: User) {
    await api.patch(`/users/${u.id}/active`, { active: !u.isActive });
    await invalidate();
  }

  // Edicao de usuario existente: trocar tipo de acesso e resetar senha.
  // O backend ja aceitava as duas coisas (PATCH /users/:id) — faltava a tela,
  // entao um admin criado por engano nao tinha como ser rebaixado e uma senha
  // esquecida so se resolvia no banco.
  async function saveEditUser() {
    if (!editUser) return;
    const novaSenha = editPassword.trim();
    if (novaSenha && novaSenha.length < 6) {
      toast.error('A senha precisa ter no minimo 6 caracteres.');
      return;
    }
    setEditBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      if (editRole !== editUser.role) payload.role = editRole;
      if (novaSenha) payload.password = novaSenha;
      if (Object.keys(payload).length === 0) { setEditUser(null); return; }

      await api.patch(`/users/${editUser.id}`, payload);
      toast.success(
        novaSenha && payload.role ? 'Acesso e senha atualizados.'
          : novaSenha ? 'Senha redefinida.'
          : 'Tipo de acesso atualizado.',
      );
      setEditUser(null);
      setEditPassword('');
      await invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      toast.error(Array.isArray(m) ? m.join(', ') : m || 'Erro ao salvar.');
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <>
      <StandardListPage
        title="Usuarios & Acessos"
        breadcrumb={[{ label: 'Inicio', path: '/dashboard' }, { label: 'Usuarios' }]}
        description="Quem acessa o Nexa e o que cada um enxerga. Clique nos modulos do cartao para liberar ou tirar acesso na hora. Vendedores tem login proprio, criado na tela Vendedores."
        isLoading={isLoading}
        hasData={shown.length > 0}
        error={isError ? new Error('Falha ao carregar usuarios') : undefined}
        onRetry={() => refetch()}
        totalItems={shown.length}
        totalShowing={pageItems.length}
        entityName="usuario(s)"
        pagination={pageCount > 1 ? { page, pageCount, onPageChange: setPage } : undefined}
        headerActions={
          <Button onClick={() => { reset(emptyUser); setShow(true); }}>+ Novo usuario</Button>
        }
        extraToolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="!w-64"
              placeholder="Buscar nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="input !w-auto text-sm"
              title="Filtrar por perfil"
            >
              <option value="">Todos os perfis</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        }
      >
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-base-content/40">
            <Icon name="users" className="h-9 w-9" />
            <p className="text-sm">Nenhum usuario encontrado.</p>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {pageItems.map((u) => (
              <Card key={u.id} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-base-content">{u.name || u.email}</span>
                    <span className="ml-2 text-xs text-base-content/50">{u.email}</span>
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${
                        u.role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-base-200 text-base-content/70'
                      }`}
                    >
                      {u.role}
                    </span>
                    {!u.isActive && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">inativo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditUser(u); setEditRole(u.role); setEditPassword(''); }}
                      title="Trocar tipo de acesso ou redefinir a senha"
                      className="rounded-md border border-base-300 px-3 py-1 text-xs hover:bg-base-100"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleActive(u)}
                      className="rounded-md border border-base-300 px-3 py-1 text-xs hover:bg-base-100"
                    >
                      {u.isActive ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => del(u)}
                      title="Excluir usuario"
                      className="rounded-md px-2 py-1 text-red-500 hover:bg-red-50"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {u.role === 'admin' ? (
                  <p className="text-xs text-base-content/50">Acesso total (administrador)</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {ALL_AREAS.map((a) => {
                      const on = u.permissions.includes(a);
                      return (
                        <button
                          key={a}
                          onClick={() => savePerms(u, togglePerm(u.permissions, a))}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/50'
                          }`}
                          style={!on ? { background: 'var(--surface)' } : undefined}
                        >
                          {on && <Icon name="check" className="h-3 w-3" />}{AREA_LABEL[a]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </StandardListPage>

      {/* Editar usuario existente — tipo de acesso e senha */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Editar ${editUser?.name || editUser?.email || ''}`} size="sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-base-content/60">Tipo de acesso</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEditRole('operacional')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  editRole !== 'admin' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/60'
                }`}
              >
                <span className="block font-medium">Acesso por modulo</span>
                <span className="block text-[11px] opacity-70">marque no cartao</span>
              </button>
              <button
                type="button"
                onClick={() => setEditRole('admin')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  editRole === 'admin' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/60'
                }`}
              >
                <span className="block font-medium">Administrador</span>
                <span className="block text-[11px] opacity-70">acesso total</span>
              </button>
            </div>
            {editUser && editRole !== editUser.role && editRole === 'admin' && (
              <p className="mt-1 text-[11px] text-amber-600">
                Vira admin: passa a ver tudo e os modulos marcados sao zerados.
              </p>
            )}
            {editUser && editRole !== editUser.role && editRole !== 'admin' && (
              <p className="mt-1 text-[11px] text-amber-600">
                Deixa de ser admin: entra sem nenhum modulo — marque no cartao depois de salvar.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-base-content/60">
              Nova senha <span className="text-base-content/40">· deixe vazio para manter</span>
            </label>
            <Input
              type="password"
              placeholder="Minimo 6 caracteres"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={saveEditUser} loading={editBusy}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={show} onClose={() => setShow(false)} title="Novo usuario" size="sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Input placeholder="Nome" {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <div>
            <Input placeholder="E-mail" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <div>
            <Input type="password" placeholder="Senha (min. 6)" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
          </div>
          {/* Papel: admin ve tudo; operador so o que for marcado abaixo. */}
          <div>
            <label className="mb-1 block text-xs font-medium text-base-content/60">Tipo de acesso</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValue('role', 'operacional')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  formRole !== 'admin' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/60'
                }`}
              >
                <span className="block font-medium">Acesso por modulo</span>
                <span className="block text-[11px] opacity-70">voce escolhe abaixo</span>
              </button>
              <button
                type="button"
                onClick={() => setValue('role', 'admin')}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  formRole === 'admin' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/60'
                }`}
              >
                <span className="block font-medium">Administrador</span>
                <span className="block text-[11px] opacity-70">acesso total</span>
              </button>
            </div>
          </div>

          {formRole !== 'admin' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-base-content/40">Atalhos:</span>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.hint}
                    onClick={() => setValue('permissions', p.areas)}
                    className="rounded-md border border-base-300 px-2 py-0.5 text-[11px] text-base-content/60 hover:border-brand-500 hover:text-brand-600"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {ALL_AREAS.map((a) => {
                  const on = (formPerms ?? []).includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setValue('permissions', togglePerm(formPerms ?? [], a))}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/50'
                      }`}
                      style={!on ? { background: 'var(--surface)' } : undefined}
                    >
                      {on && <Icon name="check" className="h-3 w-3" />}{AREA_LABEL[a]}
                    </button>
                  );
                })}
              </div>
              {(formPerms ?? []).length === 0 && (
                <p className="text-[11px] text-amber-600">
                  Sem nenhum modulo marcado o usuario entra e nao ve nada.
                </p>
              )}
            </div>
          )}

          <p className="text-[11px] text-base-content/40">
            Para criar um <strong>vendedor</strong> (com login e carteira propria de leads),
            use a tela <strong>Vendedores</strong> — la o acesso ja vem pronto.
          </p>
          {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShow(false)}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>{isSubmitting ? 'Criando...' : 'Criar usuario'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
