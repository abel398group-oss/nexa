/**
 * EmailChannelSettingsPage — Configurações do canal de e-mail (ADR 021)
 * Rota: /settings/email-channel
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface FormState {
  fromEmail: string;
  fromName: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  isActive: boolean;
}

const DEFAULT: FormState = {
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
  const [form, setForm] = useState<FormState>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [showPasses, setShowPasses] = useState(false);

  useEffect(() => {
    api.get('/settings/email-channel')
      .then((r) => {
        if (r.data) {
          setForm((prev) => ({
            ...prev,
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
          }));
        }
      })
      .catch(() => {/* canal ainda não configurado — usa defaults */})
      .finally(() => setLoading(false));
  }, []);

  function set(key: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
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
      // Limpa os campos de senha após salvar (segurança)
      setForm((prev) => ({ ...prev, smtpPass: '', imapPass: '' }));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-base-content/50">Carregando configurações...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-base-content">Canal de E-mail</h1>
        <p className="mt-1 text-sm text-base-content/60">
          Configure o endereço de e-mail da Lia para enviar e receber mensagens.
          Use as credenciais do servidor de e-mail (Hostgator / cPanel).
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">

        {/* ── Status ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-xl border border-base-200 bg-white p-4">
          <div>
            <div className="font-medium text-base-content">Canal ativo</div>
            <div className="text-xs text-base-content/50">
              Quando ativo, a Lia verifica e-mails novos a cada minuto.
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
            />
            <div className="peer h-6 w-11 rounded-full bg-base-300 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full" />
          </label>
        </div>

        {/* ── Remetente ──────────────────────────────────────────────── */}
        <Section title="✉️ Remetente" subtitle="Endereço que o lead vê ao receber o e-mail.">
          <Field label="E-mail de envio" required>
            <input
              type="email"
              value={form.fromEmail}
              onChange={(e) => set('fromEmail', e.target.value)}
              placeholder="lia@hipertms.com.br"
              className="input input-bordered w-full"
              required
            />
          </Field>
          <Field label="Nome de exibição">
            <input
              type="text"
              value={form.fromName}
              onChange={(e) => set('fromName', e.target.value)}
              placeholder="Lia HiperTMS"
              className="input input-bordered w-full"
            />
          </Field>
          <Field label="Reply-To (opcional)" hint="E-mail que recebe respostas manuais do lead.">
            <input
              type="email"
              value={form.replyTo}
              onChange={(e) => set('replyTo', e.target.value)}
              placeholder="contato@hipertms.com.br"
              className="input input-bordered w-full"
            />
          </Field>
        </Section>

        {/* ── SMTP (envio) ────────────────────────────────────────────── */}
        <Section title="📤 SMTP — Envio" subtitle="Servidor de saída. Hostgator: mail.hipertms.com.br porta 465.">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Servidor SMTP">
                <input
                  type="text"
                  value={form.smtpHost}
                  onChange={(e) => set('smtpHost', e.target.value)}
                  placeholder="mail.hipertms.com.br"
                  className="input input-bordered w-full"
                />
              </Field>
            </div>
            <div>
              <Field label="Porta">
                <input
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => set('smtpPort', e.target.value)}
                  className="input input-bordered w-full"
                />
              </Field>
            </div>
          </div>
          <Field label="Usuário SMTP" required>
            <input
              type="email"
              value={form.smtpUser}
              onChange={(e) => set('smtpUser', e.target.value)}
              placeholder="lia@hipertms.com.br"
              className="input input-bordered w-full"
              required
            />
          </Field>
          <Field label="Senha SMTP" hint={form.smtpPass === '' ? 'Deixe vazio para manter a senha atual.' : ''}>
            <input
              type={showPasses ? 'text' : 'password'}
              value={form.smtpPass}
              onChange={(e) => set('smtpPass', e.target.value)}
              placeholder="••••••••"
              className="input input-bordered w-full"
              autoComplete="new-password"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-base-content/70">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={form.smtpSecure}
              onChange={(e) => set('smtpSecure', e.target.checked)}
            />
            Usar SSL/TLS (recomendado — porta 465)
          </label>
        </Section>

        {/* ── IMAP (recebimento) ──────────────────────────────────────── */}
        <Section title="📥 IMAP — Recebimento" subtitle="Servidor de entrada. Hostgator: mail.hipertms.com.br porta 993.">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Servidor IMAP">
                <input
                  type="text"
                  value={form.imapHost}
                  onChange={(e) => set('imapHost', e.target.value)}
                  placeholder="mail.hipertms.com.br"
                  className="input input-bordered w-full"
                />
              </Field>
            </div>
            <div>
              <Field label="Porta">
                <input
                  type="number"
                  value={form.imapPort}
                  onChange={(e) => set('imapPort', e.target.value)}
                  className="input input-bordered w-full"
                />
              </Field>
            </div>
          </div>
          <Field label="Usuário IMAP" required>
            <input
              type="email"
              value={form.imapUser}
              onChange={(e) => set('imapUser', e.target.value)}
              placeholder="lia@hipertms.com.br"
              className="input input-bordered w-full"
              required
            />
          </Field>
          <Field label="Senha IMAP" hint={form.imapPass === '' ? 'Deixe vazio para manter a senha atual.' : ''}>
            <input
              type={showPasses ? 'text' : 'password'}
              value={form.imapPass}
              onChange={(e) => set('imapPass', e.target.value)}
              placeholder="••••••••"
              className="input input-bordered w-full"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Caixa IMAP" hint="Normalmente 'INBOX'.">
            <input
              type="text"
              value={form.imapMailbox}
              onChange={(e) => set('imapMailbox', e.target.value)}
              placeholder="INBOX"
              className="input input-bordered w-full"
            />
          </Field>
        </Section>

        {/* mostrar/ocultar senhas */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-base-content/60">
          <input
            type="checkbox"
            className="checkbox checkbox-xs"
            checked={showPasses}
            onChange={(e) => setShowPasses(e.target.checked)}
          />
          Mostrar senhas
        </label>

        {error && (
          <div className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
        )}
        {saved && (
          <div className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
            ✅ Configurações salvas com sucesso!
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-base-200 pt-4">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </div>
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

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-base-content/80">
        {label}{required && <span className="text-error ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-base-content/40">{hint}</p>}
    </div>
  );
}
