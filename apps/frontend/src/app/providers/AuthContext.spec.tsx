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

/** O servidor respondeu e recusou a sessão. */
const erro401 = () => Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
/** Nenhuma resposta chegou (rede, DNS, timeout). */
const erroDeRede = () => Object.assign(new Error('Network Error'), { request: {} });
/**
 * Backend fora do ar. ESTE é o caso que derrubou a primeira versão do conserto:
 * com o backend morto quem responde é o PROXY, não ele — o Vite devolve 500 em
 * dev e o nginx devolve 502 em produção. A regra "se veio resposta HTTP, o
 * servidor falou" concluía o oposto do certo, e o teste manual foi quem pegou.
 */
const erroDeProxy = (status: number) =>
  Object.assign(new Error('Proxy error'), { response: { status } });

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

  // Backend fora: quem responde é o proxy. Foi o que quebrou a 1ª versão.
  it.each([500, 502, 503, 504])('erro %i do proxy: NÃO desloga', async (status) => {
    mockGet.mockRejectedValue(erroDeProxy(status));
    montar();

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('sem-usuario');
  });

  it('403 desloga igual ao 401', async () => {
    mockGet.mockRejectedValue(erroDeProxy(403));
    montar();

    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('false'));
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

  /**
   * A 3ª versão do conserto travou aqui, e só o teste manual mostrou: o timer de
   * retentativa corria EM PARALELO com a requisição em voo e cancelava o
   * resultado dela. O `/auth/me` voltava 200 e a tela seguia em "sem conexão",
   * porque a resposta boa chegava depois de já ter sido descartada.
   *
   * A resposta demorada abaixo é justamente o caso real: o backend subindo
   * responde devagar, e a resposta chega DEPOIS do intervalo da próxima
   * tentativa.
   */
  it('resposta lenta que chega depois do intervalo NÃO é descartada', async () => {
    mockGet
      .mockRejectedValueOnce(erroDeProxy(502))
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: USUARIO }), 5000)),
      );

    montar();
    await waitFor(() => expect(screen.getByTestId('unreachable')).toHaveTextContent('true'));

    await vi.advanceTimersByTimeAsync(1100); // dispara a 2ª tentativa (a lenta)
    await vi.advanceTimersByTimeAsync(6000); // ela responde 200 bem depois

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('abel@nexa.local'));
    expect(screen.getByTestId('unreachable')).toHaveTextContent('false');
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
