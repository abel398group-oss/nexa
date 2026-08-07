import { test, expect } from '@playwright/test';
import { abrir } from './helpers';

/**
 * 📱 Viewport móvel.
 *
 * Roda no projeto "mobile" do playwright.config (iPhone 13). O projeto desktop
 * ignora este arquivo — senão as mesmas asserções rodariam em 1440px, onde
 * "não tem rolagem horizontal" é verdade trivial e não prova nada.
 */

const TELAS = ['/inbox', '/dashboard', '/support', '/contacts'];

/** Rolagem horizontal é o sintoma clássico de layout que não cabe na tela. */
async function larguras(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
}

test.describe('📱 Telas em viewport de celular', () => {
  for (const rota of TELAS) {
    test(`${rota} — cabe na tela, sem rolagem horizontal`, async ({ page }) => {
      /**
       * DEFEITO CONHECIDO — /dashboard estoura a largura no celular:
       * 477px de conteúdo dentro de 390px de viewport, ou seja, ~87px que só
       * aparecem arrastando a tela de lado. As outras rotas passam, então não
       * é o shell: é o conteúdo do painel (provavelmente a grade de métricas
       * ou o gráfico, que não têm largura mínima flexível).
       *
       * Marcado como `fixme`, não removido: o dia em que o CSS for ajustado,
       * este teste volta a valer sozinho. Reportado ao Abel.
       */
      test.fixme(
        rota === '/dashboard',
        'Bug real de responsividade: /dashboard tem 477px de conteúdo em 390px de viewport.',
      );

      const errosJs: string[] = [];
      page.on('pageerror', (e) => errosJs.push(e.message));

      await abrir(page, rota);

      const texto = (await page.locator('body').innerText()).trim();
      expect(texto.length, `${rota} veio em branco no celular`).toBeGreaterThan(10);
      expect(texto).not.toMatch(/Algo deu errado|Something went wrong/i);

      const { scroll, cliente } = await larguras(page);
      // 2px de folga pra arredondamento de sub-pixel.
      expect(
        scroll,
        `${rota} estoura a largura da tela (${scroll}px de conteúdo em ${cliente}px de viewport)`,
      ).toBeLessThanOrEqual(cliente + 2);

      expect(errosJs, `${rota} lançou exceção no viewport móvel`).toEqual([]);
    });
  }

  test('menu lateral fica fora da tela e abre pelo botão', async ({ page }) => {
    await abrir(page, '/inbox');

    const sidebar = page.locator('[aria-label="Navegação principal"]');
    await expect(sidebar).toBeAttached();

    /**
     * No celular a barra é off-canvas: existe no DOM com `-translate-x-full`.
     * Por isso a checagem é pela POSIÇÃO — `toBeVisible` daria verdadeiro,
     * já que o elemento está renderizado, só deslocado pra fora.
     */
    const foraDaTela = await sidebar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.right <= 1 || r.left < -10;
    });
    expect(foraDaTela, 'a barra lateral deveria estar recolhida no celular').toBeTruthy();

    // O botão de abrir existe e está acessível por rótulo.
    const abrirMenu = page.getByRole('button', { name: 'Abrir menu' });
    await expect(abrirMenu, 'deveria haver um botão de abrir menu no celular').toBeVisible();
  });

  test('menu abre ao tocar no botão', async ({ page }) => {
    /**
     * DEFEITO CONHECIDO — o menu não abre no celular.
     *
     * O botão existe e está visível (`aria-label="Abrir menu"`), mas o botão de
     * "Busca rápida (Ctrl+K)" do cabeçalho fica POR CIMA dele em 390px e come o
     * toque. Na prática: no celular não dá pra abrir a navegação, e o usuário
     * fica preso na tela em que entrou.
     *
     * O Playwright acusa como "subtree intercepts pointer events" — não é
     * limitação do teste, é o que o dedo do usuário encontra. Um `click({force})`
     * mascararia o problema, então o teste fica `fixme` até o cabeçalho ser
     * ajustado. Reportado ao Abel.
     */
    test.fixme(true, 'Bug real: botão de busca rápida sobrepõe o botão de menu em 390px.');

    await abrir(page, '/inbox');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.waitForTimeout(500);
    const sidebar = page.locator('[aria-label="Navegação principal"]');
    const dentro = await sidebar.evaluate((el) => el.getBoundingClientRect().left >= -1);
    expect(dentro, 'a barra deveria deslizar para dentro ao abrir o menu').toBeTruthy();
  });
});
