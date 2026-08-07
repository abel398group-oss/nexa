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

/**
 * Cabeçalhos para chamar a API direto (limpeza de dados de teste).
 *
 * `x-acting-tenant-id`: o usuário da suíte é platform admin (tenantId null) e
 * sem isto toda rota devolve "Selecione um cliente".
 *
 * `x-acting-override`: a quebra de vidro. Ação irreversível em nome de um
 * cliente é bloqueada de propósito (EffectiveTenantInterceptor) — o que é
 * correto para uma pessoa clicando na tela, mas impede a suíte de apagar o que
 * ela mesma criou. Usar aqui é legítimo e deliberado: é limpeza de fixture,
 * nunca fluxo de produto. Nenhum teste de UI manda este cabeçalho.
 */
export function apiHeaders(destrutivo = false): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ctx.actingTenantId) h['x-acting-tenant-id'] = ctx.actingTenantId;
  if (destrutivo) h['x-acting-override'] = 'true';
  return h;
}

/** Prefixo de tudo que a suíte cria — permite varrer sobras depois. */
export const MARCA_E2E = 'E2E-AUTO';

/**
 * Apaga contatos criados pelos testes. Recebe o termo de busca; apaga só o que
 * casar com a marca, nunca dado de verdade.
 */
export async function limparContatos(
  request: { get: Function; delete: Function },
  termo: string = MARCA_E2E,
): Promise<number> {
  const r = await request.get(`/api/contacts?search=${encodeURIComponent(termo)}&limit=100`, {
    headers: apiHeaders(),
  });
  if (!r.ok()) return 0;
  const body = await r.json();
  const alvos = (body.items ?? []).filter(
    (c: any) => (c.name ?? '').includes(MARCA_E2E) || (c.company ?? '').includes(MARCA_E2E),
  );
  let apagados = 0;
  for (const c of alvos) {
    const d = await request.delete(`/api/contacts/${c.id}`, { headers: apiHeaders(true) });
    if (d.ok()) apagados++;
  }
  return apagados;
}
