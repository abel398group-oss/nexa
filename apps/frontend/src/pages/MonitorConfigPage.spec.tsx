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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('MonitorConfigPage — Horário padrão', () => {
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
