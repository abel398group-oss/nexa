/**
 * NotificationBell — o destaque de "não lida" precisa existir nos DOIS temas.
 *
 * Bug de 11/08/2026: a linha não lida usava só `bg-sky-50`. No dark mode isso
 * pintava um fundo CLARO atrás de `text-base-content`, que no dark é claro —
 * a notificação ficava invisível até o mouse passar por cima e o
 * `hover:bg-base-100` trocar o fundo por um escuro. O usuário via a lista em
 * branco e o conteúdo só aparecia no hover.
 *
 * O teste prende o par: fundo claro e fundo dark andam juntos. Um `bg-*` fixo
 * sem `dark:bg-*` neste componente volta a esconder a notificação.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { api } from '@/shared/lib/api';

vi.mock('@/shared/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

const naoLida = {
  id: 'n1',
  type: 'escalation',
  title: 'SLA em risco — ticket escalado sem atendimento',
  body: 'Ticket escalado aguardando resposta humana além do prazo.',
  link: '/inbox',
  read: false,
  createdAt: new Date().toISOString(),
};
const lida = { ...naoLida, id: 'n2', title: 'Já vista', read: true };

function montar(items: any[]) {
  (api.get as any).mockResolvedValue({ data: { items, unread: items.filter((i) => !i.read).length } });
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

/** O <button> da notificação — subir a partir do título é mais estável que um seletor de classe. */
function linhaDe(titulo: string): HTMLElement {
  return screen.getByText(titulo, { exact: false }).closest('button') as HTMLElement;
}

describe('NotificationBell — destaque de não lida', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('a notificação NÃO lida tem fundo claro e o par para o dark', async () => {
    const { getByLabelText } = montar([naoLida]);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    getByLabelText(/Notificações/).click();

    const linha = await waitFor(() => linhaDe(naoLida.title));
    expect(linha.className).toContain('bg-sky-50');
    // Sem esta, o dark mode volta a esconder a notificação
    expect(linha.className).toMatch(/dark:bg-sky-500\/\d+/);
  });

  it('a notificação JÁ LIDA não recebe fundo nenhum — herda o do menu', async () => {
    const { getByLabelText } = montar([lida]);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    getByLabelText(/Notificações/).click();

    const linha = await waitFor(() => linhaDe(lida.title));
    expect(linha.className).not.toContain('bg-sky-50');
    expect(linha.className).not.toMatch(/dark:bg-sky/);
  });

  it('todo fundo fixo da linha tem contrapartida dark', async () => {
    // Regra geral, não só para o sky: qualquer `bg-<cor>-<tom>` fixo aplicado à
    // linha precisa de um `dark:bg-` junto. Tokens semânticos (base-*) já viram
    // pelo tema e ficam de fora.
    const { getByLabelText } = montar([naoLida]);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    getByLabelText(/Notificações/).click();

    const linha = await waitFor(() => linhaDe(naoLida.title));
    const fixos = linha.className
      .split(/\s+/)
      .filter((c) => /^bg-(?!base-)[a-z]+-\d+/.test(c));
    for (const c of fixos) {
      const cor = c.match(/^bg-([a-z]+)-/)![1];
      expect(linha.className).toMatch(new RegExp(`dark:bg-${cor}-`));
    }
  });
});
