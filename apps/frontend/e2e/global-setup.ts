import { chromium, request, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// O pacote é "type": "module", então __dirname não existe aqui.
const AQUI = dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = resolve(AQUI, '.auth/user.json');
const CTX_FILE = resolve(AQUI, '.auth/context.json');

/**
 * Autentica uma vez e guarda a sessão para toda a suíte.
 *
 * Faz o login pela API em vez de preencher o formulário: o objetivo aqui é
 * PREPARAR as outras rotas, não testar a tela de login — que tem teste próprio
 * em full-app-scan.spec.ts. Se o login falhar, aborta a suíte inteira com uma
 * mensagem clara, porque 20 rotas falhando por sessão ausente não diz nada
 * sobre as 20 rotas.
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:5173';
  const email = process.env.E2E_EMAIL ?? 'admin@nexa.local';
  const password = process.env.E2E_PASSWORD ?? 'admin123';

  mkdirSync(dirname(AUTH_FILE), { recursive: true });

  const api = await request.newContext({ baseURL });

  const health = await api.get('/api/health').catch(() => null);
  if (!health?.ok()) {
    throw new Error(
      `[e2e] Frontend/backend não respondem em ${baseURL}.\n` +
        `Suba o app antes (pnpm dev) ou aponte outro alvo:\n` +
        `  E2E_BASE_URL=http://localhost:5174 pnpm test:e2e`,
    );
  }

  const login = await api.post('/api/auth/login', { data: { email, password } });
  if (!login.ok()) {
    throw new Error(
      `[e2e] Login falhou (HTTP ${login.status()}) para ${email}.\n` +
        `Ajuste E2E_EMAIL / E2E_PASSWORD se as credenciais forem outras.`,
    );
  }
  const me = await login.json();

  // Platform admin (tenantId null) não enxerga nada até escolher um cliente —
  // o TenantGate troca TODA rota protegida pelo seletor de cliente. Sem
  // resolver isto, a varredura inteira testaria a mesma tela de seleção.
  let actingTenantId = process.env.E2E_TENANT_ID ?? null;
  if (!actingTenantId) {
    const tenants = await api.get('/api/admin/tenants').catch(() => null);
    if (tenants?.ok()) {
      const list = await tenants.json();
      const first = Array.isArray(list) ? list[0] : list?.items?.[0];
      actingTenantId = first?.id ?? first?.tenantId ?? null;
    }
  }

  // storageState do Playwright persiste cookies e localStorage, mas NÃO
  // sessionStorage — que é onde o acting tenant vive (FE-SEC-001). Por isso o
  // id é gravado aqui e reinjetado por addInitScript em cada teste.
  const storage = await api.storageState();
  writeFileSync(AUTH_FILE, JSON.stringify(storage, null, 2));
  writeFileSync(
    CTX_FILE,
    JSON.stringify({ actingTenantId, userId: me?.userId ?? null, role: me?.role ?? null }, null, 2),
  );

  await api.dispose();

  // Confere que a sessão realmente abre uma rota protegida. Barato agora,
  // e evita a suíte inteira vermelha por um detalhe de sessão.
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL, storageState: AUTH_FILE });
  if (actingTenantId) {
    await ctx.addInitScript(
      ([key, value]) => window.sessionStorage.setItem(key as string, value as string),
      ['nexa_acting_tenant', actingTenantId],
    );
  }
  const page = await ctx.newPage();
  const resp = await page.goto('/inbox', { waitUntil: 'domcontentloaded' });
  const autenticado = !page.url().includes('/login') && (resp?.status() ?? 500) < 400;
  await browser.close();

  if (!autenticado) {
    throw new Error('[e2e] Sessão salva não abriu /inbox — login redirecionou de volta.');
  }

  console.log(
    `[e2e] sessão pronta · usuário=${email} papel=${me?.role ?? '?'} ` +
      `cliente=${actingTenantId ?? '(nenhum — usuário já é de um tenant)'}`,
  );
}

export default globalSetup;
