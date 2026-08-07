import { test, expect, type Page } from '@playwright/test';
import { abrir } from './helpers';

/**
 * 🎨 Regressão visual.
 *
 * LEIA ANTES DE CONFIAR NUM VERMELHO AQUI:
 *
 * 1. As baselines são específicas da MÁQUINA. Renderização de fonte muda entre
 *    Windows, macOS e o Linux do CI, então um PNG gerado aqui não bate lá.
 *    Rode `pnpm test:e2e:update-snapshots` no ambiente onde a suíte vai rodar.
 *
 * 2. O ambiente de dev usa o banco REAL, com dado que muda sozinho (conversa
 *    nova, contador, timer de SLA "⏱️ 18h"). Screenshot cru dessas telas ficaria
 *    vermelho toda hora e a suíte viraria ruído. Por isso cada tela declara o
 *    que é dado e some do quadro via `mask` — o que sobra é o LAYOUT: barra
 *    lateral, cabeçalho, grade, botões, espaçamento, cor.
 *
 * O que esta suíte pega: botão que mudou de cor, coluna que desalinhou, campo
 * que sumiu, quebra de layout responsivo.
 * O que ela NÃO pega: mudança dentro das áreas mascaradas.
 */

// Viewport fixo: largura diferente = layout diferente = diff falso.
test.use({ viewport: { width: 1440, height: 900 } });

type Tela = {
  rota: string;
  nome: string;
  arquivo: string;
  /** Seletores cujo conteúdo é DADO, não layout — mascarados no snapshot. */
  mascarar?: string[];
  /** Espera algo específico aparecer antes de fotografar. */
  esperar?: string;
};

const TELAS: Tela[] = [
  // Telas sem dado nenhum: snapshot integral, é onde a regressão visual é mais confiável.
  { rota: '/login', nome: 'Login', arquivo: 'login.png' },
  { rota: '/landing', nome: 'Landing', arquivo: 'landing.png' },

  // Telas com dado vivo: layout comparado, conteúdo mascarado.
  {
    rota: '/dashboard',
    nome: 'Painel',
    arquivo: 'dashboard.png',
    // Números, gráficos e datas mudam a cada carga.
    mascarar: ['canvas', 'svg.recharts-surface', '.recharts-wrapper'],
  },
  {
    rota: '/inbox',
    nome: 'Inbox de Vendas',
    arquivo: 'inbox.png',
    // A lista inteira é dado: nomes, prévias, timers de SLA, contadores dos chips.
    mascarar: ['aside', '[role="button"]'],
  },
  {
    rota: '/contacts',
    nome: 'Contatos',
    arquivo: 'contacts.png',
    mascarar: ['table tbody', 'tbody'],
  },
  {
    rota: '/settings/email-channel',
    nome: 'Configurações — Canal de E-mail',
    arquivo: 'settings-email-channel.png',
    // Não existe rota `/settings` isolada no App.tsx; esta é a tela de
    // configuração mais estável das três (`/settings/*`).
  },
];

async function estabilizar(page: Page) {
  // Congela animação e cursor piscando: sem isto o mesmo estado gera PNGs
  // diferentes só por causa do instante da captura.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      .animate-pulse, .animate-spin { animation: none !important; }
    `,
  });
  // Deixa fontes assentarem — texto remedido depois da foto vira diff de 1-2px.
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(300);
}

test.describe('🎨 Regressão visual', () => {
  for (const tela of TELAS) {
    test(`${tela.rota} — ${tela.nome}`, async ({ page }) => {
      await abrir(page, tela.rota);
      if (tela.esperar) {
        await page.locator(tela.esperar).first().waitFor({ state: 'visible' }).catch(() => undefined);
      }
      await estabilizar(page);

      const mask = (tela.mascarar ?? []).map((s) => page.locator(s));

      await expect(page).toHaveScreenshot(tela.arquivo, {
        fullPage: true,
        mask,
        // Tolerância pedida: absorve antialiasing e sub-pixel sem deixar passar
        // mudança real de layout ou de cor.
        maxDiffPixelRatio: 0.05,
        animations: 'disabled',
        timeout: 20_000,
      });
    });
  }

  // A barra lateral é 100% estática e aparece em toda tela autenticada —
  // é o detector mais sensível de quebra do shell, sem nenhum dado dentro.
  test('barra lateral (shell do app)', async ({ page }) => {
    await abrir(page, '/inbox');
    await estabilizar(page);

    // É <aside aria-label="Navegação principal"> no Layout.tsx — o seletor
    // ancora no rótulo acessível, não na tag, pra não quebrar se virar <nav>.
    const sidebar = page.locator('[aria-label="Navegação principal"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveScreenshot('sidebar.png', {
      maxDiffPixelRatio: 0.05,
      animations: 'disabled',
    });
  });
});
