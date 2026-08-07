import { defineConfig, devices } from '@playwright/test';

/**
 * Varredura E2E de todas as rotas do Nexa.
 *
 * Roda contra um frontend JÁ EM PÉ (o Vite proxya /api pro backend :3001), em
 * vez de subir um servidor próprio: na máquina do time a porta 5173 costuma
 * estar ocupada por outro projeto, e um `webServer` fixo quebraria a suíte por
 * um motivo que não tem nada a ver com o app.
 *
 *   E2E_BASE_URL   — onde o frontend está (default http://localhost:5173)
 *   E2E_EMAIL/PASS — credenciais do login (default admin@nexa.local)
 *   E2E_TENANT_ID  — cliente a operar quando o usuário é platform admin;
 *                    se ausente, o global-setup descobre pelo /api/admin/tenants
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  // Fora de `src/`, então nem o vitest (include: src/**) nem o
  // `tsc --noEmit` (include: ["src"]) enxergam esta pasta — a suíte de
  // unidade e o typecheck do projeto seguem exatamente como estavam.
  outputDir: './e2e/.artifacts',
  // SERIAL de propósito. O banco de desenvolvimento é o Postgres gerenciado do
  // DigitalOcean — cada request atravessa a internet, e sob 4 workers os tempos
  // de resposta subiram para 1,2-1,8s, estourando o timeout de navegação. As
  // falhas eram do ambiente, não do app (as mesmas rotas passam em série).
  // Varredura de fumaça de ~27 rotas não precisa de paralelismo: roda em ~2min.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Uma retentativa cobre lentidão pontual do banco remoto sem mascarar
  // defeito real — falha determinística falha nas duas tentativas.
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: './e2e/.report', open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL,
    // Sessão autenticada uma vez no global-setup e reaproveitada por todos os
    // testes — sem isto cada rota pagaria um login.
    storageState: './e2e/.auth/user.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // A suíte móvel roda só no projeto abaixo: em 1440px "não tem rolagem
      // horizontal" é verdade trivial e não provaria nada.
      testIgnore: /mobile-viewport\.spec\.ts/,
    },
    {
      name: 'mobile',
      // iPhone 13 traz viewport, touch e user-agent móveis — mas o preset vem
      // com `defaultBrowserType: 'webkit'`, e só o Chromium está instalado.
      // Forçar chromium evita baixar outro browser (~200MB) pra um teste de
      // RESPONSIVIDADE, onde o que importa é a largura, não o motor. Também é
      // o mais representativo: a maioria do tráfego móvel é Android/Chrome.
      // Para testar o motor da Apple: `npx playwright install webkit` e remover
      // o browserName abaixo.
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
      testMatch: /mobile-viewport\.spec\.ts/,
    },
  ],
});
