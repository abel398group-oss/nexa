import type { Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CTX_FILE = resolve(AQUI, '.auth/context.json');

export const ctx = existsSync(CTX_FILE)
  ? (JSON.parse(readFileSync(CTX_FILE, 'utf8')) as { actingTenantId: string | null })
  : { actingTenantId: null };

/**
 * Reinjeta o cliente "em operação" antes de qualquer script da página.
 * storageState guarda cookie e localStorage, mas não sessionStorage — que é
 * onde o acting tenant vive. Sem isto, rota protegida mostra o seletor de
 * cliente em vez da tela.
 */
export async function prepararSessao(page: Page) {
  // O tour de boas-vindas (Layout.tsx) abre sozinho 800ms depois da carga
  // enquanto `nexa_tour_done` não existir no localStorage — e o contexto do
  // Playwright nasce limpo, então ele SEMPRE abriria. O overlay
  // (`fixed inset-0 z-[60] bg-black/50`) intercepta todo clique da página.
  //
  // Passou despercebido no smoke test porque lá só se lê texto; apareceu no
  // primeiro teste que clica de verdade. Marcar como visto é o equivalente a
  // "usuário que já conhece o sistema", que é o estado de quem opera o app.
  await page.addInitScript(() => window.localStorage.setItem('nexa_tour_done', '1'));

  if (!ctx.actingTenantId) return;
  await page.addInitScript(
    ([k, v]) => window.sessionStorage.setItem(k as string, v as string),
    ['nexa_acting_tenant', ctx.actingTenantId],
  );
}

/** Espera o app sair do esqueleto de carregamento. */
export async function esperarRender(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => {
      const t = document.body?.innerText?.trim() ?? '';
      return t.length > 0 && !/^Carregando\.\.\.$/.test(t);
    }, { timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
}

/** Navega já com sessão e conteúdo renderizado. */
export async function abrir(page: Page, rota: string) {
  await prepararSessao(page);
  await page.goto(rota, { waitUntil: 'commit' });
  await esperarRender(page);
}
