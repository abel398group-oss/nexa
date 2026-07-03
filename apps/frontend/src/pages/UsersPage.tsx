import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { Button, Card, Modal, Input, Icon } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { StandardListPage } from '@/components/shared/StandardListPage';

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
const emptyUser: UserForm = { name: '', email: '', password: '', role: 'admin', permissions: [] };

const AREA_LABEL: Record<string, string> = {
  dashboard: 'Painel', inbox: 'Inbox', contacts: 'Contatos', knowledge: 'Conhecimento',
  sellers: 'Vendedores', campaigns: 'Disparo', ai_control: 'Controle da IA', users: 'Usuarios',
};
const ALL_AREAS = ['dashboard', 'inbox', 'contacts', 'knowledge', 'sellers', 'campaigns', 'ai_control', 'users'];

export function UsersPage() {
  const [show, setShow] = useState(false);
  const {
    register, handleSubmit, reset, setError,
    formState: { errors, isSubmitting },
  } = useForm<UserForm>({ resolver: zodResolver(userSchema), defaultValues: emptyUser });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['users', debouncedSearch],
    queryFn: () => api.get('/users', { params: { search: debouncedSearch || undefined } }).then((r) => r.data as User[]),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const roles = [...new Set(items.map((u) => u.role))];
  const shown = items.filter((u) => u.role !== 'vendedor' && (!roleFilter || u.role === roleFilter));

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

  return (
    <>
      <StandardListPage
        title="Usuarios & Acessos"
        breadcrumb={[{ label: 'Inicio', path: '/dashboard' }, { label: 'Usuarios' }]}
        description="Administradores do sistema (acesso total). Vendedores tem login proprio criado na tela Vendedores."
        isLoading={isLoading}
        hasData={shown.length > 0}
        totalItems={shown.length}
        entityName="usuario(s)"
        headerActions={
          <Button onClick={() => { reset(emptyUser); setShow(true); }}>+ Novo administrador</Button>
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
            {shown.map((u) => (
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

      <Modal open={show} onClose={() => setShow(false)} title="Novo administrador" size="sm">
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
          <p className="text-[11px] text-base-content/40">
            Administrador tem acesso total. Para criar um vendedor (com login e carteira propria),
            use a tela <strong>Vendedores</strong>.
          </p>
          {errors.root && <p className="text-sm text-red-500">{errors.root.message}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setShow(false)}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting}>{isSubmitting ? 'Criando...' : 'Criar administrador'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
