/**
 * SupportClientsPage — vitest + React Testing Library
 *
 * O bug de 13/08/2026 que estes testes travam: a tela chamava
 * `listConversations()` sem parâmetro nenhum. O servidor devolvia as 50
 * conversas mais RECENTES do tenant — vendas e suporte misturadas — e a
 * peneira de "isto é chamado de suporte?" acontecia aqui no cliente.
 *
 * Ou seja: o corte da página decidia a resposta. Medido no HiperTMS, que tem 3
 * clientes de suporte no banco — baixando 5 conversas a tela mostrava 1 cliente;
 * baixando 3, mostrava ZERO. E seguia anunciando os dois cards como se fossem o
 * total. Bastava o tenant passar de 50 conversas com as mais recentes sendo de
 * vendas para um cliente com chamado ABERTO sumir da tela sem deixar rastro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SupportClientsPage } from './SupportClientsPage';

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock('@/entities/conversation', () => ({ listConversations: mockList }));

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    phone: '9f88be3f-5fac-4311-9d3e-ea78a4c6c295',
    sourceChannel: 'web_chat',
    status: 'open',
    lastActivityAt: '2026-08-07T18:45:00.000Z',
    contact: { id: 'ct1', name: 'Abel Ramos' },
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SupportClientsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SupportClientsPage', () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  // O conserto: quem separa chamado de conversa de venda é o SERVIDOR. Sem isso,
  // a página de 50 se gasta com conversas de vendas e o chamado nem chega aqui.
  it('pede os chamados ao servidor com escopo de suporte, não filtra depois', async () => {
    mockList.mockResolvedValue({ items: [ticket()], total: 1 });

    renderPage();
    await waitFor(() => expect(mockList).toHaveBeenCalled());

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ scope: 'support' }));
    // e com um teto explícito, não o default de 50
    expect(mockList.mock.calls[0][0].limit).toBeGreaterThan(50);
  });

  it('agrupa por contato e conta os chamados abertos', async () => {
    mockList.mockResolvedValue({
      items: [
        ticket({ id: 'a', status: 'open' }),
        ticket({ id: 'b', status: 'closed' }),
        ticket({ id: 'c', phone: 'outro-uuid', status: 'open', contact: { id: 'ct2', name: 'Fabio Ogawa' } }),
      ],
      total: 3,
    });

    renderPage();

    expect(await screen.findByText('Abel Ramos')).toBeInTheDocument();
    expect(screen.getByText('Fabio Ogawa')).toBeInTheDocument();
    // Abel: 2 chamados (1 aberto) · Fabio: 1 chamado (1 aberto)
    expect(screen.getByText('2 chamado(s)')).toBeInTheDocument();
    expect(screen.getByText('Chamados abertos').parentElement).toHaveTextContent('2');
  });

  // Web chat e portal não têm telefone — a coluna guarda o UUID da sessão. Ver
  // identidadeVisivel: antes disto o UUID virava "988354311937846295" na tela.
  it('mostra o canal quando não existe telefone, nunca o identificador', async () => {
    mockList.mockResolvedValue({ items: [ticket()], total: 1 });

    renderPage();

    expect(await screen.findByText('Web chat (TMS)')).toBeInTheDocument();
    expect(screen.queryByText(/988354311937846295/)).not.toBeInTheDocument();
    expect(screen.queryByText(/9f88be3f/)).not.toBeInTheDocument();
  });

  // Se ainda assim cortar, a tela DIZ. Número errado com cara de número certo é
  // pior do que não mostrar nada — é a nota que a Etapa 2B deixou no Inbox.
  it('avisa quando leu menos chamados do que existem', async () => {
    mockList.mockResolvedValue({ items: [ticket()], total: 87 });

    renderPage();

    expect(await screen.findByText(/Lendo 1 de 87 chamados/)).toBeInTheDocument();
    expect(screen.getByText('nos chamados mais recentes')).toBeInTheDocument();
  });

  it('sem corte, não inventa aviso nenhum', async () => {
    mockList.mockResolvedValue({ items: [ticket()], total: 1 });

    renderPage();

    await screen.findByText('Abel Ramos');
    expect(screen.queryByText(/Lendo \d+ de \d+ chamados/)).not.toBeInTheDocument();
    expect(screen.getByText('com chamados de suporte')).toBeInTheDocument();
  });

  it('lista vazia não quebra', async () => {
    mockList.mockResolvedValue({ items: [], total: 0 });

    renderPage();

    expect(await screen.findByText('Nenhum cliente com chamado de suporte.')).toBeInTheDocument();
  });
});
