/**
 * Redefinição de senha — destino do link enviado por e-mail em "Esqueceu a senha?".
 * Rota pública: o usuário chega aqui SEM estar logado, com ?token=... na URL.
 */
import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '@/shared/lib/api';
import { Button, Input, Alert } from '@/shared/ui';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const nav = useNavigate();

  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (senha.length < 8) { setErro('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (senha !== confirma) { setErro('A confirmação não confere.'); return; }

    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: senha });
      setPronto(true);
      setTimeout(() => nav('/login'), 2500);
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setErro(Array.isArray(m) ? m.join(', ') : m || 'Não foi possível redefinir a senha.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 px-4">
      <div className="w-full max-w-md rounded-2xl border border-base-200 bg-white p-8 shadow-elevated dark:bg-sidebar">
        <h1 className="mb-1 text-xl font-semibold text-base-content">Criar nova senha</h1>

        {!token ? (
          <>
            <Alert tone="danger" className="mt-4 text-sm">
              Link inválido — o endereço não traz o código de redefinição.
            </Alert>
            <Link to="/login" className="mt-4 block text-sm font-semibold text-brand-600 hover:underline">
              Voltar para o login
            </Link>
          </>
        ) : pronto ? (
          <>
            <Alert tone="success" className="mt-4 text-sm">
              Senha alterada. Redirecionando para o login…
            </Alert>
            <Link to="/login" className="mt-4 block text-sm font-semibold text-brand-600 hover:underline">
              Ir agora
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-base-content/60">
              O link vale por 30 minutos e só pode ser usado uma vez.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-base-content" htmlFor="nova">Nova senha</label>
              <Input
                id="nova" type="password" autoComplete="new-password" required
                value={senha} onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres" className="!h-12 !rounded-xl text-base"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-base-content" htmlFor="conf">Confirme a senha</label>
              <Input
                id="conf" type="password" autoComplete="new-password" required
                value={confirma} onChange={(e) => setConfirma(e.target.value)}
                className="!h-12 !rounded-xl text-base"
              />
            </div>
            {erro && <Alert tone="danger" className="text-sm">{erro}</Alert>}
            <Button type="submit" loading={busy} className="!h-12 w-full !rounded-xl">
              Salvar nova senha
            </Button>
            <Link to="/login" className="block text-center text-sm text-base-content/60 hover:underline">
              Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
