import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthContext';
import { api } from '@/shared/lib/api';
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
  const [forgotHint, setForgotHint] = useState(false);
  // "Esqueceu a senha?" — antes era só um aviso estático mandando falar com o admin
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');

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
    <div className="dark relative isolate flex min-h-app flex-col items-center justify-center overflow-hidden bg-[#0b0c0f] px-4 py-14 sm:py-16">
      {/* fundo escuro: mais claro no topo, escuro embaixo (como o TMS) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#2b2e38] via-[#181a20] to-[#0b0c0f]" aria-hidden />
      {/* leve spotlight neutro no topo */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.05] to-transparent" aria-hidden />
      {/* brilho laranja embaixo do card (igual ao TMS) */}
      <div
        className="pointer-events-none absolute left-1/2 top-[60%] h-[24rem] w-[34rem] -translate-x-1/2 rounded-[50%] bg-brand-500/[0.20] blur-[110px]"
        aria-hidden
      />

      <div className="relative w-full max-w-[460px]">
        {/* borda laranja em degradê = o "glow" do card */}
        <div className="rounded-[1.35rem] bg-gradient-to-br from-[#FF5A1F] via-[#ED4708] to-[#FF8A5C] p-[1px] shadow-[0_24px_56px_-16px_rgb(255_90_31_/_0.33),0_12px_28px_-12px_rgb(30_58_95_/_0.18)]">
          <div className="rounded-[calc(1.35rem-1px)] bg-base-100 px-7 pb-9 pt-10 sm:px-9 sm:pb-10 sm:pt-11">
            {/* wordmark + título */}
            <div className="flex flex-col items-center text-center">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-xl font-extrabold text-white shadow-sm">
                  N
                </span>
                <span className="text-[34px] font-extrabold leading-none tracking-tight text-base-content">Nexa</span>
              </div>
              <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-base-content sm:text-[1.65rem]">
                Entrar na sua conta
              </h1>
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
                <div className="flex items-center justify-between gap-3">
                  <label className="mb-0 text-sm font-medium text-base-content" htmlFor="password">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotHint(true)}
                    className="shrink-0 text-xs font-semibold text-brand-600 hover:underline sm:text-sm"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
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
                {forgotHint && (
                  <div className="rounded-lg border border-base-200 bg-base-100/60 p-3">
                    <p className="mb-2 text-xs text-base-content/60">
                      Informe seu e-mail e enviaremos um link para criar uma nova senha.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="!h-10"
                      />
                      <button
                        type="button"
                        disabled={forgotBusy || !forgotEmail.trim()}
                        onClick={async () => {
                          setForgotBusy(true);
                          try {
                            const r = await api.post('/auth/forgot-password', { email: forgotEmail.trim() });
                            setForgotMsg(r.data?.message ?? 'Se houver uma conta com esse e-mail, o link foi enviado.');
                          } catch {
                            // resposta genérica de propósito: não revela se o e-mail existe
                            setForgotMsg('Se houver uma conta com esse e-mail, o link foi enviado.');
                          } finally {
                            setForgotBusy(false);
                          }
                        }}
                        className="shrink-0 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                      >
                        {forgotBusy ? 'Enviando…' : 'Enviar'}
                      </button>
                    </div>
                    {forgotMsg && <p className="mt-2 text-xs text-emerald-600">{forgotMsg}</p>}
                  </div>
                )}
              </div>

              {error && (
                <Alert tone="danger" className="text-sm shadow-sm">
                  {error}
                </Alert>
              )}

              <Button
                type="submit"
                loading={busy}
                className="mt-2 !h-12 w-full justify-center !rounded-xl text-base font-semibold shadow-md shadow-brand-500/20 transition-[box-shadow,transform] hover:shadow-lg active:scale-[0.99]"
              >
                {busy ? 'Entrando…' : 'Entrar'}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-base-content/65">
              Não tem conta?{' '}
              <Link to="/" className="font-semibold text-brand-600 no-underline hover:underline">
                Conheça o Nexa
              </Link>
            </p>

            <p className="mt-6 text-center text-[11px] leading-relaxed text-base-content/45">
              Ao entrar, você aceita os{' '}
              <Link to="/" className="font-medium text-brand-600 underline-offset-2 hover:underline">
                Termos
              </Link>{' '}
              e a{' '}
              <Link to="/" className="font-medium text-brand-600 underline-offset-2 hover:underline">
                Política de privacidade
              </Link>
              .
            </p>

            <div className="mt-6 flex justify-center border-t border-base-content/[0.08] pt-6">
              <Link to="/" className="text-sm font-semibold text-brand-600 no-underline hover:underline">
                ← Voltar ao site
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
