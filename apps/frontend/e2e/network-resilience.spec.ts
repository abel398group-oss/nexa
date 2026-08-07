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
 * Este teste nasceu `fixme`, documentando a lacuna da auditoria (item 2.4):
 * `send()` não tinha try/catch, então um envio que falhava rejeitava no console
 * e a tela não mostrava NADA — o analista clicava em Enviar, nada acontecia, e
 * ele ficava sem saber se o cliente recebeu. Corrigido; o teste agora vale.
 */
test.describe('🌩️ Envio de mensagem com a integração fora', () => {
  test('503 no envio avisa o analista e preserva o texto digitado', async ({ page }) => {
    await abrir(page, '/support');

    const card = page.locator('[role="button"]').first();
    test.skip(!(await card.isVisible().catch(() => false)), 'Nenhum chamado de suporte na fila.');
    await card.click();

    const campo = page.locator('input[placeholder*="mensagem" i]');
    await campo.waitFor({ state: 'visible', timeout: 15_000 });

    await page.route('**/api/conversations/*/messages', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"WAHA fora do ar"}' })
        : route.continue(),
    );

    const texto = 'teste de falha de envio — nao deve sumir';
    await campo.fill(texto);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();

    // 1. O analista precisa SABER que falhou.
    await expect(
      page.getByText(/WAHA fora do ar|não foi possível enviar/i).first(),
      'falha no envio tem que aparecer na tela',
    ).toBeVisible({ timeout: 15_000 });

    // 2. E o que ele escreveu não pode se perder por causa disso.
    await expect(campo, 'o texto digitado sumiu depois da falha').toHaveValue(texto);
  });

  test('envio lento não deixa mandar a mesma mensagem duas vezes', async ({ page }) => {
    await abrir(page, '/support');
    const card = page.locator('[role="button"]').first();
    test.skip(!(await card.isVisible().catch(() => false)), 'Nenhum chamado de suporte na fila.');
    await card.click();

    const campo = page.locator('input[placeholder*="mensagem" i]');
    await campo.waitFor({ state: 'visible', timeout: 15_000 });

    // Segura o POST: janela pra tentar o segundo clique.
    let posts = 0;
    await page.route('**/api/conversations/*/messages', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts++;
      await new Promise((r) => setTimeout(r, 2500));
      // Falha no fim: o objetivo é contar POSTs, não gravar mensagem de teste
      // numa conversa real.
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"fim do teste"}' });
    });

    await campo.fill('teste de clique duplo');
    const botao = page.getByRole('button', { name: /Enviar/ });
    await botao.click();

    // O botão avisa que está em andamento e recusa novo clique.
    await expect(page.getByRole('button', { name: 'Enviando...' })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'Enviando...' }).click({ force: true }).catch(() => undefined);
    await page.keyboard.press('Enter').catch(() => undefined);

    await page.waitForTimeout(4000);
    expect(posts, `houve ${posts} envios — o cliente receberia a mesma resposta repetida`).toBe(1);
  });
});
