import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROTAS, ROTA_INEXISTENTE, type Rota } from './routes';

// O pacote é "type": "module", então __dirname não existe aqui.
const AQUI = dirname(fileURLToPath(import.meta.url));
const CTX_FILE = resolve(AQUI, '.auth/context.json');
const ctx = existsSync(CTX_FILE)
  ? (JSON.parse(readFileSync(CTX_FILE, 'utf8')) as { actingTenantId: string | null })
  : { actingTenantId: null };

/**
 * Ruído conhecido do ambiente de teste, não defeito do app:
 *  - WebSocket: o Playwright fecha a página no fim de cada teste e o socket.io
 *    reclama da conexão cortada;
 *  - favicon/manifest: 404 de asset estático não é erro de tela;
 *  - ResizeObserver loop: aviso benigno do próprio browser, comum com layout
 *    responsivo, sem efeito no usuário.
 */
const RUIDO_CONHECIDO = [
  /websocket/i,
  /socket\.io/i,
  /favicon/i,
  /manifest\.json/i,
  /ResizeObserver loop/i,
  /Failed to load resource: net::ERR_/i,
];

const ehRuido = (texto: string) => RUIDO_CONHECIDO.some((r) => r.test(texto));

type Coleta = {
  erroFatal: Error[];
  consoleErros: string[];
  apiRuins: { url: string; status: number }[];
};

/** Liga os coletores ANTES de navegar — evento perdido não volta. */
function coletar(page: Page, rota: Rota): Coleta {
  const c: Coleta = { erroFatal: [], consoleErros: [], apiRuins: [] };
  const tolerados = new Set([...(rota.apiToleradas ?? [])]);

  // Exceção JS não tratada: é o sinal mais forte de tela quebrada.
  page.on('pageerror', (err) => c.erroFatal.push(err));

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const texto = msg.text();
    if (!ehRuido(texto)) c.consoleErros.push(texto);
  });

  page.on('response', (resp) => {
    const url = resp.url();
    if (!url.includes('/api/')) return;
    const status = resp.status();
    if (status < 400 || tolerados.has(status)) return;
    c.apiRuins.push({ url: url.replace(/^https?:\/\/[^/]+/, ''), status });
  });

  return c;
}

/**
 * Injeta o cliente "em operação" antes de qualquer script da página.
 *
 * O storageState do Playwright guarda cookie e localStorage, mas não
 * sessionStorage — e é lá que mora o acting tenant do platform admin. Sem
 * isto, toda rota protegida renderiza o seletor de cliente em vez da tela,
 * e a varredura aprovaria 20 vezes a mesma página.
 */
async function prepararSessao(page: Page) {
  if (!ctx.actingTenantId) return;
  await page.addInitScript(
    ([k, v]) => window.sessionStorage.setItem(k as string, v as string),
    ['nexa_acting_tenant', ctx.actingTenantId],
  );
}

/** Espera o app sair do esqueleto de carregamento (Suspense/skeleton). */
async function esperarRender(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => {
      const t = document.body?.innerText?.trim() ?? '';
      return t.length > 0 && !/^Carregando\.\.\.$/.test(t);
    }, { timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

const rotasAtivas = ROTAS.filter((r) => !r.somenteDev || process.env.NODE_ENV !== 'production');

test.describe('Varredura completa das rotas', () => {
  for (const rota of rotasAtivas) {
    test(`${rota.path} — ${rota.nome}`, async ({ page }) => {
      const coleta = coletar(page, rota);
      await prepararSessao(page);

      const resposta = await page.goto(rota.path, { waitUntil: 'commit' });
      await esperarRender(page);

      // ── 1. O documento em si carregou ──────────────────────────────────
      expect(resposta?.status() ?? 500, `HTTP do documento em ${rota.path}`).toBeLessThan(400);

      // ── 2. Não é tela branca nem Error Boundary ────────────────────────
      const texto = (await page.locator('body').innerText()).trim();
      expect(texto.length, `${rota.path} renderizou tela em branco`).toBeGreaterThan(10);
      expect(texto, `${rota.path} caiu numa Error Boundary`).not.toMatch(
        /Algo deu errado|Something went wrong|Erro inesperado|Application error/i,
      );
      expect(texto, `${rota.path} ficou preso no fallback de carregamento`).not.toMatch(
        /^Carregando\.\.\.$/,
      );

      // Rota protegida não pode ter voltado pro login (sessão furada) nem ter
      // parado no seletor de cliente (acting tenant não aplicado).
      if (!rota.publica) {
        expect(page.url(), `${rota.path} redirecionou para o login`).not.toContain('/login');
        expect(texto, `${rota.path} parou no seletor de cliente`).not.toMatch(
          /Selecione um cliente/i,
        );
      }

      // Conteúdo esperado — prova que renderizou a tela CERTA, e não outra
      // qualquer que também não está em branco.
      if (rota.esperaTexto && !rota.redireciona) {
        expect(texto, `${rota.path} não mostrou o conteúdo esperado`).toMatch(rota.esperaTexto);
      }

      // ── 3. Nenhuma exceção JS não tratada ──────────────────────────────
      expect(
        coleta.erroFatal.map((e) => e.message),
        `${rota.path} lançou exceção não tratada`,
      ).toEqual([]);

      // ── 4. Nenhuma chamada de API com erro ─────────────────────────────
      expect(
        coleta.apiRuins.map((r) => `${r.status} ${r.url}`),
        `${rota.path} recebeu erro de API no carregamento`,
      ).toEqual([]);

      // Erros de console viram anexo, não falha: nem todo console.error é
      // defeito, e derrubar a varredura por causa deles esconderia os
      // problemas reais no meio do ruído.
      if (coleta.consoleErros.length) {
        await test.info().attach(`console-errors${rota.path.replace(/\//g, '_')}`, {
          body: coleta.consoleErros.join('\n'),
          contentType: 'text/plain',
        });
      }
    });
  }

  test(`${ROTA_INEXISTENTE} — rota inexistente cai no fallback`, async ({ page }) => {
    await prepararSessao(page);
    await page.goto(ROTA_INEXISTENTE, { waitUntil: 'commit' });
    await esperarRender(page);
    // App.tsx: path="*" manda pra /inbox.
    expect(page.url()).toContain('/inbox');
  });
});

/**
 * Guarda contra desvio: a tabela de rotas tem que continuar refletindo o
 * App.tsx. Sem isto, uma rota nova entraria no app sem nenhuma cobertura e a
 * suíte seguiria verde dizendo "100% das rotas".
 */
test('a tabela de rotas cobre todas as rotas declaradas no App.tsx', () => {
  const appTsx = readFileSync(resolve(AQUI, '../src/app/App.tsx'), 'utf8');
  const declaradas = [...appTsx.matchAll(/path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== '*');

  const cobertas = new Set(ROTAS.map((r) => r.path));
  const semCobertura = declaradas.filter((p) => !cobertas.has(p));

  expect(
    semCobertura,
    `Rotas no App.tsx sem entrada em e2e/routes.ts: ${semCobertura.join(', ')}`,
  ).toEqual([]);
});
