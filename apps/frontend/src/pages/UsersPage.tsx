import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { useUnsavedGuard } from '@/shared/lib/useUnsavedGuard';
import { Button, Card, Modal, Input, Icon } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';
import { StandardListPage } from '@/components/shared/StandardListPage';

const PAGE_SIZE = 20;

interface User {
  id: string; email: string; name?: string; role: string;
  permissions: string[]; isActive: boolean;
  /** Cadastro de vendedor ligado ao login — base da carteira e do escopo por market. */
  sellerId?: string | null;
}

/** Vendedor para o seletor de vínculo. */
interface SellerOption { id: string; name: string }

/** Permissões que só funcionam com vínculo de vendedor — a fila filtra por ele. */
const PERMS_QUE_EXIGEM_SELLER = ['sdr', 'closer', 'telemarketing'];

const userSchema = z.object({
  name: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('E-mail invalido'),
  password: z.string().trim().min(6, 'Minimo 6 caracteres'),
  role: z.string(),
  permissions: z.array(z.string()),
  sellerId: z.string().optional(),
});
type UserForm = z.infer<typeof userSchema>;
const emptyUser: UserForm = { name: '', email: '', password: '', role: 'operacional', permissions: [], sellerId: '' };

/** Item do catálogo servido por `GET /users/areas`. */
interface PermCatalogItem {
  id: string;
  label: string;
  group: string;
  /** Substituída por outra — dá para remover, nunca conceder de novo. */
  legacy?: boolean;
}

// A lista de permissões, os rótulos e o agrupamento vinham copiados à mão daqui, e a
// cópia atrasava: `settings` e `webhooks:manage` eram exigidas por rota e não estavam
// aqui nem no backend, então nenhuma tela conseguia concedê-las. Agora vem da API.

// Conjuntos prontos para os papeis do dia a dia — o admin ainda pode ajustar
// marcando/desmarcando area por area depois de criar.
const PRESETS: { id: string; label: string; hint: string; areas: string[] }[] = [
  { id: 'suporte', label: 'Suporte', hint: 'Atende chamados e consulta a base',
    areas: ['dashboard', 'inbox', 'support', 'contacts', 'knowledge'] },
  { id: 'vendas', label: 'Vendas', hint: 'Disparo de leads e funil',
    areas: ['dashboard', 'inbox', 'contacts', 'campaigns', 'opportunities'] },
  { id: 'suporte_vendas', label: 'Suporte + Vendas', hint: 'As duas frentes',
    areas: ['dashboard', 'inbox', 'support', 'contacts', 'knowledge', 'campaigns', 'opportunities', 'metrics'] },
  // Prospecção ativa: trabalha a fila e o funil, mas NÃO sobe nem distribui lista
  // (`lead_batches`) — quem decide de quem é o lead é quem monta a operação, e essa
  // separação é o que sustenta a regra de comissão.
  //
  // SDR e closer viraram dois presets (16/08/2026): antes eram um só, porque a permissão
  // `telemarketing` dava as duas mesas. Quem faz os dois papéis recebe os dois.
  { id: 'sdr', label: 'SDR', hint: 'Trabalha a fila de leads e qualifica',
    areas: ['dashboard', 'inbox', 'contacts', 'opportunities', 'sdr'] },
  { id: 'closer', label: 'Closer', hint: 'Carteira, reuniões e fechamento',
    areas: ['dashboard', 'inbox', 'contacts', 'opportunities', 'closer', 'metrics'] },
];

export function UsersPage() {
  const [show, setShow] = useState(false);
  const {
    register, handleSubmit, reset, setError, watch, setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UserForm>({ resolver: zodResolver(userSchema), defaultValues: emptyUser });

  // Perder um cadastro meio preenchido por F5 ou por fechar a aba sem querer.
  // `isDirty` do react-hook-form volta a false depois do `reset()` que o submit
  // faz, entao o aviso some sozinho assim que salva.
  useUnsavedGuard(isDirty && !isSubmitting);
  const formRole = watch('role');
  const formPerms = watch('permissions');
  const formSellerId = watch('sellerId');
  // Marcar SDR/Closer sem vincular vendedor cria um acesso que abre a fila vazia — o
  // aviso existe para isso não virar um chamado de "o sistema não mostra meus leads".
  const precisaSeller = (formPerms ?? []).some((p) => PERMS_QUE_EXIGEM_SELLER.includes(p));
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

  /**
   * Catálogo de permissões, servido pelo backend.
   *
   * A lista morava aqui copiada à mão e atrasava em relação aos `@RequirePerm` reais —
   * como o backend descarta em silêncio o que não conhece, permissão fora da cópia virava
   * inconcedível sem ninguém perceber. `staleTime` alto porque muda com deploy, não com uso.
   */
  const { data: areas = [] } = useQuery({
    queryKey: ['users', 'areas'],
    queryFn: () => api.get('/users/areas').then((r) => r.data as PermCatalogItem[]),
    staleTime: 60 * 60 * 1000,
  });

  // Vendedores para o vínculo. Sem ele, `User.sellerId` ficava nulo em todo mundo criado
  // por esta tela — e é esse campo que amarra a carteira e o escopo por market.
  const { data: sellers = [] } = useQuery({
    queryKey: ['sellers', 'options'],
    queryFn: () => api.get('/sellers').then((r) => (r.data as SellerOption[]) ?? []),
    staleTime: 5 * 60 * 1000,
  });

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
      // `sellerId` vazio vira `null`: o backend distingue "não mexer" (undefined) de
      // "desvincular" (null), e mandar string vazia estouraria a validação de UUID.
      await api.post('/users', { ...data, sellerId: data.sellerId || null });
      setShow(false);
      reset(emptyUser);
      await invalidate();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setError('root', { message: Array.isArray(m) ? m.join(', ') : m || 'Erro' });
    }
  };

  /** Troca o vínculo de vendedor direto no card, igual às permissões. */
  async function saveSeller(u: User, sellerId: string) {
    try {
      await api.patch(`/users/${u.id}`, { sellerId: sellerId || null });
      await invalidate();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao vincular o vendedor.');
    }
  }

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
                  <div className="space-y-2">
                  {/* Vínculo de vendedor — só aparece para quem opera lead, que é quem
                      precisa dele. Mostrar em todo usuário viraria ruído. */}
                  {u.permissions.some((p) => PERMS_QUE_EXIGEM_SELLER.includes(p)) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-base-content/40">Vendedor:</span>
                      <select
                        value={u.sellerId ?? ''}
                        onChange={(e) => saveSeller(u, e.target.value)}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          u.sellerId ? 'border-base-300' : 'border-amber-500 text-amber-700'
                        }`}
                        style={{ background: 'var(--surface)' }}
                      >
                        <option value="">— sem vínculo (fila vazia) —</option>
                        {sellers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {/* Permissão legada só aparece em quem AINDA a tem: dá para tirar,
                        não para conceder de novo — senão a migração nunca termina. */}
                    {areas.filter((a) => !a.legacy || u.permissions.includes(a.id)).map((a) => {
                      const on = u.permissions.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => savePerms(u, togglePerm(u.permissions, a.id))}
                          title={a.legacy ? 'Permissão antiga — foi substituída, remova quando puder' : a.group}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            on
                              ? a.legacy
                                ? 'border-amber-500 bg-amber-50 text-amber-700'
                                : 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-base-300 text-base-content/50'
                          }`}
                          style={!on ? { background: 'var(--surface)' } : undefined}
                        >
                          {on && <Icon name="check" className="h-3 w-3" />}{a.label}
                        </button>
                      );
                    })}
                  </div>
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
              {/* Agrupado pelo `group` do catálogo: com 18 permissões numa fileira só,
                  achar "Mesa do SDR" no meio de "Webhooks" vira caça-palavra. */}
              {[...new Set(areas.filter((a) => !a.legacy).map((a) => a.group))].map((grupo) => (
                <div key={grupo} className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40">{grupo}</p>
                  <div className="flex flex-wrap gap-2">
                    {areas.filter((a) => a.group === grupo && !a.legacy).map((a) => {
                      const on = (formPerms ?? []).includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setValue('permissions', togglePerm(formPerms ?? [], a.id))}
                          className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-base-300 text-base-content/50'
                          }`}
                          style={!on ? { background: 'var(--surface)' } : undefined}
                        >
                          {on && <Icon name="check" className="h-3 w-3" />}{a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(formPerms ?? []).length === 0 && (
                <p className="text-[11px] text-amber-600">
                  Sem nenhum modulo marcado o usuario entra e nao ve nada.
                </p>
              )}

              {/* Vínculo com o cadastro de vendedor. Fica junto das permissões porque é
                  o que faz a mesa do SDR e a carteira do closer terem conteúdo: a fila
                  filtra por `assignedSellerId` e o escopo de market anda por este id. */}
              <div className="space-y-1 pt-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-base-content/40">
                  Vendedor vinculado
                </label>
                <select
                  {...register('sellerId')}
                  className="w-full rounded-md border border-base-300 bg-transparent px-2 py-1.5 text-sm"
                >
                  <option value="">— sem vínculo —</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {precisaSeller && !formSellerId && (
                  <p className="text-[11px] text-amber-600">
                    Este acesso trabalha leads (SDR/Closer). <strong>Sem vendedor vinculado
                    a fila abre vazia</strong> — o sistema não tem como saber quais leads são dele.
                  </p>
                )}
              </div>
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
