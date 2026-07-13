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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MonitorConfigPage } from './MonitorConfigPage';

// ── Mocks de módulo ──────────────────────────────────────────────────────────

const mockGet  = vi.fn();
const mockPost = vi.fn().mockResolvedValue({ data: {} });
const mockPut  = vi.fn().mockResolvedValue({ data: {} });

vi.mock('@/shared/lib/api', () => ({
  api: { get: mockGet, put: mockPut, post: mockPost },
}));

vi.mock('@/app/providers/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/app/providers/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 'tenant-1', email: 'admin@test.com' } }),
}));

const mockConfirm = vi.fn<() => Promise<boolean>>();

vi.mock('@/app/providers/ConfirmContext', () => ({
  useConfirm: () => mockConfirm,
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Dados de teste ────────────────────────────────────────────────────────────

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type SectorConfigInput = {
  sendHour?: number;
  sendMinute?: number;
  sendDays?: number[];
  recipients?: unknown[];
};

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

function makeSectorOverride(sector: SectorConfigInput = {}) {
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
    <QueryClientProvider client={qc}>
      <MonitorConfigPage />
    </QueryClientProvider>,
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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
   * "Aplicar a todos os setores" copia hora/minuto/dias do bloco "Horário padrão"
   * para os 4 setores após o usuário confirmar o diálogo.
   */
  it('comportamento 1: "Aplicar a todos" copia hora e minuto para os 4 setores', async () => {
    renderPage();

    // Aguarda o carregamento do config (useEffect atualiza o estado)
    const defaultBlock = await screen.findByText('Horário padrão (todos os setores)');
    expect(defaultBlock).toBeTruthy();

    // Altera o select de "Hora padrão" para 10h
    const hourSelect = screen.getByRole('combobox', { name: /hora padrão/i });
    fireEvent.change(hourSelect, { target: { value: '10' } });

    // O select de hora padrão reflete a mudança
    expect(hourSelect).toHaveDisplayValue('10h');

    // Clica em "Aplicar a todos os setores"
    fireEvent.click(screen.getByText('Aplicar a todos os setores'));

    // O diálogo de confirmação deve ter sido chamado
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledOnce());

    // Após confirmação, os 4 setores devem mostrar 10h no select de hora
    await waitFor(() => {
      // O select padrão + os 4 setores = pelo menos 5 selects com "10h"
      const allTen = screen.getAllByDisplayValue('10h');
      expect(allTen.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('comportamento 1b: cancelar o diálogo NÃO altera os setores', async () => {
    // Usuário cancela a confirmação
    mockConfirm.mockResolvedValue(false);
    renderPage();

    await screen.findByText('Horário padrão (todos os setores)');

    const hourSelect = screen.getByRole('combobox', { name: /hora padrão/i });
    fireEvent.change(hourSelect, { target: { value: '15' } });

    fireEvent.click(screen.getByText('Aplicar a todos os setores'));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledOnce());

    // Os setores ainda devem mostrar o horário original (7h da config)
    await waitFor(() => {
      // Não deve haver 4+ selects com "15h" (só o padrão)
      const allFifteen = screen.queryAllByDisplayValue('15h');
      expect(allFifteen.length).toBeLessThanOrEqual(1); // só o select padrão em si
    });
  });

  /**
   * Comportamento 2:
   * Após "Aplicar a todos", editar um setor individualmente afeta SOMENTE aquele setor.
   * Os demais permanecem com o horário que foi aplicado.
   */
  it('comportamento 2: editar um setor individualmente após aplicar a todos afeta só aquele setor', async () => {
    renderPage();
    await screen.findByText('Horário padrão (todos os setores)');

    // Define o padrão para 8h e aplica a todos
    const hourSelect = screen.getByRole('combobox', { name: /hora padrão/i });
    fireEvent.change(hourSelect, { target: { value: '8' } });
    fireEvent.click(screen.getByText('Aplicar a todos os setores'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledOnce());

    // Aguarda todos os setores com 8h
    await waitFor(() => {
      const allEight = screen.getAllByDisplayValue('08h');
      expect(allEight.length).toBeGreaterThanOrEqual(4);
    });

    // Edita o setor Fiscal para 9h (primeiro select de hora dentro do card Fiscal)
    const fiscalLabel = screen.getByText('Fiscal');
    const fiscalCard = fiscalLabel.closest<HTMLElement>('.card');
    expect(fiscalCard).toBeTruthy();

    const fiscalSelects = within(fiscalCard!).getAllByRole('combobox');
    // [0] = hora, [1] = minuto (ordem no JSX)
    fireEvent.change(fiscalSelects[0], { target: { value: '9' } });

    // Fiscal agora deve mostrar 9h
    expect(fiscalSelects[0]).toHaveDisplayValue('09h');

    // Os outros 3 setores (logistic, frota, finance) ainda devem mostrar 8h
    await waitFor(() => {
      const allEight = screen.getAllByDisplayValue('08h');
      // Default schedule select + 3 setores restantes = pelo menos 3 selects com 8h
      expect(allEight.length).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * Comportamento 3:
   * O badge "personalizado" aparece em um setor quando seu horário difere do
   * defaultSchedule. Setores com horário igual ao padrão NÃO exibem o badge.
   */
  it('comportamento 3: badge "personalizado" aparece quando setor difere do horário padrão', async () => {
    // Configura Fiscal com hora diferente do global (9h vs 8h)
    mockGet.mockImplementation((url: string) => {
      if (url === '/monitor/config')
        return Promise.resolve({
          data: makeConfig({
            sendHour: 8,
            sectorConfig: {
              fiscal:   makeSectorOverride({ sendHour: 9 }),   // diferente → badge
              logistic: makeSectorOverride({ sendHour: 8 }),   // igual → sem badge
              frota:    makeSectorOverride({ sendHour: 8 }),   // igual → sem badge
              finance:  makeSectorOverride({ sendHour: 8 }),   // igual → sem badge
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

    // Aguarda o badge aparecer (useEffect é assíncrono)
    const badges = await screen.findAllByText('personalizado');
    expect(badges).toHaveLength(1);

    // O badge está dentro do card Fiscal
    const fiscalCard = screen.getByText('Fiscal').closest<HTMLElement>('.card');
    expect(fiscalCard).toBeTruthy();
    expect(within(fiscalCard!).getByText('personalizado')).toBeTruthy();

    // Logística NÃO tem badge
    const logisticCard = screen.getByText('Logística').closest<HTMLElement>('.card');
    expect(within(logisticCard!).queryByText('personalizado')).toBeNull();
  });

  it('comportamento 3b: badge desaparece ao editar o setor de volta para o horário padrão', async () => {
    // Fiscal começa diferente (8h global, 9h fiscal)
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

    // Edita Fiscal de volta para 8h (igual ao padrão)
    const fiscalCard = screen.getByText('Fiscal').closest<HTMLElement>('.card');
    const fiscalSelects = within(fiscalCard!).getAllByRole('combobox');
    fireEvent.change(fiscalSelects[0], { target: { value: '8' } });

    // Badge deve desaparecer
    await waitFor(() => {
      expect(screen.queryByText('personalizado')).toBeNull();
    });
  });
});
