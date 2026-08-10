/**
 * EmailChannelSettingsPage — caixas de e-mail do tenant (ADR 021 · perfis 10/08/2026)
 * Rota: /settings/email-channel
 *
 * Era uma caixa só. Quando a prospecção passou a sair do endereço do vendedor em
 * vez do da Lia, salvar significava SOBRESCREVER a única linha — e a resposta a
 * qualquer disparo anterior cairia numa caixa que ninguém mais lê.
 *
 * Agora a tela lista as caixas. Todas as ativas continuam sendo lidas; a marcada
 * como remetente é a que envia, e trocar é um clique. A senha de cada caixa é
 * digitada uma vez, no cadastro dela — não há como o sistema adivinhá-la.
 */
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
import { Button, Input, Checkbox, PageContainer, PageHeader, Breadcrumb } from '@/shared/ui';
import { useToast } from '@/app/providers/ToastContext';
import { useConfirm } from '@/app/providers/ConfirmContext';

// validação da caixa (RHF + Zod). Portas como string (input number → string).
const emailSchema = z.object({
  label: z.string().trim().min(1, 'Dê um nome para identificar esta caixa'),
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
  imapSentMailbox: z.string().trim().optional().or(z.literal('')),
  isActive: z.boolean(),
});
type EmailForm = z.infer<typeof emailSchema>;

interface Caixa {
  id: string;
  label: string;
  isSender: boolean;
  isActive: boolean;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapMailbox: string;
  imapSentMailbox: string | null;
  lastPollAt: string | null;
}

const DEFAULT: EmailForm = {
  label: '',
  fromEmail: '',
  fromName: '',
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
  imapSentMailbox: '',
  isActive: true,
};

function paraFormulario(c: Caixa): EmailForm {
  return {
    label: c.label ?? '',
    fromEmail: c.fromEmail ?? '',
    fromName: c.fromName ?? '',
    replyTo: c.replyTo ?? '',
    smtpHost: c.smtpHost ?? 'mail.hipertms.com.br',
    smtpPort: String(c.smtpPort ?? 465),
    smtpUser: c.smtpUser ?? '',
    smtpPass: '',
    smtpSecure: c.smtpSecure ?? true,
    imapHost: c.imapHost ?? 'mail.hipertms.com.br',
    imapPort: String(c.imapPort ?? 993),
    imapUser: c.imapUser ?? '',
    imapPass: '',
    imapMailbox: c.imapMailbox ?? 'INBOX',
    imapSentMailbox: c.imapSentMailbox ?? '',
    isActive: c.isActive ?? true,
  };
}

export function EmailChannelSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [showPasses, setShowPasses] = useState(false);
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  /** null = formulário em modo "nova caixa". */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EmailForm>({ resolver: zodResolver(emailSchema), defaultValues: DEFAULT });

  const carregar = useCallback(
    async (selecionar?: string) => {
      const r = await api.get('/settings/email-channel');
      const lista: Caixa[] = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
      setCaixas(lista);

      // Abre no que faz sentido olhar: a caixa pedida, senão a que está enviando.
      const alvo = lista.find((c) => c.id === selecionar) ?? lista.find((c) => c.isSender) ?? lista[0];
      if (alvo) {
        setEditandoId(alvo.id);
        reset(paraFormulario(alvo));
      } else {
        setEditandoId(null);
        reset(DEFAULT);
      }
      return lista;
    },
    [reset],
  );

  useEffect(() => {
    carregar()
      .catch(() => {/* nenhuma caixa ainda — usa defaults */})
      .finally(() => setLoading(false));
  }, [carregar]);

  // some o aviso "salvo" assim que o usuário edita qualquer campo
  useEffect(() => {
    const sub = watch(() => setSaved(false));
    return () => sub.unsubscribe();
  }, [watch]);

  const smtpPass = watch('smtpPass');
  const imapPass = watch('imapPass');

  async function trocarRemetente(c: Caixa) {
    const ok = await confirm({
      title: `Enviar como "${c.label}"?`,
      message:
        `A partir de agora todo e-mail sai de ${c.fromEmail}. As outras caixas continuam sendo ` +
        'lidas, então nenhuma resposta se perde.',
      confirmLabel: 'Trocar remetente',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    try {
      await api.post(`/settings/email-channel/${c.id}/sender`);
      await carregar(c.id);
      toast.success(`Os e-mails passam a sair de ${c.fromEmail}.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao trocar o remetente.');
    }
  }

  async function excluir(c: Caixa) {
    const ok = await confirm({
      title: `Excluir a caixa "${c.label}"?`,
      message: `${c.fromEmail} deixa de ser lida. As conversas já registradas continuam no Inbox.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await api.delete(`/settings/email-channel/${c.id}`);
      await carregar();
      toast.success('Caixa removida.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Erro ao excluir a caixa.');
    }
  }

  function novaCaixa() {
    setEditandoId(null);
    setSaved(false);
    reset({ ...DEFAULT });
  }

  const onSubmit = async (form: EmailForm) => {
    setSaved(false);

    // Só o EDITAR pede confirmação: sobrescrever credencial que está funcionando
    // derruba o canal se o dado novo estiver errado. Cadastrar caixa nova não
    // mexe em nada que já funciona.
    if (editandoId) {
      const ok = await confirm({
        title: 'Sobrescrever esta caixa?',
        message:
          'As credenciais atuais serão substituídas. Se os dados novos estiverem incorretos, ' +
          'esta caixa para de enviar e de receber.',
        confirmLabel: 'Salvar assim mesmo',
        cancelLabel: 'Cancelar',
        variant: 'warning',
      });
      if (!ok) return;
    }

    try {
      const r = await api.put('/settings/email-channel', {
        id: editandoId ?? undefined,
        label: form.label,
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
        imapSentMailbox: form.imapSentMailbox || undefined,
        isActive: form.isActive,
      });
      setSaved(true);
      await carregar(r.data?.id);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Erro ao salvar a caixa de e-mail.';
      setError('root', { message: msg });
      toast.error(msg);
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
        subtitle="Cadastre as caixas do servidor (Hostgator / cPanel) e escolha de qual endereço os e-mails saem. Todas as caixas ativas continuam sendo lidas."
      />

      {/* ── Quem envia ────────────────────────────────────────────────── */}
      {caixas.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <div className="font-medium text-base-content">Quem envia</div>
              <div className="text-xs text-base-content/50">
                O endereço marcado é o que o lead vê. As demais seguem sendo lidas.
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={novaCaixa}>
              Nova caixa
            </Button>
          </div>

          {caixas.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between rounded-xl border p-4 ${
                c.isSender ? 'border-primary bg-primary/5' : 'border-base-200 bg-white'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-base-content">{c.label}</span>
                  {c.isSender && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                      Enviando
                    </span>
                  )}
                  {!c.isActive && (
                    <span className="rounded-full bg-base-300 px-2 py-0.5 text-[11px] text-base-content/60">
                      Inativa
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-base-content/50">{c.fromEmail}</div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {!c.isSender && c.isActive && (
                  <Button type="button" variant="secondary" onClick={() => trocarRemetente(c)}>
                    Usar como remetente
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setEditandoId(c.id); setSaved(false); reset(paraFormulario(c)); }}
                >
                  Editar
                </Button>
                {!c.isSender && (
                  <Button type="button" variant="ghost" onClick={() => excluir(c)}>
                    Excluir
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        <div className="rounded-xl border border-base-200 bg-white p-4">
          <div className="font-medium text-base-content">
            {editandoId ? 'Editando esta caixa' : 'Nova caixa'}
          </div>
          <div className="mt-0.5 text-xs text-base-content/50">
            {editandoId
              ? 'Deixe as senhas em branco para manter as atuais.'
              : 'A senha de cada caixa é digitada uma vez. Depois, trocar o remetente é um clique.'}
          </div>
        </div>

        {/* ── Status ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-xl border border-base-200 bg-white p-4">
          <div>
            <div className="font-medium text-base-content">Caixa ativa</div>
            <div className="text-xs text-base-content/50">
              Quando ativa, o Nexa verifica e-mails novos nesta caixa a cada minuto.
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" {...register('isActive')} />
            <div className="peer h-6 w-11 rounded-full bg-base-300 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full" />
          </label>
        </div>

        {/* ── Remetente ──────────────────────────────────────────────── */}
        <Section title="Remetente" subtitle="Endereço que o lead vê ao receber o e-mail.">
          <Field label="Nome desta caixa" required hint="Só para você identificar na lista. Ex.: Lia, Mateus." error={errors.label?.message}>
            <Input type="text" {...register('label')} placeholder="Mateus" />
          </Field>
          <Field label="E-mail de envio" required error={errors.fromEmail?.message}>
            <Input type="email" {...register('fromEmail')} placeholder="mateus@hipertms.com.br" />
          </Field>
          <Field label="Nome de exibição" hint="Aparece no 'De:'. Uma pessoa de verdade responde mais que um assistente.">
            <Input type="text" {...register('fromName')} placeholder="Mateus Gomes" />
          </Field>
          <Field label="Reply-To (opcional)" hint="Vazio = a resposta volta para o próprio e-mail de envio, que é o normal." error={errors.replyTo?.message}>
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
            <Input type="text" autoComplete="username" {...register('smtpUser')} placeholder="mateus@hipertms.com.br" />
          </Field>
          <Field label="Senha SMTP" hint={editandoId && smtpPass === '' ? 'Deixe vazio para manter a senha atual.' : ''}>
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
            <Input type="text" autoComplete="username" {...register('imapUser')} placeholder="mateus@hipertms.com.br" />
          </Field>
          <Field label="Senha IMAP" hint={editandoId && imapPass === '' ? 'Deixe vazio para manter a senha atual.' : ''}>
            <Input type={showPasses ? 'text' : 'password'} {...register('imapPass')} placeholder="••••••••" autoComplete="new-password" />
          </Field>
          <Field label="Caixa de entrada" hint="Normalmente 'INBOX'." error={errors.imapMailbox?.message}>
            <Input type="text" {...register('imapMailbox')} placeholder="INBOX" />
          </Field>
          <Field
            label="Pasta de enviados (opcional)"
            hint="Vazio = o Nexa descobre sozinho. É o que traz para o histórico as respostas escritas fora do Nexa."
          >
            <Input type="text" {...register('imapSentMailbox')} placeholder="INBOX.Sent" />
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
          {editandoId && (
            <Button type="button" variant="secondary" onClick={novaCaixa}>
              Cadastrar outra caixa
            </Button>
          )}
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar caixa'}
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
