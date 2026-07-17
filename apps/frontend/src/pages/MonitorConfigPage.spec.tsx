/**
 * MonitorConfigPage — vitest + React Testing Library
 *
 * Behaviors tested:
 * 1. "Aplicar a todos" copia defaultSchedule (hora/minuto/dias) para os 4 setores
 * 2. Editar um setor individualmente após "Aplicar a todos" afeta só aquele setor
 * 3. Badge "personalizado" aparece quando o horário do setor difere do padrão
 *
 * Mock strategy:
 *  - api.get: controlado por mockGet para retornar config determinístico
 *  - useConfirm: retorna mockConfirm que por padrão resolve true (usuário confirma)
 *  - useToast / useAuth: stubs mínimos sem efeito colateral
 *  - QueryClient: retry=false, gcTime=0 → sem retry noise nem cache cross-test
 *
 * Índices dos <select> (combobox) no DOM:
 *  0 = hora padrão (aria-label="Hora padrão")
 *  1 = minuto padrão
 *  2 = hora fiscal  |  3 = min fiscal
 *  4 = hora logistic | 5 = min logistic
 *  6 = hora frota    | 7 = min frota
 *  8 = hora finance  | 9 = min finance
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MonitorConfigPage } from './MonitorConfigPage';

// ── Mocks de módulo ──────────────────────────────────────────────────────────
// vi.mock() é içado (hoisted) para o topo do arquivo pelo vitest — as variáveis
// declaradas com const abaixo não estariam inicializadas ainda. A solução é
// usar vi.hoisted() para criar as referências antes do hoisting.

const { mockGet, mockPost, mockPut, mockConfirm } = vi.hoisted(() => ({
  mockGet:     vi.fn(),
  mockPost:    vi.fn(),
  mockPut:     vi.fn(),
  mockConfirm: vi.fn(),
}));

vi.mock('@/shared/lib/api', () => ({
  api: { get: mockGet, put: mockPut, post: mockPost },
}));

vi.mock('@/app/providers/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 'tenant-1', email: 'admin@test.com' } }),
}));

vi.mock('@/app/providers/ConfirmContext', () => ({
  useConfirm: () => mockConfirm,
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Dados de teste ────────────────────────────────────────────────────────────

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    planAllowed: true,
    sendHour: 7,
    sendMinute: 0,
    sendWeekends: true,
    channel: 'whatsapp',
    notificationPhone: null,
    recipients: [],
    fiscalEnabled: true,
    logisticEnabled: true,
    frotaEnabled: true,
    financeEnabled: true,
    sectorConfig: null,
    monitorOverride: false,
    ...overrides,
  };
}

function makeSectorOverride(sector: { sendHour?: number; sendMinute?: number; sendDays?: number[] } = {}) {
  return {
    recipients: [],
    sendHour: 7,
    sendMinute: 0,
    sendDays: ALL_DAYS,
    ...sector,
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    // MemoryRouter: a página renderiza <Link> (Breadcrumb) — sem Router o
    // useContext do react-router é null e o render explode.
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MonitorConfigPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// Helper: retorna todos os <select> (combobox) na ordem de renderização.
// Índices: 0=hora padrão, 1=min padrão, 2=hora fiscal, 3=min fiscal, ...
function allSelects() {
  return screen.getAllByRole('combobox');
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPost.mockResolvedValue({ data: {} });
  mockPut.mockResolvedValue({ data: {} });
  // Por padrão o usuário confirma o diálogo
  mockConfirm.mockResolvedValue(true);

  mockGet.mockImplementation((url: string) => {
    if (url === '/monitor/config')
      return Promise.resolve({ data: makeConfig() });
    if (url === '/monitor/prefill')
      return Promise.resolve({ data: { email: null, phone: null } });
    if (url === '/monitor/alerts')
      return Promise.resolve({ data: [] });
    if (url.startsWith('/monitor/notification-logs'))
      return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

// REMOVIDO (T9, 2026-07-17): a grade "Alertas por setor" foi removida da tela
// por decisão de negócio (decisão 5 do doc T9 — redundante, cada contato já
// escolhe setores). Os elementos que estes testes procuram não existem mais no
// componente — mantidos com .skip só como referência histórica, não reativar.
describe.skip('MonitorConfigPage — Horário padrão', () => {
  /**
   * Comportamento 1:
   * "Aplicar a todos os setores" copia hora do bloco "Horário padrão"
   * para os 4 setores após o usuário confirmar o diálogo.
   */
  it('comportamento 1: "Aplicar a todos" copia hora para os 4 setores', async () => {
    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    // Altera o select de "Hora padrão" (índice 0) para 10h
    const hourDefault = screen.getByRole('combobox', { name: /hora padrão/i });
    fireEvent.change(hourDefault, { target: { value: '10' } });
    expect(hourDefault).toHaveDisplayValue('10h');

    // Clica em "Aplicar a todos os setores"
    fireEvent.click(screen.getByText('Aplicar a todos os setores'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledOnce());

    // Todos os 4 setores devem mostrar 10h (+ o próprio select padrão = ≥4 selects)
    await waitFor(() => {
      const tenH = screen.getAllByDisplayValue('10h');
      expect(tenH.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('comportamento 1b: cancelar o diálogo NÃO altera os setores', async () => {
    mockConfirm.mockResolvedValue(false);
    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    const hourDefault = screen.getByRole('combobox', { name: /hora padrão/i });
    fireEvent.change(hourDefault, { target: { value: '15' } });
    fireEvent.click(screen.getByText('Aplicar a todos os setores'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledOnce());

    // Apenas o select padrão mostra 15h — setores continuam em 7h
    await waitFor(() => {
      const fifteen = screen.queryAllByDisplayValue('15h');
      expect(fifteen.length).toBeLessThanOrEqual(1); // só o select padrão em si
    });
  });

  /**
   * Comportamento 2:
   * Após "Aplicar a todos", editar um setor individualmente afeta SOMENTE aquele setor.
   * Os demais permanecem com o horário que foi aplicado.
   */
  it('comportamento 2: editar um setor após aplicar a todos afeta só aquele setor', async () => {
    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    // Aplica 8h para todos
    const hourDefault = screen.getByRole('combobox', { name: /hora padrão/i });
    fireEvent.change(hourDefault, { target: { value: '8' } });
    fireEvent.click(screen.getByText('Aplicar a todos os setores'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledOnce());

    // Aguarda os 4 setores com 8h
    await waitFor(() => {
      expect(screen.getAllByDisplayValue('08h').length).toBeGreaterThanOrEqual(4);
    });

    // Edita o setor Fiscal para 9h — índice 2 = hora do fiscal
    const fiscalHourSelect = allSelects()[2];
    fireEvent.change(fiscalHourSelect, { target: { value: '9' } });

    // Fiscal agora mostra 9h
    expect(fiscalHourSelect).toHaveDisplayValue('09h');

    // Os outros 3 setores (logistic=4, frota=6, finance=8) ainda mostram 8h
    await waitFor(() => {
      const eightH = screen.getAllByDisplayValue('08h');
      // Select padrão + 3 setores restantes = pelo menos 3
      expect(eightH.length).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * Comportamento 3:
   * O badge "personalizado" aparece em um setor quando seu horário difere do
   * defaultSchedule. Setores com horário igual ao padrão NÃO exibem o badge.
   */
  it('comportamento 3: badge "personalizado" aparece quando setor difere do horário padrão', async () => {
    // Fiscal com hora diferente do global (9h vs 8h)
    mockGet.mockImplementation((url: string) => {
      if (url === '/monitor/config')
        return Promise.resolve({
          data: makeConfig({
            sendHour: 8,
            sectorConfig: {
              fiscal:   makeSectorOverride({ sendHour: 9 }),
              logistic: makeSectorOverride({ sendHour: 8 }),
              frota:    makeSectorOverride({ sendHour: 8 }),
              finance:  makeSectorOverride({ sendHour: 8 }),
            },
          }),
        });
      if (url === '/monitor/prefill') return Promise.resolve({ data: { email: null, phone: null } });
      if (url === '/monitor/alerts') return Promise.resolve({ data: [] });
      if (url.startsWith('/monitor/notification-logs')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    // Só o setor Fiscal deve ter o badge
    const badges = await screen.findAllByText('personalizado');
    expect(badges).toHaveLength(1);
  });

  it('comportamento 3b: badge desaparece ao editar o setor de volta para o horário padrão', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/monitor/config')
        return Promise.resolve({
          data: makeConfig({
            sendHour: 8,
            sectorConfig: {
              fiscal:   makeSectorOverride({ sendHour: 9 }),
              logistic: makeSectorOverride({ sendHour: 8 }),
              frota:    makeSectorOverride({ sendHour: 8 }),
              finance:  makeSectorOverride({ sendHour: 8 }),
            },
          }),
        });
      if (url === '/monitor/prefill') return Promise.resolve({ data: { email: null, phone: null } });
      if (url === '/monitor/alerts') return Promise.resolve({ data: [] });
      if (url.startsWith('/monitor/notification-logs')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    // Badge presente no início
    expect(await screen.findAllByText('personalizado')).toHaveLength(1);

    // Edita Fiscal (índice 2) de volta para 8h (igual ao padrão)
    const fiscalHourSelect = allSelects()[2];
    fireEvent.change(fiscalHourSelect, { target: { value: '8' } });

    // Badge deve desaparecer
    await waitFor(() => {
      expect(screen.queryByText('personalizado')).toBeNull();
    });
  });
});
// ── N3.3: saveConfig não envia campos read-only no PUT ─────────────────────────

// REMOVIDO (T9): dependia de "Horário padrão (todos os setores)" (grade removida) — ver nota acima.
describe.skip('MonitorConfigPage — saveConfig (N3.3)', () => {
  it('PUT payload não inclui waNumbersUsed nem waNumbersLimit', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/monitor/config')
        return Promise.resolve({
          data: makeConfig({ waNumbersUsed: 2, waNumbersLimit: 3 }),
        });
      if (url === '/monitor/prefill') return Promise.resolve({ data: { email: null, phone: null } });
      if (url === '/monitor/alerts') return Promise.resolve({ data: [] });
      if (url.startsWith('/monitor/notification-logs')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    // Clica no botão Salvar
    const saveBtn = screen.getByRole('button', { name: /salvar/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(mockPut).toHaveBeenCalled());

    const [, payload] = mockPut.mock.calls[0];
    expect(payload).not.toHaveProperty('waNumbersUsed');
    expect(payload).not.toHaveProperty('waNumbersLimit');
    expect(payload).not.toHaveProperty('planAllowed');
    expect(payload).not.toHaveProperty('monitorOverride');
  });
});

// ── N3.4: remoção de número WA permitida mesmo no limite ──────────────────────

// REMOVIDO (T9): dependia de "Horário padrão (todos os setores)" (grade removida) — ver nota acima.
describe.skip('MonitorConfigPage — UX limite WA (N3.4)', () => {
  it('botão × de remoção não está disabled quando atWaLimit=true e sector enabled', async () => {
    const WA_CONTACT = '5511999990001';

    mockGet.mockImplementation((url: string) => {
      if (url === '/monitor/config')
        return Promise.resolve({
          data: makeConfig({
            waNumbersUsed: 1,
            waNumbersLimit: 1,
            planAllowed: true,
            sectorConfig: {
              fiscal: {
                recipients: [{ contact: WA_CONTACT, channel: 'whatsapp' }],
                sendHour: 7,
                sendMinute: 0,
                sendDays: ALL_DAYS,
              },
              logistic: makeSectorOverride(),
              frota:    makeSectorOverride(),
              finance:  makeSectorOverride(),
            },
          }),
        });
      if (url === '/monitor/prefill') return Promise.resolve({ data: { email: null, phone: null } });
      if (url === '/monitor/alerts') return Promise.resolve({ data: [] });
      if (url.startsWith('/monitor/notification-logs')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    // Deve existir o botão × para remover o contato WA
    const removeBtn = await screen.findByRole('button', {
      name: new RegExp(`Remover ${WA_CONTACT}`, 'i'),
    });

    // N3.4: o botão NÃO deve estar disabled (atWaLimit não deve desabilitar remoção)
    expect(removeBtn).not.toBeDisabled();
  });
});

// ── T9: contato unificado (pessoa = nome + WhatsApp e/ou e-mails) ────────────

describe('MonitorConfigPage — T9 Contato unificado', () => {
  function mockConfigWithContacts(contacts: unknown[], overrides: Record<string, unknown> = {}) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/monitor/config') return Promise.resolve({ data: makeConfig({ contacts, ...overrides }) });
      if (url === '/monitor/prefill') return Promise.resolve({ data: { email: null, phone: null } });
      if (url === '/monitor/alerts') return Promise.resolve({ data: [] });
      if (url.startsWith('/monitor/notification-logs')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
  }

  it('mostra "Nenhum contato cadastrado." quando não há contatos', async () => {
    renderPage();
    await screen.findByText('Contatos');
    expect(screen.getByText('Nenhum contato cadastrado.')).toBeInTheDocument();
  });

  // (g) UI: linha única por pessoa, matriz salva e re-hidrata.
  it('(g) carrega um contato com nome + WhatsApp + e-mail numa única linha da tabela', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        name: 'Maria',
        whatsapp: '5511999990001',
        emails: ['fiscal@empresa.com'],
        sectors: ['fiscal', 'finance'],
        sendTimes: [{ hour: 8, minute: 0 }, { hour: 18, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(1);

    const table = tables[0];
    expect(within(table).getByText('Maria')).toBeInTheDocument();
    expect(within(table).getByText(/5511999990001/)).toBeInTheDocument();
    expect(within(table).getByText(/fiscal@empresa\.com/)).toBeInTheDocument();
    expect(within(table).getByText('Fiscal')).toBeInTheDocument();
    expect(within(table).getByText('Financeiro')).toBeInTheDocument();
    expect(within(table).getByText('08:00 · 18:00')).toBeInTheDocument();
  });

  it('aba de setor filtra a lista de contatos', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
      {
        id: 'c2',
        whatsapp: '5511999990002',
        emails: [],
        sectors: ['finance'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    expect(await screen.findByText(/5511999990001/)).toBeInTheDocument();
    expect(screen.getByText(/5511999990002/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fiscal', pressed: false }));

    expect(screen.getByText(/5511999990001/)).toBeInTheDocument();
    expect(screen.queryByText(/5511999990002/)).not.toBeInTheDocument();
  });

  it('"+ Novo contato" abre um modal único com nome, WhatsApp e e-mails lado a lado', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Novo contato')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do contato')).toBeInTheDocument();
    expect(screen.getByLabelText('WhatsApp do contato')).toBeInTheDocument();
    expect(screen.getByLabelText('Adicionar e-mail')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome do contato'), { target: { value: 'João' } });
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), {
      target: { value: '5511988880000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('João')).toBeInTheDocument();
    expect(screen.getByText(/5511988880000/)).toBeInTheDocument();
  });

  // (c) contato sem canal → rejeitar (400 no backend; UI valida o mesmo antes de enviar).
  it('(c) exige pelo menos um canal (WhatsApp ou e-mail)', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pelo menos um canal/i);
  });

  it('exige ao menos 1 setor antes de salvar', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), {
      target: { value: '5511988880000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Selecione ao menos um setor/i);
  });

  it('rejeita telefone inválido', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Telefone inválido/i);
  });

  it('permite até 3 horários e desabilita "+ adicionar horário" no limite', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    expect(screen.getByLabelText('Hora do horário 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ adicionar horário'));
    expect(screen.getByLabelText('Hora do horário 2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ adicionar horário'));
    expect(screen.getByLabelText('Hora do horário 3')).toBeInTheDocument();

    // No limite de 3, o botão de adicionar some
    expect(screen.queryByText('+ adicionar horário')).not.toBeInTheDocument();
  });

  it('editar contato pré-carrega nome, WhatsApp, e-mails e horários', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        name: 'Maria',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 9, minute: 30 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(await screen.findByRole('button', { name: /Editar Maria/i }));

    expect(screen.getByText('Editar contato')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do contato')).toHaveValue('Maria');
    expect(screen.getByLabelText('WhatsApp do contato')).toHaveValue('5511999990001');
    expect(screen.getByLabelText('Hora do horário 1')).toHaveValue('9');
    expect(screen.getByLabelText('Minuto do horário 1')).toHaveValue('30');
  });

  // T8.5/T8.6: seletores de "Resumo de fechamento" e "Visão do caixa" mantidos do T8.
  it('contato novo nasce com "Resumo de fechamento" = Mensal e "Visão do caixa" = Desligado; salvar envia os valores', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));

    // Decisão de negócio (2026-07-16): contato NOVO já nasce com Mensal pré-selecionado.
    expect(screen.getByLabelText('Resumo de fechamento')).toHaveValue('monthly');
    expect(screen.getByLabelText('Visão do caixa')).toHaveValue('off');

    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '5511988880000' } });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.change(screen.getByLabelText('Resumo de fechamento'), { target: { value: 'biweekly' } });
    fireEvent.change(screen.getByLabelText('Visão do caixa'), { target: { value: 'lastSlot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [, payload] = mockPut.mock.calls[0];
    expect(payload.contacts[0]).toMatchObject({ closingReport: 'biweekly', cashView: 'lastSlot' });
  });

  it('editar contato existente re-hidrata "Resumo de fechamento" e "Visão do caixa" salvos', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'biweekly',
        cashView: 'lastSlot',
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(await screen.findByRole('button', { name: /Editar 5511999990001/i }));

    expect(screen.getByLabelText('Resumo de fechamento')).toHaveValue('biweekly');
    expect(screen.getByLabelText('Visão do caixa')).toHaveValue('lastSlot');
  });

  // (a) contato antigo sem `delivery` → comportamento idêntico ao atual (derivação em runtime).
  it('(a) contato sem `delivery` (legado) deriva o resumo "Recebe": pendências + fechamento pelos canais que tem', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'biweekly',
        cashView: 'off',
        // delivery ausente de propósito — contato de antes do T9.
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    expect(await screen.findByText('Pendências, Fechamento')).toBeInTheDocument();
  });

  // (b) matriz: closing só e-mail → WhatsApp não recebe (refletido no payload salvo).
  it('(b) desmarcar "Resumo de fechamento" no WhatsApp da matriz mantém só e-mail no payload salvo', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '5511988880000' } });
    const emailInput = screen.getByLabelText('Adicionar e-mail');
    fireEvent.change(emailInput, { target: { value: 'financeiro@empresa.com' } });
    fireEvent.keyDown(emailInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));

    // Desmarca "Resumo de fechamento via WhatsApp" — deixa só o e-mail marcado.
    fireEvent.click(screen.getByLabelText('📊 Resumo de fechamento via WhatsApp'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [, payload] = mockPut.mock.calls[0];
    expect(payload.contacts[0].delivery.closing).toEqual({ whatsapp: false, email: true });
  });

  it('badge "💰 Caixa" some do resumo quando a matriz de caixa está desligada nos dois canais', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        cashView: 'lastSlot',
        delivery: {
          digest: { whatsapp: true, email: false },
          closing: { whatsapp: false, email: false },
          cash: { whatsapp: false, email: false },
        },
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    expect(await screen.findByText('Pendências')).toBeInTheDocument();
  });

  it('remover contato pede confirmação e some da lista', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(await screen.findByRole('button', { name: /Remover 5511999990001/i }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledOnce());

    await waitFor(() => {
      expect(screen.queryByText(/5511999990001/)).not.toBeInTheDocument();
    });
    expect(screen.getByText('Nenhum contato cadastrado.')).toBeInTheDocument();
  });

  it('"Salvar contato" no modal já persiste no backend (auto-save) — não depende do "Salvar" principal', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), {
      target: { value: '5511988880000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    // O PUT já deve ter disparado ao fechar o modal, sem precisar clicar no "Salvar" da página.
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));

    const [, payload] = mockPut.mock.calls[0];
    // Payload mínimo — só `contacts`, sem sectorConfig nem os demais campos da página.
    expect(Object.keys(payload)).toEqual(['contacts']);
    expect(payload.contacts).toHaveLength(1);
    expect(payload.contacts[0]).toMatchObject({
      whatsapp: '5511988880000',
      sectors: ['fiscal'],
    });
    expect(payload.contacts[0].sendTimes).toEqual([{ hour: 8, minute: 0 }]);
  });

  it('se o auto-save falhar, o modal continua aberto mostrando o erro (não perde o que foi digitado)', async () => {
    mockPut.mockRejectedValueOnce({ response: { data: { message: 'Limite de números WhatsApp atingido.' } } });

    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), {
      target: { value: '5511988880000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível salvar/i);
    // Modal continua aberto — o WhatsApp digitado não some.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('WhatsApp do contato')).toHaveValue('5511988880000');
  });

  it('payload do "Salvar" principal também inclui contacts com o shape esperado', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), {
      target: { value: '5511988880000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(2));

    // Última chamada = clique no "Salvar" principal da página (a 1ª é o auto-save do modal).
    const [, payload] = mockPut.mock.calls.at(-1)!;
    expect(payload.contacts).toHaveLength(1);
    expect(payload.contacts[0]).toMatchObject({
      whatsapp: '5511988880000',
      sectors: ['fiscal'],
    });
    expect(payload.contacts[0].sendTimes).toEqual([{ hour: 8, minute: 0 }]);
  });

  it('BUGFIX: payload do "Salvar" principal não reenvia sectorConfig (grade removida) — evita bloqueio falso de limite WA', async () => {
    // Config com sectorConfig legado já populado (números antigos) + plano com limite
    // apertado — reproduz o cenário em que o save de um contato novo era bloqueado
    // porque o sectorConfig congelado do estado local era somado ao contato novo.
    mockGet.mockImplementation((url: string) => {
      if (url === '/monitor/config')
        return Promise.resolve({
          data: makeConfig({
            waNumbersUsed: 2,
            waNumbersLimit: 2,
            sectorConfig: {
              fiscal: { recipients: [{ contact: '5511917747429', channel: 'whatsapp' }], sendHour: 13, sendMinute: 0, sendDays: ALL_DAYS },
              logistic: { recipients: [{ contact: '5511994327713', channel: 'whatsapp' }], sendHour: 13, sendMinute: 0, sendDays: ALL_DAYS },
              frota: makeSectorOverride(),
              finance: makeSectorOverride(),
            },
          }),
        });
      if (url === '/monitor/prefill') return Promise.resolve({ data: { email: null, phone: null } });
      if (url === '/monitor/alerts') return Promise.resolve({ data: [] });
      if (url.startsWith('/monitor/notification-logs')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });

    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), {
      target: { value: '5511988880000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(2));

    // Última chamada = clique no "Salvar" principal (a 1ª é o auto-save do modal, que
    // nunca manda sectorConfig de qualquer forma — o ponto aqui é o botão da página).
    const [, payload] = mockPut.mock.calls.at(-1)!;
    expect(payload).not.toHaveProperty('sectorConfig');
    expect(payload.contacts).toHaveLength(1);
  });

  // (e) contador "N disponíveis" e bloqueio só de número novo no limite.
  it('(e) contador mostra "X de Y números do plano · N disponíveis"', async () => {
    mockConfigWithContacts(
      [
        {
          id: 'c1',
          whatsapp: '5511999990001',
          emails: [],
          sectors: ['fiscal'],
          sendTimes: [{ hour: 8, minute: 0 }],
          sendDays: [1, 2, 3, 4, 5],
        },
      ],
      { waNumbersUsed: 1, waNumbersLimit: 3 },
    );
    renderPage();
    await screen.findByText('Contatos');

    expect(await screen.findByText(/1 de 3 números do plano · 2 disponíveis/)).toBeInTheDocument();
  });

  it('(e) no limite, contato só-e-mail continua livre para adicionar (não bloqueado)', async () => {
    mockConfigWithContacts([], { waNumbersUsed: 1, waNumbersLimit: 1 });
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    const emailInput = screen.getByLabelText('Adicionar e-mail');
    fireEvent.change(emailInput, { target: { value: 'so-email@empresa.com' } });
    fireEvent.keyDown(emailInput, { key: 'Enter', code: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('so-email@empresa.com')).toBeInTheDocument();
  });

  // (d) UI: horário fora da janela mostra aviso não-bloqueante.
  it('(d) horário de contato fora da janela geral de envio mostra aviso não-bloqueante', async () => {
    mockConfigWithContacts(
      [
        {
          id: 'c1',
          whatsapp: '5511999990001',
          emails: [],
          sectors: ['fiscal'],
          sendTimes: [{ hour: 21, minute: 0 }],
          sendDays: [1, 2, 3, 4, 5],
        },
      ],
      { sendWindowStart: 6, sendWindowEnd: 20 },
    );
    renderPage();
    await screen.findByText('Contatos');

    expect(await screen.findByText(/fora da janela/i)).toBeInTheDocument();
  });

  it('config da janela de envio carrega e salva sendWindowStart/sendWindowEnd/criticalOutsideWindow', async () => {
    mockConfigWithContacts([], { sendWindowStart: 6, sendWindowEnd: 20, criticalOutsideWindow: 'hold' });
    renderPage();
    await screen.findByText('Janela de envio');

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));

    const [, payload] = mockPut.mock.calls[0];
    expect(payload).toMatchObject({
      sendWindowStart: 6,
      sendWindowEnd: 20,
      criticalOutsideWindow: 'hold',
    });
  });
});
