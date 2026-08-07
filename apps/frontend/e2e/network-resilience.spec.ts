import { test, expect } from '@playwright/test';
import { abrir } from './helpers';

/**
 * 📶 Resiliência de rede e integrações.
 *
 * NOTA HONESTA sobre o indicador de desconexão: o app NÃO TEM UM hoje. Procurei
 * em InboxPage e Layout — não existe banner de "reconectando". Então este
 * arquivo não finge testar um indicador inexistente: ele valida o que de fato
 * importa e é verificável — que a aplicação SOBREVIVE à queda e volta a operar
 * quando a rede retorna. A ausência do indicador está reportada como lacuna.
 */

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('📶 Queda e volta de rede', () => {
  test('inbox sobrevive a ficar offline e volta a operar ao reconectar', async ({ page, context }) => {
    const errosJs: string[] = [];
    page.on('pageerror', (e) => errosJs.push(e.message));

    await abrir(page, '/inbox');
    await expect(page.getByText(/Conversas/i).first()).toBeVisible();

    // ── cai a rede ──
    await context.setOffline(true);
    await page.waitForTimeout(2500);

    // A tela não pode sumir nem virar Error Boundary só porque o socket caiu.
    const texto = await page.locator('body').innerText();
    expect(texto.length, 'tela esvaziou ao ficar offline').toBeGreaterThan(50);
    expect(texto).not.toMatch(/Algo deu errado|Something went wrong/i);

    // ── volta a rede ──
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    // Prova de que voltou a operar: uma navegação real da app funciona e a
    // lista recarrega do servidor.
    const respostaLista = page.waitForResponse(
      (r) => r.url().includes('/api/conversations') && r.ok(),
      { timeout: 20_000 },
    );
    await page.reload();
    await respostaLista;

    await expect(page.getByText(/Conversas/i).first()).toBeVisible();
    expect(errosJs, 'exceção JS durante a oscilação de rede').toEqual([]);
  });

  test('API fora do ar (503) não derruba a tela do inbox', async ({ page }) => {
    const errosJs: string[] = [];
    page.on('pageerror', (e) => errosJs.push(e.message));

    // Simula a lista de conversas indisponível ANTES de abrir a tela.
    await page.route('**/api/conversations**', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"indisponivel"}' }),
    );

    await abrir(page, '/inbox');

    // O app tem tratamento pra isso (convsError) — precisa avisar, não sumir.
    const texto = await page.locator('body').innerText();
    expect(texto.length).toBeGreaterThan(50);
    await expect(
      page.getByText(/Erro ao carregar|Tentar novamente|indisponivel/i).first(),
      'API fora deveria mostrar aviso na tela',
    ).toBeVisible({ timeout: 20_000 });
    expect(errosJs).toEqual([]);
  });

  test('401 da API leva de volta pro login sem travar', async ({ page }) => {
    // Depois que a tela abre, invalida a sessão: é o cenário de token expirado
    // com a aba aberta. O interceptor tenta refresh e, falhando, manda pro login.
    await abrir(page, '/inbox');

    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (url.includes('/auth/login')) return route.continue();
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"message":"Unauthorized"}',
      });
    });

    await page.reload().catch(() => undefined);
    await page.waitForURL(/\/login/, { timeout: 25_000 });
    expect(page.url()).toContain('/login');
    await expect(page.getByRole('button', { name: /Entrar/i }).first()).toBeVisible();
  });
});

/**
 * 🌩️ Falha no envio de mensagem.
 *
 * MARCADO COMO `fixme` DE PROPÓSITO — não é teste instável, é lacuna real do
 * app, já registrada na auditoria (item 2.4): `send()` no InboxPage não tem
 * try/catch. Se o envio falhar, a promise rejeita no console e a tela não
 * mostra NADA: o analista clica em Enviar, não acontece nada visível, e ele não
 * sabe se a mensagem foi ou não.
 *
 * O teste fica aqui, escrito e correto, descrevendo o comportamento ESPERADO.
 * Vira verde sozinho no dia em que `send()` ganhar um try/catch com toast —
 * o mesmo padrão que `assignAnalyst`, `saveNoteEdit` e `saveContactField` já
 * usam no mesmo arquivo. Apagar o teste esconderia a lacuna; deixá-lo vermelho
 * quebraria a suíte inteira e ninguém olharia mais para ela.
 */
test.fixme('envio de mensagem que falha deveria avisar o analista', async ({ page }) => {
  await abrir(page, '/support');

  const card = page.locator('[role="button"]').first();
  await card.click();

  await page.route('**/api/conversations/*/messages', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"WAHA fora"}' })
      : route.continue(),
  );

  const campo = page.locator('input[placeholder*="mensagem" i]');
  await campo.fill('teste de falha de envio');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();

  // ESPERADO (hoje não acontece): aviso visível de que o envio falhou.
  await expect(page.getByText(/erro|falh|não foi possível/i).first()).toBeVisible({ timeout: 10_000 });
});
