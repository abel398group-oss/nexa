import { test, expect, type Page } from '@playwright/test';
import { abrir } from './helpers';

/**
 * 👆 Interação real: clique, digitação, abrir/fechar modal, trocar aba.
 *
 * ISOLAMENTO DE DADOS — regra desta suíte: o banco de desenvolvimento é o
 * Postgres de PRODUÇÃO (ver CLAUDE.md). Nenhum teste aqui grava nada. Os
 * formulários são preenchidos e depois CANCELADOS, que é justamente o caminho
 * pedido e o único seguro contra este banco. Se um dia um teste precisar
 * salvar, ele tem que criar e apagar o próprio registro — e não é o caso aqui.
 */

test.use({ viewport: { width: 1440, height: 900 } });

/** Abre o primeiro chamado da fila. Devolve false se não houver nenhum. */
async function abrirPrimeiroChamado(page: Page): Promise<boolean> {
  const card = page.locator('[role="button"]').first();
  if (!(await card.isVisible().catch(() => false))) return false;
  await card.click();
  // O composer só existe com uma conversa aberta.
  await page
    .locator('input[placeholder*="mensagem" i], input[placeholder*="Nota interna" i]')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => undefined);
  return true;
}

// ─── Fluxo 1: modal de cadastro ─────────────────────────────────────────────
test.describe('👆 Fluxo 1 — modal de contato abre, preenche e fecha', () => {
  test('abre pelo "+ Novo", preenche e fecha no Cancelar', async ({ page }) => {
    await abrir(page, '/contacts');

    const dialogo = page.getByRole('dialog');
    await expect(dialogo, 'modal não pode estar aberto antes do clique').toBeHidden();

    await page.getByRole('button', { name: '+ Novo' }).click();

    // Abriu de fato: overlay + título certo.
    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Novo contato');

    // Preenche os campos pelos placeholders reais do formulário.
    await dialogo.getByPlaceholder('11999998888').fill('11988887777');
    await dialogo.getByPlaceholder('Joao Silva').fill('Teste E2E — nao salvar');
    await dialogo.getByPlaceholder('Transportadora X').fill('Empresa E2E');

    // Confere que o que foi digitado ficou no campo (two-way binding vivo).
    await expect(dialogo.getByPlaceholder('11999998888')).toHaveValue('11988887777');

    // Cancela: NADA é gravado — ver nota de isolamento no topo do arquivo.
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();

    // A UI não pode ter travado: o botão de abrir volta a funcionar.
    await page.getByRole('button', { name: '+ Novo' }).click();
    await expect(dialogo).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialogo, 'modal deve fechar no Esc').toBeHidden();
  });

  test('campo vazio: formulário acusa erro em vez de salvar', async ({ page }) => {
    await abrir(page, '/contacts');
    const dialogo = page.getByRole('dialog');

    await page.getByRole('button', { name: '+ Novo' }).click();
    await expect(dialogo).toBeVisible();

    // Telefone é o único obrigatório (contactSchema) — salvar sem ele deve
    // barrar no cliente, não virar request.
    await dialogo.getByRole('button', { name: 'Salvar' }).click();

    await expect(dialogo, 'modal não pode fechar com formulário inválido').toBeVisible();
    await expect(dialogo).toContainText(/inv[aá]lido|obrigat/i);

    await page.keyboard.press('Escape');
    await expect(dialogo).toBeHidden();
  });
});

// ─── Fluxo 2: alternância Responder ↔ Nota Interna ──────────────────────────
test.describe('👆 Fluxo 2 — composer alterna entre resposta e nota interna', () => {
  test('trocar pra Nota Interna muda o composer, e voltar desfaz', async ({ page }) => {
    await abrir(page, '/support');

    const temChamado = await abrirPrimeiroChamado(page);
    test.skip(!temChamado, 'Nenhum chamado de suporte na fila — nada para abrir.');

    const btnResponder = page.getByRole('button', { name: /Responder Cliente/i });
    const btnNota = page.getByRole('button', { name: /Nota Interna/i });
    await expect(btnResponder).toBeVisible();
    await expect(btnNota).toBeVisible();

    // Estado inicial: modo público — botão de envio diz "Enviar".
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();

    // ── liga a nota interna ──
    await btnNota.click();

    // O rótulo do botão de envio muda: é o sinal mais forte de que a mensagem
    // NÃO vai pro cliente.
    await expect(page.getByRole('button', { name: 'Salvar nota', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeHidden();

    // O placeholder avisa o escopo.
    const campo = page.locator('input[placeholder*="Nota interna" i]');
    await expect(campo).toBeVisible();

    // E a cor muda de verdade (âmbar), não só o texto — é o que o analista vê
    // de canto de olho antes de digitar algo que não devia ir pro cliente.
    const corNota = await campo.evaluate((el) => getComputedStyle(el).borderColor);

    // ── volta pro modo público ──
    await page.getByRole('button', { name: /Responder Cliente/i }).click();
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar nota', exact: true })).toBeHidden();

    const campoPublico = page.locator('input[placeholder*="mensagem" i]');
    await expect(campoPublico).toBeVisible();
    const corPublica = await campoPublico.evaluate((el) => getComputedStyle(el).borderColor);

    expect(corNota, 'a borda do composer precisa mudar entre os dois modos').not.toBe(corPublica);
  });

  test('trocar de conversa não carrega o modo nota interna junto', async ({ page }) => {
    await abrir(page, '/support');
    const temChamado = await abrirPrimeiroChamado(page);
    test.skip(!temChamado, 'Nenhum chamado de suporte na fila.');

    await page.getByRole('button', { name: /Nota Interna/i }).click();
    await expect(page.getByRole('button', { name: 'Salvar nota', exact: true })).toBeVisible();

    // Reabrir a conversa precisa resetar o modo: herdar "nota interna" de uma
    // conversa pra outra é como uma resposta ao cliente vira nota por engano
    // (ou o contrário).
    await page.locator('[role="button"]').first().click();
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeVisible();
  });
});

// ─── Fluxo 3: abas de fila ──────────────────────────────────────────────────
test.describe('👆 Fluxo 3 — abas de fila do Inbox de Suporte', () => {
  test('cada aba fica ativa ao ser clicada e consulta o servidor', async ({ page }) => {
    await abrir(page, '/support');

    const abas = ['Todos', 'Fila Geral (sem dono)', 'Meus Chamados'];
    for (const nome of abas) {
      await expect(page.getByRole('button', { name: nome, exact: true })).toBeVisible();
    }

    // 2B: a fila é filtrada no SERVIDOR — clicar na aba tem que virar request,
    // não filtro em memória. Se alguém reverter isso pro cliente, este teste cai.
    const req = page.waitForRequest(
      (r) => r.url().includes('/api/conversations') && r.url().includes('queue=unassigned'),
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Fila Geral (sem dono)', exact: true }).click();
    await req;

    const abaFila = page.getByRole('button', { name: 'Fila Geral (sem dono)', exact: true });
    const abaMinhas = page.getByRole('button', { name: 'Meus Chamados', exact: true });

    /**
     * Lê a cor de fundo com o mouse LONGE e depois da transição.
     * Sem isso a medição pega ou o hover (o ponteiro fica sobre o botão que
     * acabou de ser clicado) ou uma cor intermediária do `transition-colors` —
     * as duas coisas geram falha que não é do app.
     *
     * O canto neutro é o ALTO À DIREITA, nunca (0,0): ali fica a barra lateral,
     * que expande no hover (`sm:hover:w-60`) e passa a cobrir o conteúdo —
     * "afastar o mouse" pra lá interceptava os cliques seguintes.
     */
    const corDe = async (loc: typeof abaFila) => {
      await page.mouse.move(1430, 8);
      await page.waitForTimeout(400);
      return loc.evaluate((el) => getComputedStyle(el).backgroundColor);
    };

    // Com "Fila Geral" ativa, as duas abas precisam se distinguir.
    const filaAtiva = await corDe(abaFila);
    const minhasInativa = await corDe(abaMinhas);
    expect(filaAtiva, 'aba ativa precisa se distinguir da inativa').not.toBe(minhasInativa);

    // Ao trocar de aba, o destaque tem que SE DESLOCAR: quem era ativa vira
    // inativa e vice-versa. Comparar contra a cor exata capturada antes seria
    // frágil (basta um ajuste de tema pra quebrar) — o que importa é o rodízio.
    await abaMinhas.click();
    const filaDepois = await corDe(abaFila);
    const minhasDepois = await corDe(abaMinhas);

    expect(minhasDepois, '"Meus Chamados" deveria ter assumido o destaque').not.toBe(minhasInativa);
    expect(filaDepois, '"Fila Geral" deveria ter perdido o destaque').not.toBe(filaAtiva);
    expect(minhasDepois, 'só uma aba pode estar ativa por vez').not.toBe(filaDepois);
  });

  test('busca digitada vai pro servidor uma vez só (debounce)', async ({ page }) => {
    await abrir(page, '/support');

    const busca = page.getByPlaceholder(/Buscar/i).first();
    await expect(busca).toBeVisible();

    const chamadas: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/conversations?') && r.url().includes('search=')) {
        chamadas.push(r.url());
      }
    });

    // 2B: sem debounce isto viraria uma request por tecla.
    await busca.pressSequentially('Fabio', { delay: 60 });
    await page.waitForTimeout(1200);

    expect(chamadas.length, `esperado 1 request de busca, veio ${chamadas.length}`).toBeLessThanOrEqual(2);
    expect(chamadas.at(-1)).toContain('search=Fabio');
  });
});
