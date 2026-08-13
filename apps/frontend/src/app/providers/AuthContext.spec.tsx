import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';

/**
 * O bug: `.catch(() => setUser(null))` tratava QUALQUER falha do `/auth/me` como
 * "não autenticado". Queda de rede e backend reiniciando caíam no mesmo ramo do
 * 401, e os guards mandavam para o /login com a sessão intacta — visto
 * acontecer em 13/08/2026, com o cookie ainda válido e um F5 depois voltando
 * tudo.
 *
 * Duas tentativas anteriores de consertar isso foram REVERTIDAS por falta de
 * prova. O que faltava era exatamente este arquivo: separar, em teste, o caso
 * "servidor respondeu 401" do caso "não chegou resposta nenhuma".
 *
 * O sinal é `error.response`: o axios só o preenche quando uma resposta HTTP
 * chegou.
 */
const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock('@/shared/lib/api', () => ({ api: { get: mockGet, post: mockPost } }));

function Sonda() {
  const { user, loading, unreachable } = useAuth();
  if (loading) return <div>carregando</div>;
  return (
    <div>
      <span data-testid="user">{user ? user.email : 'sem-usuario'}</span>
      <span data-testid="unreachable">{String(unreachable)}</span>
    </div>
  );
}

function montar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sonda />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const USUARIO = { id: 'u1', email: 'abel@nexa.local', role: 'admin' };

/** Erro do axios COM resposta HTTP — o servidor falou. */
const erro401 = () => Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
/** Erro do axios SEM resposta — a requisição não chegou. */
const erroDeRede = () => Object.assign(new Error('Network Error'), { request: {} });

describe('AuthProvider — falha de rede não é logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('401: o servidor respondeu, então desloga mesmo', async () => {
    mockGet.mockRejectedValue(erro401());
    montar();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('sem-usuario'));
    expect(screen.getByTestId('unreachable')).toHaveTextContent('false');
  });

  // O coração do conserto.
  it('falha de rede: NÃO desloga — marca como inacessível', async () => {
    mockGet.mockRejectedValue(erroDeRede());
    montar();

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'));
  });

  it('sucesso: carrega o usuário e não fica inacessível', async () => {
    mockGet.mockResolvedValue({ data: USUARIO });
    montar();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('abel@nexa.local'));
    expect(screen.getByTestId('unreachable')).toHaveTextContent('false');
  });

  // O caso real: backend reiniciando. Falha, e volta sozinho quando ele sobe —
  // sem ninguém clicar em nada e sem passar pelo /login.
  it('backend volta: a sessão é recuperada sozinha, sem passar pelo login', async () => {
    mockGet.mockRejectedValueOnce(erroDeRede()).mockResolvedValue({ data: USUARIO });
    montar();

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'));

    await vi.advanceTimersByTimeAsync(1500); // primeira retentativa: 1s
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('abel@nexa.local'));
    expect(screen.getByTestId('unreachable')).toHaveTextContent('false');
  });

  // Sem isto, um backend fora do ar por muito tempo viraria uma tentativa a cada
  // render — e a tela de reconexão martelaria o servidor que está tentando subir.
  it('as retentativas são espaçadas, não em rajada', async () => {
    mockGet.mockRejectedValue(erroDeRede());
    montar();

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'));
    const depoisDaPrimeira = mockGet.mock.calls.length;

    await vi.advanceTimersByTimeAsync(500); // ainda dentro do 1º intervalo
    expect(mockGet.mock.calls.length).toBe(depoisDaPrimeira);

    await vi.advanceTimersByTimeAsync(1000); // passou de 1s
    await waitFor(() => expect(mockGet.mock.calls.length).toBeGreaterThan(depoisDaPrimeira));
  });

  it('login limpa o estado de inacessível', async () => {
    mockGet.mockRejectedValueOnce(erroDeRede());
    mockPost.mockResolvedValue({});
    mockGet.mockResolvedValue({ data: USUARIO });

    montar();
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'));
    await vi.advanceTimersByTimeAsync(1500);

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('false'));
  });
});
