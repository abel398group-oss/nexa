/**
 * SupportEmailSettingsPage — Roteamento de e-mail de suporte por categoria.
 * Rota: /settings/support-email
 *
 * Cada rota mapeia uma categoria de chamado a um destinatario.
 * Rota sem categoria = padrao (fallback para chamados sem categoria especifica).
 * Prioridade: rota da categoria -> rota padrao -> SUPPORT_EMAIL env -> nao envia.
 */
import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { Button, Input, PageContainer, PageHeader, Breadcrumb } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';

interface Route {
  id: string;
  category: string | null;
  email: string;
  label: string | null;
  updatedAt: string;
}

const addSchema = z.object({
  category: z.string().trim().max(80).optional(),
  email: z.string().trim().email('Informe um e-mail valido'),
  label: z.string().trim().max(80).optional(),
});
type AddForm = z.infer<typeof addSchema>;

const SUGGESTED_CATEGORIES = [
  { value: 'fiscal', label: 'Fiscal (CT-e, NF-e)' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'tecnico', label: 'Tecnico / Sistema' },
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'outro', label: 'Outro' },
];

export function SupportEmailSettingsPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddForm>({ resolver: zodResolver(addSchema) });

  const load = useCallback(() => {
    setLoading(true);
    return api
      .get<Route[]>('/settings/support-email/routes')
      .then((r) => setRoutes(r.data))
      .catch(() => toast.error('Erro ao carregar rotas.'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const onAdd = async (form: AddForm) => {
    try {
      await api.put('/settings/support-email/routes', {
        category: form.category?.trim() || undefined,
        email: form.email.trim(),
        label: form.label?.trim() || undefined,
      });
      reset();
      await load();
      toast.success('Rota salva!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao salvar.');
    }
  };

  const onDelete = async (route: Route) => {
    const label = route.category ? `"${route.category}"` : 'padrao';
    const ok = await confirm({ message: `Remover rota ${label}?`, variant: 'danger' });
    if (!ok) return;
    try {
      await api.delete(`/settings/support-email/routes/${route.id}`);
      setRoutes((prev) => prev.filter((r) => r.id !== route.id));
      toast.success('Rota removida.');
    } catch {
      toast.error('Erro ao remover rota.');
    }
  };

  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl space-y-8">
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Inicio', to: '/dashboard' },
                { label: 'E-mail de Suporte' },
              ]}
            />
          }
          title="E-mail de Suporte"
          subtitle="Configure para onde vao os alertas de escalacao. Voce pode ter um endereco padrao e enderecos especificos por categoria de chamado."
        />

        {/* Tabela de rotas existentes */}
        <div className="rounded-xl border border-base-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-base-200">
            <h2 className="text-sm font-semibold text-base-content">Rotas configuradas</h2>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-sm text-base-content/40 text-center">Carregando...</p>
          ) : routes.length === 0 ? (
            <p className="px-5 py-8 text-sm text-base-content/40 text-center">
              Nenhuma rota configurada. Sem rotas, o sistema usa a variavel{' '}
              <code className="bg-base-200 px-1 rounded">SUPPORT_EMAIL</code> do servidor.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-200 bg-base-50">
                  <th className="px-5 py-2 text-left text-xs font-medium text-base-content/60">Categoria</th>
                  <th className="px-5 py-2 text-left text-xs font-medium text-base-content/60">Rotulo</th>
                  <th className="px-5 py-2 text-left text-xs font-medium text-base-content/60">E-mail</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="border-b border-base-100 last:border-0 hover:bg-base-50">
                    <td className="px-5 py-3 font-mono text-xs">
                      {r.category ? (
                        <span className="rounded bg-base-200 px-2 py-0.5">{r.category}</span>
                      ) : (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-primary font-sans font-medium">padrao</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-base-content/60">{r.label ?? '—'}</td>
                    <td className="px-5 py-3">{r.email}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => void onDelete(r)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Formulario para adicionar/editar rota */}
        <div className="rounded-xl border border-base-200 bg-white p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-base-content">Adicionar / atualizar rota</h2>
            <p className="text-xs text-base-content/40 mt-1">
              Deixe a categoria em branco para criar/atualizar a rota padrao. Se a categoria ja existir, a rota sera atualizada.
            </p>
          </div>

          <form onSubmit={handleSubmit(onAdd)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-base-content/70">
                  Categoria <span className="text-base-content/40">(vazio = padrao)</span>
                </label>
                <Input
                  placeholder="fiscal, financeiro, tecnico..."
                  list="category-suggestions"
                  {...register('category')}
                />
                <datalist id="category-suggestions">
                  {SUGGESTED_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </datalist>
                {errors.category && (
                  <p className="text-xs text-red-500">{errors.category.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-base-content/70">Rotulo (opcional)</label>
                <Input placeholder="Equipe Fiscal" {...register('label')} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-base-content/70">E-mail de destino</label>
              <Input
                type="email"
                placeholder="fiscal@empresa.com.br"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar rota'}
              </Button>
            </div>
          </form>
        </div>

        {/* Legenda */}
        <div className="rounded-lg bg-base-200/60 px-4 py-3 text-xs text-base-content/50 space-y-1">
          <p className="font-medium text-base-content/60">Prioridade de resolucao:</p>
          <p>1. Rota especifica da categoria do chamado</p>
          <p>2. Rota padrao (sem categoria)</p>
          <p>3. Variavel <code className="bg-base-200 px-1 rounded">SUPPORT_EMAIL</code> do servidor</p>
          <p>4. Sem configuracao &rarr; alerta nao enviado</p>
        </div>
      </div>
    </PageContainer>
  );
}
