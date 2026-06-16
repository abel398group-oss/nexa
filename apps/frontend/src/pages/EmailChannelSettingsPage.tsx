/**
 * EmailChannelSettingsPage — Configurações do canal de e-mail (ADR 021)
 * Rota: /settings/email-channel
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { Button, Input, Checkbox, PageContainer, PageHeader, Breadcrumb } from '@/shared/ui';

// validação do canal de e-mail (RHF + Zod). Portas como string (input number → string).
const emailSchema = z.object({
  fromEmail: z.string().trim().email('E-mail de envio inválido'),
  fromName: z.string().trim().optional().or(z.literal('')),
  replyTo: z.string().trim().email('Reply-To inválido').optional().or(z.literal('')),
  smtpHost: z.string().trim().min(1, 'Informe o servidor SMTP'),
  smtpPort: z.string().trim().min(1, 'Informe a porta'),
  // usuário SMTP/IMAP normalmente é o e-mail, mas alguns provedores usam só um
  // login — não força formato de e-mail (espelha o HiperTMS), só exige preenchido.
  smtpUser: z.string().trim().min(1, 'Informe o usuário SMTP'),
  smtpPass: z.string().optional().or(z.literal('')),
  smtpSecure: z.boolean(),
  imapHost: z.string().trim().min(1, 'Informe o servidor IMAP'),
  imapPort: z.string().trim().min(1, 'Informe a porta'),
  imapUser: z.string().trim().min(1, 'Informe o usuário IMAP'),
  imapPass: z.string().optional().or(z.literal('')),
  imapMailbox: z.string().trim().min(1, "Normalmente 'INBOX'"),
  isActive: z.boolean(),
});
type EmailForm = z.infer<typeof emailSchema>;

const DEFAULT: EmailForm = {
  fromEmail: '',
  fromName: 'Lia HiperTMS',
  replyTo: '',
  smtpHost: 'mail.hipertms.com.br',
  smtpPort: '465',
  smtpUser: '',
  smtpPass: '',
  smtpSecure: true,
  imapHost: 'mail.hipertms.com.br',
  imapPort: '993',
  imapUser: '',
  imapPass: '',
  imapMailbox: 'INBOX',
  isActive: true,
};

export function EmailChannelSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [showPasses, setShowPasses] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmailForm>({ resolver: zodResolver(emailSchema), defaultValues: DEFAULT });

  // carrega config existente e popula o form
  useEffect(() => {
    api.get('/settings/email-channel')
      .then((r) => {
        if (r.data) {
          reset({
            ...DEFAULT,
            fromEmail: r.data.fromEmail ?? '',
            fromName: r.data.fromName ?? 'Lia HiperTMS',
            replyTo: r.data.replyTo ?? '',
            smtpHost: r.data.smtpHost ?? 'mail.hipertms.com.br',
            smtpPort: String(r.data.smtpPort ?? 465),
            smtpUser: r.data.smtpUser ?? '',
            smtpSecure: r.data.smtpSecure ?? true,
            imapHost: r.data.imapHost ?? 'mail.hipertms.com.br',
            imapPort: String(r.data.imapPort ?? 993),
            imapUser: r.data.imapUser ?? '',
            imapMailbox: r.data.imapMailbox ?? 'INBOX',
            isActive: r.data.isActive ?? true,
          });
        }
      })
      .catch(() => {/* canal ainda não configurado — usa defaults */})
      .finally(() => setLoading(false));
  }, [reset]);

  // some o aviso "salvo" assim que o usuário edita qualquer campo
  useEffect(() => {
    const sub = watch(() => setSaved(false));
    return () => sub.unsubscribe();
  }, [watch]);

  const smtpPass = watch('smtpPass');
  const imapPass = watch('imapPass');

  const onSubmit = async (form: EmailForm) => {
    setSaved(false);
    try {
      await api.put('/settings/email-channel', {
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        replyTo: form.replyTo || undefined,
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort),
        smtpUser: form.smtpUser,
        smtpPass: form.smtpPass || undefined, // vazio = não altera a senha salva
        smtpSecure: form.smtpSecure,
        imapHost: form.imapHost,
        imapPort: Number(form.imapPort),
        imapUser: form.imapUser,
        imapPass: form.imapPass || undefined,
        imapMailbox: form.imapMailbox,
        isActive: form.isActive,
      });
      setSaved(true);
      // limpa os campos de senha após salvar (segurança)
      reset({ ...form, smtpPass: '', imapPass: '' });
    } catch (err: any) {
      setError('root', { message: err?.response?.data?.message ?? 'Erro ao salvar configurações.' });
    }
  };

  if (loading) {
    return <div className="p-8 text-base-content/50">Carregando configurações...</div>;
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl">
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Início', to: '/dashboard' }, { label: 'Canal de E-mail' }]} />}
        title="Canal de E-mail"
        subtitle="Configure o endereço de e-mail da Lia para enviar e receber mensagens. Use as credenciais do servidor de e-mail (Hostgator / cPanel)."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Status ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-xl border border-base-200 bg-white p-4">
          <div>
            <div className="font-medium text-base-content">Canal ativo</div>
            <div className="text-xs text-base-content/50">
              Quando ativo, a Lia verifica e-mails novos a cada minuto.
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" {...register('isActive')} />
            <div className="peer h-6 w-11 rounded-full bg-base-300 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full" />
          </label>
        </div>

        {/* ── Remetente ──────────────────────────────────────────────── */}
        <Section title="Remetente" subtitle="Endereço que o lead vê ao receber o e-mail.">
          <Field label="E-mail de envio" required error={errors.fromEmail?.message}>
            <Input type="email" {...register('fromEmail')} placeholder="lia@hipertms.com.br" />
          </Field>
          <Field label="Nome de exibição">
            <Input type="text" {...register('fromName')} placeholder="Lia HiperTMS" />
          </Field>
          <Field label="Reply-To (opcional)" hint="E-mail que recebe respostas manuais do lead." error={errors.replyTo?.message}>
            <Input type="email" {...register('replyTo')} placeholder="contato@hipertms.com.br" />
          </Field>
        </Section>

        {/* ── SMTP (envio) ────────────────────────────────────────────── */}
        <Section title="SMTP — Envio" subtitle="Servidor de saída. Hostgator: mail.hipertms.com.br porta 465.">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Servidor SMTP" error={errors.smtpHost?.message}>
                <Input type="text" {...register('smtpHost')} placeholder="mail.hipertms.com.br" />
              </Field>
            </div>
            <div>
              <Field label="Porta" error={errors.smtpPort?.message}>
                <Input type="number" {...register('smtpPort')} />
              </Field>
            </div>
          </div>
          <Field label="Usuário SMTP" required error={errors.smtpUser?.message}>
            <Input type="text" autoComplete="username" {...register('smtpUser')} placeholder="lia@hipertms.com.br" />
          </Field>
          <Field label="Senha SMTP" hint={smtpPass === '' ? 'Deixe vazio para manter a senha atual.' : ''}>
            <Input type={showPasses ? 'text' : 'password'} {...register('smtpPass')} placeholder="••••••••" autoComplete="new-password" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-base-content/70">
            <Checkbox {...register('smtpSecure')} />
            Usar SSL/TLS (recomendado — porta 465)
          </label>
        </Section>

        {/* ── IMAP (recebimento) ──────────────────────────────────────── */}
        <Section title="IMAP — Recebimento" subtitle="Servidor de entrada. Hostgator: mail.hipertms.com.br porta 993.">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Servidor IMAP" error={errors.imapHost?.message}>
                <Input type="text" {...register('imapHost')} placeholder="mail.hipertms.com.br" />
              </Field>
            </div>
            <div>
              <Field label="Porta" error={errors.imapPort?.message}>
                <Input type="number" {...register('imapPort')} />
              </Field>
            </div>
          </div>
          <Field label="Usuário IMAP" required error={errors.imapUser?.message}>
            <Input type="text" autoComplete="username" {...register('imapUser')} placeholder="lia@hipertms.com.br" />
          </Field>
          <Field label="Senha IMAP" hint={imapPass === '' ? 'Deixe vazio para manter a senha atual.' : ''}>
            <Input type={showPasses ? 'text' : 'password'} {...register('imapPass')} placeholder="••••••••" autoComplete="new-password" />
          </Field>
          <Field label="Caixa IMAP" hint="Normalmente 'INBOX'." error={errors.imapMailbox?.message}>
            <Input type="text" {...register('imapMailbox')} placeholder="INBOX" />
          </Field>
        </Section>

        {/* mostrar/ocultar senhas */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-base-content/60">
          <Checkbox checked={showPasses} onChange={(e) => setShowPasses(e.target.checked)} />
          Mostrar senhas
        </label>

        {errors.root && (
          <div className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{errors.root.message}</div>
        )}
        {saved && (
          <div className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
            Configurações salvas com sucesso!
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-base-200 pt-4">
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? 'Salvando…' : 'Salvar configurações'}
          </Button>
        </div>
      </form>
      </div>
    </PageContainer>
  );
}

// Componentes auxiliares
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-base-200 bg-white p-5 space-y-4">
      <div>
        <div className="font-medium text-base-content">{title}</div>
        {subtitle && <div className="text-xs text-base-content/50 mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-base-content/80">
        {label}{required && <span className="text-error ml-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {!error && hint && <p className="text-xs text-base-content/40">{hint}</p>}
    </div>
  );
}
