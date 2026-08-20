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

/** Mocks GET /monitor/config with the given contacts + config overrides. */
function mockConfigWithContacts(contacts: unknown[], overrides: Record<string, unknown> = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/monitor/config') return Promise.resolve({ data: makeConfig({ contacts, ...overrides }) });
    if (url === '/monitor/prefill') return Promise.resolve({ data: { email: null, phone: null } });
    if (url === '/monitor/alerts') return Promise.resolve({ data: [] });
    if (url.startsWith('/monitor/notification-logs')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
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

// ── T9-WIZARD: contato unificado, wizard de 3 passos (2026-07-17) ───────────

describe('MonitorConfigPage — T9 Contato unificado (wizard 3 passos)', () => {
  /** Passo 1→2 ou 2→3 — só existe um botão "Avançar" por vez. */
  function advance() {
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
  }
  function back() {
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
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
    // Espera o DADO, não o rótulo da seção. "Contatos" é o título e aparece na
    // primeira renderização, com a lista ainda carregando — o `getAllByRole` logo
    // abaixo então lia o estado vazio ("Nenhum contato cadastrado") e falhava
    // dizendo que não existe tabela. Passava aqui e quebrava na CI, que é mais lenta.
    await screen.findByText('Maria');

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

  // ── Navegação do wizard ──────────────────────────────────────────────────

  it('wizard: navega pelos 3 passos (Avançar/Voltar) com o indicador de progresso refletindo o passo atual', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    const dialog = screen.getByRole('dialog');

    // Passo 1 ativo — campos de "Quem recebe" visíveis, passo 2/3 não.
    expect(within(dialog).getByLabelText('Nome do contato')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Passo 1: Quem recebe' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('⚠️ Pendências do dia')).not.toBeInTheDocument();

    // DDI fixo (2026-07-21): digita-se só DDD + número — o +55 é adorno do campo.
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();

    // Passo 2 ativo — cards de matriz visíveis, campos do passo 1 somem.
    expect(await screen.findByText('⚠️ Pendências do dia')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Passo 2: O que recebe' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Nome do contato')).not.toBeInTheDocument();

    advance();

    // Passo 3 ativo — setores/chip do caixa/horários/dias visíveis.
    expect(await screen.findByText('O que entra no relatório de pendências')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Passo 3: Quando recebe' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Salvar contato' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Avançar' })).not.toBeInTheDocument();

    // Voltar duas vezes retorna ao passo 1 com os dados preservados.
    back();
    expect(await screen.findByText('⚠️ Pendências do dia')).toBeInTheDocument();
    back();
    expect(await screen.findByLabelText('Nome do contato')).toBeInTheDocument();
    expect(screen.getByLabelText('WhatsApp do contato')).toHaveValue('11988880000');
  });

  // (c) contato sem canal → rejeitar (400 no backend; UI valida o mesmo antes de avançar do passo 1).
  it('(c) T10-WIZARD: cada ramo exige seu canal — validação bloqueia o "Avançar" no passo 1', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    // Ramo WhatsApp (default) sem número → bloqueia com pedido de WhatsApp.
    advance();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Informe o WhatsApp/i);
    // Continua no passo 1 — não avançou.
    expect(screen.getByLabelText('Nome do contato')).toBeInTheDocument();

    // Trocando pro ramo e-mail, a exigência passa a ser um e-mail.
    fireEvent.click(screen.getByRole('button', { name: '✉️ E-mail' }));
    advance();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Informe pelo menos um e-mail/i);
  });

  it('rejeita telefone inválido no passo 1', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '123' } });
    advance();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Telefone inválido/i);
  });

  it('exige ao menos 1 setor antes de salvar (passo 3)', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar contato' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Selecione ao menos um setor/i);
  });

  it('"+ Novo contato" completa o wizard nos 3 passos e persiste o contato', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('Nome do contato'), { target: { value: 'João' } });
    // digita LOCAL (11 dígitos)...
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('João')).toBeInTheDocument();
    // ...e PERSISTE com o DDI — a asserção do valor salvo continua com o 55.
    expect(screen.getByText(/5511988880000/)).toBeInTheDocument();
  });

  it('permite até 3 horários (passo 3) e desabilita "+ adicionar horário" no limite', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();

    expect(await screen.findByLabelText('Hora do horário 1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ adicionar horário'));
    expect(screen.getByLabelText('Hora do horário 2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+ adicionar horário'));
    expect(screen.getByLabelText('Hora do horário 3')).toBeInTheDocument();

    // No limite de 3, o botão de adicionar some
    expect(screen.queryByText('+ adicionar horário')).not.toBeInTheDocument();
  });

  it('editar contato pré-carrega nome/WhatsApp no passo 1 e horários no passo 3', async () => {
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
    // DDI fixo: o contato salvo tem o 55, mas o campo exibe só DDD + número
    // (par exibir-sem-55/salvar-com-55 — sem isso, cada edição viraria 5555...).
    expect(screen.getByLabelText('WhatsApp do contato')).toHaveValue('11999990001');

    advance();
    advance();

    expect(await screen.findByLabelText('Hora do horário 1')).toHaveValue('9');
    expect(screen.getByLabelText('Minuto do horário 1')).toHaveValue('30');
  });

  // ── DDI fixo (2026-07-21) — as duas armadilhas da mudança ──────────────────

  it('DDI: editar e salvar SEM mexer no número não duplica o 55 (a armadilha)', async () => {
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
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const body = mockPut.mock.calls[mockPut.mock.calls.length - 1][1];
    const savedMaria = body.contacts.find((c: any) => c.id === 'c1');
    // exibe sem 55, salva com UM 55 — nunca 5555...
    expect(savedMaria.whatsapp).toBe('5511999990001');
  });

  it('DDI: duplicado é detectado mesmo com o salvo tendo 55 e o digitado sendo local', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    // digita o MESMO número da Maria, mas no formato local (sem o 55)
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11999990001' } });
    advance();

    expect(await screen.findByRole('alert')).toHaveTextContent(/já está cadastrado/i);
  });

  // ── Passo 2: pills de canal + periodicidade ──────────────────────────────

  it('novo contato nasce com Pendências e Receita×despesa ligados, periodicidade Mensal e caixa desligado; navega e salva os valores escolhidos', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();

    // Defaults do passo 2.
    expect(await screen.findByRole('button', { name: '⚠️ Pendências do dia via WhatsApp' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '📊 Receita × despesa via WhatsApp' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mensal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Quinzenal' })).toHaveAttribute('aria-pressed', 'false');

    // Troca a periodicidade pra Quinzenal.
    fireEvent.click(screen.getByRole('button', { name: 'Quinzenal' }));
    advance();

    // Passo 3 — caixa nasce desligado (default).
    expect(await screen.findByRole('button', { name: '🍯 Visão do caixa' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: '🍯 Visão do caixa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [, payload] = mockPut.mock.calls[0];
    expect(payload.contacts[0]).toMatchObject({ closingReport: 'biweekly', cashView: 'on' });
  });

  it('periodicidade é seleção única — trocar de chip desmarca o anterior', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();

    fireEvent.click(await screen.findByRole('button', { name: 'Semanal' }));
    expect(screen.getByRole('button', { name: 'Semanal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mensal' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Quinzenal' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Quinzenal' }));
    expect(screen.getByRole('button', { name: 'Quinzenal' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Semanal' })).toHaveAttribute('aria-pressed', 'false');
  });

  // (b) matriz: closing só e-mail → WhatsApp não recebe (refletido no payload salvo).
  it('(b) desligar a pill de WhatsApp no card Receita × despesa mantém só e-mail no payload salvo', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    const emailInput = screen.getByLabelText('Adicionar e-mail');
    fireEvent.change(emailInput, { target: { value: 'financeiro@empresa.com' } });
    fireEvent.keyDown(emailInput, { key: 'Enter', code: 'Enter' });
    advance();

    // Desliga "Receita × despesa via WhatsApp" — deixa só o e-mail ligado.
    fireEvent.click(await screen.findByRole('button', { name: '📊 Receita × despesa via WhatsApp' }));
    advance();
    fireEvent.click(await screen.findByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [, payload] = mockPut.mock.calls[0];
    expect(payload.contacts[0].delivery.closing).toEqual({ whatsapp: false, email: true });
    // T9-WIZARD: delivery persistido não tem mais `cash`.
    expect(payload.contacts[0].delivery.cash).toBeUndefined();
  });

  // ── Passo 3: chip do caixa + hidratação de periodicidade/caixa na edição ──

  it('chip 🍯 Visão do caixa liga/desliga cashView e reflete em aria-pressed', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();

    const chip = await screen.findByRole('button', { name: '🍯 Visão do caixa' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    const [, payload] = mockPut.mock.calls[0];
    expect(payload.contacts[0].cashView).toBe('on');
  });

  // T9-ADENDO (2026-07-17): o chip só tem on/off — legado 'lastSlot' é
  // normalizado para 'on' ao popular o modal de edição (ver `openEditContact`).
  it('editar contato existente re-hidrata periodicidade e chip do caixa (compat lastSlot→on)', async () => {
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
    advance();

    expect(await screen.findByRole('button', { name: 'Quinzenal' })).toHaveAttribute('aria-pressed', 'true');
    advance();

    expect(await screen.findByRole('button', { name: '🍯 Visão do caixa' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('editar contato existente com periodicidade weekly re-hidrata corretamente', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        closingReport: 'weekly',
        cashView: 'on',
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(await screen.findByRole('button', { name: /Editar 5511999990001/i }));
    advance();

    expect(await screen.findByRole('button', { name: 'Semanal' })).toHaveAttribute('aria-pressed', 'true');
    advance();

    expect(await screen.findByRole('button', { name: '🍯 Visão do caixa' })).toHaveAttribute('aria-pressed', 'true');
  });

  // ── Resumo "Recebe" na lista ──────────────────────────────────────────────

  // (a) contato antigo sem `delivery` → comportamento idêntico ao atual (derivação em runtime).
  it('(a) contato sem `delivery` (legado) deriva o resumo "Recebe": Pendências, Receita × despesa', async () => {
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

    expect(await screen.findByText('Pendências, Receita × despesa')).toBeInTheDocument();
  });

  it('resumo "Recebe" não mostra Caixa quando cashView está desligado, mesmo com pendências ligadas', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        cashView: 'off',
        delivery: {
          digest: { whatsapp: true, email: false },
          closing: { whatsapp: false, email: false },
        },
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    expect(await screen.findByText('Pendências')).toBeInTheDocument();
  });

  // T9-WIZARD: caixa herda os canais do digest — só aparece se cashView está
  // ligado E o digest tem pelo menos 1 canal de verdade.
  it('resumo "Recebe" mostra Caixa quando cashView está ligado e o digest tem algum canal', async () => {
    mockConfigWithContacts([
      {
        id: 'c1',
        whatsapp: '5511999990001',
        emails: [],
        sectors: ['fiscal'],
        sendTimes: [{ hour: 8, minute: 0 }],
        sendDays: [1, 2, 3, 4, 5],
        cashView: 'on',
        delivery: {
          digest: { whatsapp: true, email: false },
          closing: { whatsapp: false, email: false },
        },
      },
    ]);
    renderPage();
    await screen.findByText('Contatos');

    expect(await screen.findByText('Pendências, Caixa')).toBeInTheDocument();
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

  it('"Salvar contato" no passo 3 já persiste no backend (auto-save) — não depende do "Salvar" principal', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    // DDI fixo: digita LOCAL; o payload persiste com o 55 (asserção abaixo inalterada).
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: /^📄 Fiscal$/ }));
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
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível salvar/i);
    // Modal continua aberto no passo 3 — nada foi perdido; volta ao passo 1 confirma.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    back();
    back();
    // o campo guarda o formato LOCAL (o +55 é adorno)
    expect(await screen.findByLabelText('WhatsApp do contato')).toHaveValue('11988880000');
  });

  it('payload do "Salvar" principal também inclui contacts com o shape esperado', async () => {
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: /^📄 Fiscal$/ }));
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
    fireEvent.change(screen.getByLabelText('WhatsApp do contato'), { target: { value: '11988880000' } });
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: /^📄 Fiscal$/ }));
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

  // ── (e) contador "N disponíveis" e bloqueio só de número novo no limite ──

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
    // T10-WIZARD: escolhe o ramo e-mail antes de digitar (WhatsApp fica oculto).
    fireEvent.click(screen.getByRole('button', { name: '✉️ E-mail' }));
    const emailInput = screen.getByLabelText('Adicionar e-mail');
    fireEvent.change(emailInput, { target: { value: 'so-email@empresa.com' } });
    fireEvent.keyDown(emailInput, { key: 'Enter', code: 'Enter' });
    advance();
    advance();
    fireEvent.click(await screen.findByRole('button', { name: /^📄 Fiscal$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contato' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // Renderizado como "✉️ so-email@empresa.com" — exact match falha por causa
    // do emoji, mesmo padrão dos outros testes deste arquivo (ex.: "(g) carrega...").
    expect(screen.getByText(/so-email@empresa\.com/)).toBeInTheDocument();
  });

  it('(e) no limite, WhatsApp de contato NOVO fica bloqueado no passo 1 com upsell', async () => {
    mockConfigWithContacts([], { waNumbersUsed: 1, waNumbersLimit: 1 });
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(screen.getByRole('button', { name: /novo contato/i }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText('WhatsApp do contato')).toBeDisabled();
    expect(within(dialog).getByText(/Limite de números do plano atingido/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Adicionar número — R\$ 29,90\/mês/i)).toBeInTheDocument();
  });

  it('(e) no limite, editar contato que já tem WhatsApp NÃO bloqueia o campo (não é número novo)', async () => {
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
      { waNumbersUsed: 1, waNumbersLimit: 1 },
    );
    renderPage();
    await screen.findByText('Contatos');

    fireEvent.click(await screen.findByRole('button', { name: /Editar 5511999990001/i }));

    expect(screen.getByLabelText('WhatsApp do contato')).not.toBeDisabled();
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

    // Regex ancorado no ⚠️: antes de T9-FIX, `/fora da janela/i` batia também no
    // label estático "Crítico fora da janela:" do seletor de config geral (agora
    // removido — ver bloco T9-FIX abaixo). Mantido ancorado por segurança.
    expect(await screen.findByText(/⚠️ fora da janela/i)).toBeInTheDocument();
  });

  it('config da janela de envio carrega e salva sendWindowStart/sendWindowEnd', async () => {
    mockConfigWithContacts([], { sendWindowStart: 6, sendWindowEnd: 20, criticalOutsideWindow: 'hold' });
    renderPage();
    await screen.findByText('Janela de envio');

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));

    const [, payload] = mockPut.mock.calls[0];
    expect(payload).toMatchObject({
      sendWindowStart: 6,
      sendWindowEnd: 20,
    });
  });
});

describe('MonitorConfigPage — T9-FIX (2026-07-17): seletor "Crítico fora da janela" removido', () => {
  it('não renderiza mais o seletor "Crítico fora da janela" — comportamento é fixo (hold)', async () => {
    mockConfigWithContacts([], { sendWindowStart: 6, sendWindowEnd: 20, criticalOutsideWindow: 'hold' });
    renderPage();
    await screen.findByText('Janela de envio');

    expect(screen.queryByLabelText('Crítico fora da janela')).not.toBeInTheDocument();
    expect(screen.queryByText(/segura até abrir/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/envia na hora/i)).not.toBeInTheDocument();
    // O card explica o comportamento fixo em texto corrido, não mais como opção.
    expect(screen.getByText(/alertas críticos sempre seguram até a janela abrir/i)).toBeInTheDocument();
  });

  it('PUT com criticalOutsideWindow antigo (compat TMS) não quebra o salvamento — campo é aceito e ignorado', async () => {
    mockConfigWithContacts([], { sendWindowStart: 6, sendWindowEnd: 20, criticalOutsideWindow: 'send' });
    renderPage();
    await screen.findByText('Janela de envio');

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    // Não lança/mostra erro — o save completa normalmente mesmo com o valor legado 'send' em memória.
    expect(screen.queryByText(/erro ao salvar/i)).not.toBeInTheDocument();
  });
});
