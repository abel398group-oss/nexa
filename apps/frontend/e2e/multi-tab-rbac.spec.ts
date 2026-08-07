import { test, expect, type Page } from '@playwright/test';
import { abrir, apiHeaders, prepararSessao } from './helpers';

test.use({ viewport: { width: 1440, height: 900 } });

/**
 * 👯 Duas abas: mudança numa aparece na outra em tempo real (WebSocket).
 *
 * A ação escolhida é atribuir o chamado, porque ela emite `conversation.updated`
 * → `inbox:update` na sala do tenant, que é o caminho que o Inbox usa pra se
 * manter fresco. O estado é RESTAURADO no fim: o dono original volta.
 */
test.describe('👯 Sincronia entre abas', () => {
  test('atribuir chamado numa aba reflete na outra sem recarregar', async ({ context, request }) => {
    const aba1: Page = await context.newPage();
    const aba2: Page = await context.newPage();
    await abrir(aba1, '/support');
    await abrir(aba2, '/support');

    // Descobre um chamado e guarda o dono atual pra devolver depois.
    const lista = await request.get('/api/conversations?scope=support&limit=1', { headers: apiHeaders() });
    const item = (await lista.json()).items?.[0];
    test.skip(!item, 'Nenhum chamado de suporte para exercitar a sincronia.');
    const donoOriginal: string | null = item.assignedAnalystId ?? null;

    try {
      await aba1.locator('[role="button"]').first().click();
      await aba1.waitForTimeout(1000);

      // A aba 2 precisa RECEBER o evento — fica escutando a rechamada da lista.
      const aba2Atualizou = aba2.waitForResponse(
        (r) => r.url().includes('/api/conversations') && r.ok(),
        { timeout: 25_000 },
      );

      // Aba 1: devolve o chamado pra fila (muda o dono → dispara o evento).
      const seletor = aba1.locator('select').last();
      await seletor.selectOption('');
      await aba1.waitForTimeout(500);

      // Aba 2 reagiu ao WebSocket, sem reload.
      await aba2Atualizou;
      expect(aba2.url(), 'a aba 2 não pode ter navegado').toContain('/support');
    } finally {
      // Restaura o dono original — a suíte não deixa o chamado mexido.
      await request.patch(`/api/conversations/${item.id}/assign-analyst`, {
        headers: apiHeaders(),
        data: { userId: donoOriginal },
      });
      await aba1.close();
      await aba2.close();
    }
  });
});

/**
 * 🏷️ RBAC: rota administrativa com usuário sem privilégio.
 *
 * Cria um usuário temporário `operacional` (permissão só de `inbox`), entra com
 * ele num contexto separado e tenta as rotas restritas. No fim o usuário é
 * apagado — inclusive se o teste falhar no meio.
 */
test.describe('🏷️ Guarda de rota por permissão', () => {
  const email = `e2e.rbac.${Date.now()}@nexa.local`;
  const senha = 'e2e-Senha-123';
  let userId: string | null = null;

  test.beforeAll(async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL, storageState: './e2e/.auth/user.json' });
    const r = await api.post('/api/users', {
      headers: apiHeaders(),
      data: {
        name: 'E2E RBAC',
        email,
        password: senha,
        role: 'operacional',
        permissions: ['inbox'], // sem 'admin', sem 'ai_control'
      },
    });
    if (r.ok()) userId = (await r.json())?.id ?? null;
    await api.dispose();
  });

  test.afterAll(async ({ playwright, baseURL }) => {
    if (!userId) return;
    const api = await playwright.request.newContext({ baseURL, storageState: './e2e/.auth/user.json' });
    // DELETE é irreversível: precisa da quebra de vidro (limpeza de fixture).
    await api.delete(`/api/users/${userId}`, { headers: apiHeaders(true) });
    await api.dispose();
  });

  test('usuário sem permissão não entra em rota administrativa', async ({ browser, baseURL }) => {
    test.skip(!userId, 'Não foi possível criar o usuário de teste.');

    // Contexto limpo: sessão própria, sem herdar a do admin.
    const ctxUser = await browser.newContext({ baseURL });
    const page = await ctxUser.newPage();

    try {
      const login = await page.request.post('/api/auth/login', { data: { email, password: senha } });
      expect(login.ok(), 'login do usuário de teste falhou').toBeTruthy();

      await prepararSessao(page); // só marca o tour; este usuário já tem tenant

      for (const rota of ['/settings/support-email', '/settings/email-channel', '/settings/monitor', '/users']) {
        await page.goto(rota, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);

        const texto = await page.locator('body').innerText();
        const bloqueado =
          !page.url().includes(rota) || /sem permiss|acesso negado|n[ãa]o autorizad/i.test(texto);

        expect(
          bloqueado,
          `${rota} ficou acessível para usuário sem permissão (URL: ${page.url()})`,
        ).toBeTruthy();
      }

      // E a rota liberada continua funcionando — o guard não pode bloquear tudo.
      await page.goto('/inbox', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      expect(page.url()).toContain('/inbox');
    } finally {
      await ctxUser.close();
    }
  });
});
