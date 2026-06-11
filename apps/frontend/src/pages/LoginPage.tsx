import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input } from '@/shared/ui';

const FEATURES = [
  'Qualificação automática de leads 24h',
  'Respostas personalizadas com IA + RAG',
  'Handoff instantâneo para vendedores',
  'Supervisor de qualidade em cada mensagem',
];

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      nav('/inbox');
    } catch {
      setError('Email ou senha inválidos. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full">

      {/* ===== PAINEL DE MARCA (esquerdo) ===== */}
      <div className="hidden lg:flex w-[44%] flex-col justify-between bg-sidebar px-12 py-10">
        {/* logo */}
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
            N
          </span>
          <span className="text-xl font-semibold tracking-tight text-white">Nexa</span>
        </div>

        {/* headline */}
        <div>
          <blockquote className="text-[1.65rem] font-semibold leading-snug text-white">
            "A sua equipe de vendas&nbsp;que nunca dorme."
          </blockquote>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            A Lia atende leads no WhatsApp 24 horas, classifica intenção em
            tempo real e entrega os quentes direto para o seu time — em segundos.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-white/70">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: 'var(--sidebar-accent)', color: '#1a1827' }}
                >
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* rodapé */}
        <p className="text-xs text-white/25">© 2026 Nexa · Plataforma de IA Comercial B2B</p>
      </div>

      {/* ===== FORMULÁRIO (direito) ===== */}
      <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-base-100 to-base-200 px-6 py-10">
        <div className="relative w-full max-w-sm rounded-2xl border border-base-300 bg-[var(--surface-elevated)] p-8 shadow-elevated ring-1 ring-brand-500/20 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.30),0_0_70px_-18px_rgba(255,90,31,0.50)]">

          {/* logo mobile (só aparece em telas menores) */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">N</span>
            <span className="text-lg font-semibold text-base-content">Nexa</span>
          </div>

          {/* título */}
          <h2 className="text-2xl font-bold text-base-content">Bem-vindo de volta</h2>
          <p className="mt-1 text-sm text-base-content/50">Entre com suas credenciais para continuar.</p>

          {/* form */}
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-base-content">
                Email
              </label>
              <Input
                type="email"
                autoComplete="email"
                required
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-base-content">
                Senha
              </label>
              <Input
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* erro */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <span>⚠️</span>
                {error}
              </div>
            )}

            <Button type="submit" loading={busy} size="lg" className="w-full justify-center">
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          {/* dica de rodapé */}
          <p className="mt-6 text-center text-xs text-base-content/35">
            Acesso restrito · Nexa v0.1
          </p>
        </div>
      </div>

    </div>
  );
}
