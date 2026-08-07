import { test, expect } from '@playwright/test';
import { abrir, limparContatos, MARCA_E2E } from './helpers';

/**
 * 🐢 Conexão lenta: o botão de salvar precisa travar enquanto a requisição
 * está no ar. Sem isso, o usuário impaciente clica três vezes e cria três
 * registros — e em rede ruim ele SEMPRE vai clicar de novo.
 *
 * A lentidão é simulada segurando a RESPOSTA da rota (page.route), não
 * estrangulando a rede inteira via CDP: o atraso fica exatamente onde o teste
 * precisa dele, e é determinístico. Throttling global tornaria o teste lento e
 * instável por motivos que não têm a ver com o botão.
 */

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('🐢 Rede lenta e clique duplo', () => {
  test.afterEach(async ({ request }) => {
    await limparContatos(request);
  });

  test('botão entra em "Salvando..." e não aceita segundo clique', async ({ page }) => {
    const telefone = `5511${String(Date.now()).slice(-9)}`;
    let posts = 0;

    // Segura o POST por 3s — janela suficiente pra tentar o clique duplo.
    await page.route('**/api/contacts', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts++;
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue();
    });

    await abrir(page, '/contacts');
    const dialogo = page.getByRole('dialog');
    await page.getByRole('button', { name: '+ Novo' }).click();

    await dialogo.getByPlaceholder('11999998888').fill(telefone);
    await dialogo.getByPlaceholder('Joao Silva').fill(`Cliente ${MARCA_E2E} lento`);

    const salvar = dialogo.getByRole('button', { name: /Salvar/ });
    await salvar.click();

    // Estado de carregamento visível: é o que impede o clique repetido.
    await expect(
      dialogo.getByRole('button', { name: /Salvando/ }),
      'o botão deveria mostrar "Salvando..." durante o envio',
    ).toBeVisible({ timeout: 5_000 });

    // Tenta clicar mais duas vezes com a requisição em voo.
    await dialogo.getByRole('button', { name: /Salvando/ }).click({ force: true }).catch(() => undefined);
    await dialogo.getByRole('button', { name: /Salvando/ }).click({ force: true }).catch(() => undefined);

    // Espera concluir.
    await expect(page.getByText(/Contato salvo/i)).toBeVisible({ timeout: 20_000 });

    expect(posts, `houve ${posts} POSTs — clique duplo criou registro repetido`).toBe(1);
  });

  test('lista continua utilizável enquanto a API demora', async ({ page }) => {
    // Atrasa a listagem: o app tem que mostrar carregamento e não travar.
    await page.route('**/api/contacts?**', async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });

    await abrir(page, '/contacts');

    // Depois da espera a tela precisa estar inteira e operável.
    await expect(page.getByRole('button', { name: '+ Novo' })).toBeVisible({ timeout: 25_000 });
    const texto = await page.locator('body').innerText();
    expect(texto).not.toMatch(/Algo deu errado|Something went wrong/i);
  });
});
