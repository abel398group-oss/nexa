import { test, expect } from '@playwright/test';
import { abrir, apiHeaders, limparContatos, MARCA_E2E } from './helpers';

/**
 * 💾 Persistência: o que foi salvo continua salvo depois do reload.
 *
 * ⚠️ ESTA É A ÚNICA SUÍTE QUE ESCREVE NO BANCO. O banco de dev é o Postgres de
 * PRODUÇÃO (CLAUDE.md), então cada teste:
 *   - marca o registro com MARCA_E2E no nome e na empresa;
 *   - apaga no afterEach, que roda mesmo se a asserção falhar no meio;
 *   - e o afterAll varre sobras, cobrindo o caso de a suíte ter sido
 *     interrompida numa execução anterior.
 * O telefone é derivado do relógio para não colidir com a unique (tenant, phone).
 */

test.use({ viewport: { width: 1440, height: 900 } });

function fixture() {
  const carimbo = Date.now();
  return {
    nome: `Cliente ${MARCA_E2E} ${carimbo}`,
    empresa: `${MARCA_E2E} Transportes`,
    /**
     * COM o prefixo 55, apesar de o placeholder do campo mostrar
     * "11999998888" (sem prefixo).
     *
     * O CreateContactDto exige `^55\d{10,11}$` sobre o valor CRU — e o
     * formulário manda o que foi digitado, sem normalizar. Quem segue o
     * placeholder toma 400. Isso é um descompasso real entre a dica do campo e
     * a validação da API (reportado ao Abel); o teste usa o formato que
     * funciona de propósito, porque o objetivo dele é provar PERSISTÊNCIA.
     * Fixar aqui o comportamento com defeito seria carimbá-lo como correto.
     */
    telefone: `5511${String(carimbo).slice(-9)}`,
  };
}

test.describe('💾 Persistência de cadastro', () => {
  test.afterEach(async ({ request }) => {
    const n = await limparContatos(request);
    if (n) console.log(`[e2e] limpeza: ${n} contato(s) de teste removido(s)`);
  });

  test.afterAll(async ({ request }) => {
    const n = await limparContatos(request);
    if (n) console.log(`[e2e] varredura final: ${n} sobra(s) removida(s)`);
  });

  test('contato criado pela UI sobrevive ao reload', async ({ page, request }) => {
    const dados = fixture();
    await abrir(page, '/contacts');

    const dialogo = page.getByRole('dialog');
    await page.getByRole('button', { name: '+ Novo' }).click();
    await expect(dialogo).toBeVisible();

    await dialogo.getByPlaceholder('11999998888').fill(dados.telefone);
    await dialogo.getByPlaceholder('Joao Silva').fill(dados.nome);
    await dialogo.getByPlaceholder('Transportadora X').fill(dados.empresa);
    await dialogo.getByRole('button', { name: 'Salvar' }).click();

    // 1. Confirmação na tela.
    await expect(page.getByText(/Contato salvo/i)).toBeVisible({ timeout: 15_000 });
    await expect(dialogo, 'modal deve fechar após salvar').toBeHidden();

    // 2. Aparece na lista sem recarregar.
    await expect(page.getByText(dados.nome).first()).toBeVisible();

    // 3. O teste de verdade: recarregar e continuar lá. Só some da tela quem
    //    nunca chegou ao banco — é o cenário que "salvei e não gravou" produz.
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    // `.first()`: a lista renderiza a linha em duas variações (tabela desktop
    // e card mobile), então o nome casa duas vezes no DOM.
    await expect(
      page.getByText(dados.nome).first(),
      'o contato sumiu depois do reload — não foi persistido',
    ).toBeVisible({ timeout: 20_000 });

    // 4. E existe de fato no backend, não só no DOM.
    const r = await request.get(`/api/contacts?search=${encodeURIComponent(dados.telefone)}`, {
      headers: apiHeaders(),
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.items?.length, 'backend não devolveu o contato recém-criado').toBeGreaterThan(0);
  });

  test('edição persiste depois do reload', async ({ page }) => {
    const dados = fixture();
    await abrir(page, '/contacts');
    const dialogo = page.getByRole('dialog');

    // cria
    await page.getByRole('button', { name: '+ Novo' }).click();
    await dialogo.getByPlaceholder('11999998888').fill(dados.telefone);
    await dialogo.getByPlaceholder('Joao Silva').fill(dados.nome);
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText(/Contato salvo/i)).toBeVisible({ timeout: 15_000 });

    // Edita pelo menu da linha (aria-label="Ações" no DataTable) — clicar no
    // nome não abre nada; a edição fica no dropdown, não na célula.
    const novaEmpresa = `${MARCA_E2E} Editada`;
    const linha = page.getByRole('row').filter({ hasText: dados.nome }).first();
    await linha.getByRole('button', { name: 'Ações' }).click();
    await page.getByRole('menuitem', { name: 'Editar' })
      .or(page.getByRole('button', { name: 'Editar' }))
      .first()
      .click();

    await expect(dialogo).toBeVisible();
    await expect(dialogo).toContainText('Editar contato');
    await dialogo.getByPlaceholder('Transportadora X').fill(novaEmpresa);
    await dialogo.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText(/Contato atualizado/i)).toBeVisible({ timeout: 15_000 });

    // reload: a alteração tem que ter ido pro banco
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(
      page.getByText(novaEmpresa).first(),
      'a edição sumiu depois do reload',
    ).toBeVisible({ timeout: 20_000 });
  });
});
