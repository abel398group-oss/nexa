import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input, Alert } from '@/shared/ui';

// Ícones inline (nexa não usa lucide) — mostrar/ocultar senha.
function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.39M6.6 6.6A13.3 13.3 0 0 0 2 12s3.5 7 10 7a9.1 9.1 0 0 0 5.4-1.6" />
      <path d="m3 3 18 18" />
    </svg>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative isolate flex min-h-app flex-col items-center justify-center overflow-hidden px-4 py-14">
      {/* fundo: degradê suave + brilho laranja no topo (igual ao TMS) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#f3ede8]/80 via-base-200 to-base-200" aria-hidden />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand-500/[0.12] to-transparent blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-[440px]">
        {/* borda laranja em degradê = o "glow" do card */}
        <div className="rounded-[1.35rem] bg-gradient-to-br from-[#FF5A1F] via-[#ED4708] to-[#FF8A5C] p-[1px] shadow-[0_24px_56px_-16px_rgb(255_90_31_/_0.35),0_12px_28px_-12px_rgb(0_0_0_/_0.25)]">
          <div className="rounded-[calc(1.35rem-1px)] bg-base-100 px-7 pb-9 pt-10 sm:px-9">
            {/* logo + título */}
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
                  N
                </span>
                <span className="text-2xl font-bold tracking-tight text-base-content">Nexa</span>
              </div>
              <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-base-content">Bem-vindo de volta</h1>
              <p className="mt-1.5 text-sm text-base-content/55">Entre com suas credenciais para continuar.</p>
            </div>

            <form className="mt-9 space-y-5" onSubmit={onSubmit}>
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-sm font-medium text-base-content" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com.br"
                  className="!h-12 !rounded-xl text-base"
                />
              </div>

              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-sm font-medium text-base-content" htmlFor="password">
                  Senha
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="!h-12 !rounded-xl pr-12 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-base-content/45 transition-colors hover:bg-base-200 hover:text-base-content"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {error && (
                <Alert tone="danger" className="text-sm">
                  {error}
                </Alert>
              )}

              <Button
                type="submit"
                loading={busy}
                className="mt-2 !h-12 w-full justify-center !rounded-xl text-base font-semibold"
              >
                {busy ? 'Entrando…' : 'Entrar'}
              </Button>
            </form>

            <p className="mt-8 text-center text-xs leading-relaxed text-base-content/45">
              Acesso restrito · Nexa v0.1
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
