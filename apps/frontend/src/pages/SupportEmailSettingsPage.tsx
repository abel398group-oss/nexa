/**
 * SupportEmailSettingsPage — E-mail de suporte configurável por tenant.
 * Rota: /settings/support-email
 *
 * Quando preenchido, o Nexa envia notificações de escalação para este endereço
 * em vez de usar a variável de ambiente SUPPORT_EMAIL (fallback global).
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { Button, Input, PageContainer, PageHeader, Breadcrumb } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';

const schema = z.object({
  supportEmail: z
    .string()
    .trim()
    .email('Informe um e-mail válido')
    .or(z.literal(''))
    .optional(),
});
type Form = z.infer<typeof schema>;

export function SupportEmailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { supportEmail: '' } });

  useEffect(() => {
    api.get('/settings/support-email')
      .then((r) => reset({ supportEmail: r.data?.supportEmail ?? '' }))
      .catch(() => {/* mantém o default vazio */})
      .finally(() => setLoading(false));
  }, [reset]);

  useEffect(() => {
    const sub = watch(() => setSaved(false));
    return () => sub.unsubscribe();
  }, [watch]);

  const onSubmit = async (form: Form) => {
    setSaved(false);
    try {
      await api.put('/settings/support-email', {
        supportEmail: form.supportEmail?.trim() || undefined,
      });
      setSaved(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Erro ao salvar.';
      toast.error(msg);
    }
  };

  if (loading) {
    return <div className="p-8 text-base-content/50">Carregando...</div>;
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-xl">
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Início', to: '/dashboard' },
                { label: 'E-mail de Suporte' },
              ]}
            />
          }
          title="E-mail de Suporte"
          subtitle="Endereço que recebe alertas quando um chamado é escalado para atendimento humano. Deixe vazio para usar a configuração global do servidor."
        />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="rounded-xl border border-base-200 bg-white p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-base-content/80">
                E-mail do suporte
              </label>
              <p className="text-xs text-base-content/40 mt-0.5">
                Quando preenchido, substitui a variável <code className="bg-base-200 px-1 rounded">SUPPORT_EMAIL</code> do servidor para este cliente.
              </p>
            </div>
            <Input
              type="email"
              placeholder="suporte@empresa.com.br"
              {...register('supportEmail')}
            />
            {errors.supportEmail && (
              <p className="text-xs text-red-500">{errors.supportEmail.message}</p>
            )}
          </div>

          {saved && (
            <div className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
              Configuração salva com sucesso!
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-base-200 pt-4">
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </PageContainer>
  );
}
