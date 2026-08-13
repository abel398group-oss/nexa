import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api } from '@/shared/lib/api';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  tenantId?: string | null; // null = admin da plataforma (platform admin)
  permissions?: string[];
  sellerId?: string | null;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  /**
   * O `/auth/me` não chegou ao servidor (rede caiu, backend reiniciando).
   * Diferente de `user === null`, que significa "o servidor respondeu e disse
   * que você não está autenticado".
   */
  unreachable: boolean;
  /** Tenta o `/auth/me` de novo — usado pelo botão da tela de reconexão. */
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

/**
 * Só 401 e 403 significam "você não está autenticado". Todo o resto — 500, 502,
 * 503, 504, ou nenhuma resposta — significa "não deu para confirmar", e a sessão
 * continua valendo.
 *
 * O `.catch(() => setUser(null))` original tratava QUALQUER falha como logout, e
 * os guards jogavam para o /login com o cookie intacto. Visto acontecer em
 * 13/08/2026 enquanto o backend reiniciava: a tela pulou para o login, e um F5
 * depois voltava tudo.
 *
 * A primeira versão deste conserto olhava `error.response` — "se veio resposta
 * HTTP, o servidor falou". Estava errado, e o teste manual pegou: com o backend
 * fora, quem responde é o PROXY, não o backend. O Vite devolve 500 em dev e o
 * nginx devolve 502 em produção, então `error.response` existia e a conclusão
 * saía invertida. Olhar o status resolve os dois casos.
 */
function sessaoRecusada(erro: any): boolean {
  const status = erro?.response?.status;
  return status === 401 || status === 403;
}

/** Espera entre as tentativas automáticas: 1s, 2s, 4s, 8s, e daí 15s fixos. */
function esperaDaTentativa(n: number): number {
  return n < 4 ? 1000 * 2 ** n : 15000;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  // Handle da função de carregar, para o botão "Tentar agora" da tela offline.
  const carregarRef = useRef<() => void>(() => {});
  const retry = useCallback(() => carregarRef.current(), []);

  /**
   * Uma tentativa por vez, e a PRÓXIMA só é agendada quando a atual falha.
   *
   * A primeira versão disparava o retry por um `setTimeout` num efeito separado,
   * correndo em paralelo com a requisição em voo — e cada retentativa cancelava
   * o resultado da anterior. No teste manual isso apareceu do pior jeito: o
   * `/auth/me` voltou 200, e a tela continuou em "sem conexão", porque a resposta
   * boa chegou depois de já ter sido descartada. Timer competindo com a
   * requisição que ele deveria repetir.
   */
  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tentativa = 0;

    async function carregar() {
      clearTimeout(timer);
      try {
        const r = await api.get('/auth/me');
        if (!vivo) return;
        tentativa = 0;
        setUser(r.data);
        setUnreachable(false);
      } catch (e) {
        if (!vivo) return;
        if (sessaoRecusada(e)) {
          // 401/403: o servidor falou, e disse que não. Aí sim é deslogado.
          setUser(null);
          setUnreachable(false);
        } else {
          // 500/502/503/504 ou nenhuma resposta: não deu para confirmar. A
          // sessão pode estar perfeitamente válida — não descarta o usuário, e
          // tenta de novo sozinho: o caso comum é o backend subindo, e ninguém
          // deveria precisar clicar em nada para voltar.
          setUnreachable(true);
          timer = setTimeout(carregar, esperaDaTentativa(tentativa++));
        }
      } finally {
        if (vivo) setLoading(false);
      }
    }

    carregarRef.current = carregar;
    carregar();

    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, []);

  async function login(email: string, password: string) {
    await api.post('/auth/login', { email, password });
    const me = await api.get('/auth/me');
    setUser(me.data);
    setUnreachable(false);
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
    setUnreachable(false);
  }

  return (
    <Ctx.Provider value={{ user, loading, unreachable, retry, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
