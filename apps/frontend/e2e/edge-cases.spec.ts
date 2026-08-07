import { test, expect } from '@playwright/test';
import { abrir, limparContatos, MARCA_E2E } from './helpers';

/**
 * 👾 Entradas extremas: campo vazio, texto gigante, emoji.
 * O que se verifica é que a UI não quebra e a API não estoura 500 — entrada
 * ruim tem que virar erro tratado, nunca tela branca.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const TEXTO_LONGO = `${MARCA_E2E} ` + 'A'.repeat(520);
const EMOJIS = `${MARCA_E2E} 🚀🔥🤖 ção ñ 中文 <script>alert(1)</script>`;

/** Barra de rolagem horizontal = layout estourou. */
async function semRolagemHorizontal(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    // 2px de folga: arredondamento de sub-pixel não é overflow.
    return d.scrollWidth <= d.clientWidth + 2;
  });
}

test.describe('👾 Entradas extremas', () => {
  test.afterEach(async ({ request }) => {
    await limparContatos(request);
  });

  test('formulário em branco: acusa erro e não some da tela', async ({ page }) => {
    await abrir(page, '/contacts');
    const dialogo = page.getByRole('dialog');

    await page.getByRole('button', { name: '+ Novo' }).click();
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Salvar' }).click();

    await expect(dialogo, 'modal não pode fechar com formulário inválido').toBeVisible();
    await expect(dialogo).toContainText(/inv[aá]lido|obrigat|deve/i);
    expect(await semRolagemHorizontal(page)).toBeTruthy();
  });

  test('texto de 500+ caracteres não estoura layout nem 500 na API', async ({ page }) => {
    const erros500: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 500) erros500.push(`${r.status()} ${r.url()}`);
    });

    await abrir(page, '/contacts');
    const dialogo = page.getByRole('dialog');
    await page.getByRole('button', { name: '+ Novo' }).click();

    await dialogo.getByPlaceholder('11999998888').fill(`5511${String(Date.now()).slice(-9)}`);
    await dialogo.getByPlaceholder('Joao Silva').fill(TEXTO_LONGO);
    await dialogo.getByPlaceholder('Transportadora X').fill(TEXTO_LONGO);
    await dialogo.getByRole('button', { name: 'Salvar' }).click();

    // Aceita salvar OU recusar com mensagem — o que não pode é 500 nem quebrar.
    await page.waitForTimeout(3000);
    expect(erros500, 'API respondeu 5xx para texto longo').toEqual([]);
    expect(
      await semRolagemHorizontal(page),
      'texto longo empurrou o layout e criou rolagem horizontal',
    ).toBeTruthy();
    // A tela continua de pé e operável.
    await expect(page.getByRole('button', { name: '+ Novo' })).toBeVisible();
  });

  test('emoji e caractere especial não quebram a tela', async ({ page }) => {
    const erros500: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 500) erros500.push(`${r.status()} ${r.url()}`);
    });
    const errosJs: string[] = [];
    page.on('pageerror', (e) => errosJs.push(e.message));

    await abrir(page, '/contacts');
    const dialogo = page.getByRole('dialog');
    await page.getByRole('button', { name: '+ Novo' }).click();

    await dialogo.getByPlaceholder('11999998888').fill(`5511${String(Date.now()).slice(-9)}`);
    await dialogo.getByPlaceholder('Joao Silva').fill(EMOJIS);
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await page.waitForTimeout(3000);

    expect(erros500, 'API respondeu 5xx para emoji/caractere especial').toEqual([]);
    expect(errosJs, 'exceção JS ao lidar com emoji').toEqual([]);
    expect(await semRolagemHorizontal(page)).toBeTruthy();

    // O <script> tem que aparecer como TEXTO, nunca executar.
    const alertou = await page.evaluate(() => (window as any).__xss_disparou === true);
    expect(alertou, 'conteúdo do campo foi executado como script').toBeFalsy();
  });

  test('busca com termo inexistente devolve vazio sem quebrar', async ({ page }) => {
    await abrir(page, '/contacts');
    // Placeholder completo de propósito: /Buscar/i sozinho casaria também com a
    // busca global do cabeçalho (Ctrl+K), que é outro campo.
    const busca = page.getByPlaceholder('Buscar nome, telefone, empresa...');
    await busca.fill('zzz-nao-existe-' + Date.now());
    // A busca de contatos é EXPLÍCITA: só aplica no Enter ou no botão "Buscar"
    // (appliedSearch). Digitar sozinho não filtra — diferente do Inbox, que faz
    // debounce automático. Sem o Enter, o teste media a lista sem filtro nenhum.
    await busca.press('Enter');
    await page.waitForTimeout(2000);

    await expect(page.getByText(/Nenhum contato encontrado|Nenhum contato/i).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(await semRolagemHorizontal(page)).toBeTruthy();
  });
});
