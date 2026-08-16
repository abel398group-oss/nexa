import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { PERMS, GRANTABLE_PERMS, PERM_CATALOG, satisfazPerm, type Perm } from './perms';

/**
 * O guard não tinha teste nenhum, e ele é a única coisa entre um usuário e uma rota.
 *
 * O modo de falhar aqui é silencioso nos dois sentidos: permissão a mais não aparece na
 * tela de ninguém, e permissão a menos só aparece quando alguém liga reclamando que não
 * consegue trabalhar.
 */
function makeCtx(user: any, perm?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => 'h',
    getClass: () => 'c',
  } as any;
}
const reflector = (perm?: string) => ({ getAllAndOverride: () => perm }) as any;

describe('PermissionsGuard', () => {
  it('rota sem exigência passa', () => {
    const g = new PermissionsGuard(reflector(undefined));
    expect(g.canActivate(makeCtx(undefined))).toBe(true);
  });

  it('sem usuário é 403, mesmo com a rota exigindo algo comum', () => {
    const g = new PermissionsGuard(reflector('inbox'));
    expect(() => g.canActivate(makeCtx(undefined))).toThrow(ForbiddenException);
  });

  it('admin passa em qualquer permissão, inclusive sem lista nenhuma', () => {
    const g = new PermissionsGuard(reflector('webhooks:manage'));
    expect(g.canActivate(makeCtx({ role: 'admin', permissions: [] }))).toBe(true);
  });

  it('permissão concedida libera', () => {
    const g = new PermissionsGuard(reflector('campaigns'));
    expect(g.canActivate(makeCtx({ role: 'operacional', permissions: ['campaigns'] }))).toBe(true);
  });

  it('permissão ausente nega', () => {
    const g = new PermissionsGuard(reflector('campaigns'));
    expect(() => g.canActivate(makeCtx({ role: 'operacional', permissions: ['inbox'] })))
      .toThrow(/sem permissão: campaigns/);
  });
});

describe('PermissionsGuard — convivência com a permissão antiga', () => {
  // Sem isto, o deploy que separa sdr/closer tira a mesa de quem está trabalhando: o
  // token já emitido continua com `telemarketing` e o backfill não roda no mesmo instante.
  it('telemarketing ainda abre a mesa do SDR e o painel do closer', () => {
    const user = { role: 'operacional', permissions: ['telemarketing'] };
    expect(new PermissionsGuard(reflector('sdr')).canActivate(makeCtx(user))).toBe(true);
    expect(new PermissionsGuard(reflector('closer')).canActivate(makeCtx(user))).toBe(true);
  });

  it('sdr NÃO abre o painel do closer — é o ponto da separação', () => {
    const user = { role: 'operacional', permissions: ['sdr'] };
    expect(new PermissionsGuard(reflector('sdr')).canActivate(makeCtx(user))).toBe(true);
    expect(() => new PermissionsGuard(reflector('closer')).canActivate(makeCtx(user)))
      .toThrow(ForbiddenException);
  });

  it('closer NÃO abre a mesa do SDR', () => {
    const user = { role: 'operacional', permissions: ['closer'] };
    expect(() => new PermissionsGuard(reflector('sdr')).canActivate(makeCtx(user)))
      .toThrow(ForbiddenException);
  });

  it('acumular as duas continua possível — time pequeno faz os dois papéis', () => {
    const user = { role: 'operacional', permissions: ['sdr', 'closer'] };
    expect(new PermissionsGuard(reflector('sdr')).canActivate(makeCtx(user))).toBe(true);
    expect(new PermissionsGuard(reflector('closer')).canActivate(makeCtx(user))).toBe(true);
  });

  it('a ponte é de mão única: sdr não vira telemarketing', () => {
    const user = { role: 'operacional', permissions: ['sdr'] };
    expect(() => new PermissionsGuard(reflector('telemarketing')).canActivate(makeCtx(user)))
      .toThrow(ForbiddenException);
  });
});

describe('Catálogo de permissões', () => {
  it('admin existe como exigível mas NÃO é concedível por checkbox', () => {
    expect(PERMS).toContain('admin');
    expect(GRANTABLE_PERMS).not.toContain('admin' as Perm);
  });

  it('todo item do catálogo é uma permissão real', () => {
    for (const item of PERM_CATALOG) expect(PERMS).toContain(item.id);
  });

  it('toda permissão concedível aparece no catálogo — senão some da tela', () => {
    const noCatalogo = new Set(PERM_CATALOG.map((i) => i.id));
    for (const p of GRANTABLE_PERMS) expect(noCatalogo.has(p)).toBe(true);
  });

  // O alias vale para abrir tela. A leitura de nota interna NÃO passa por aqui de
  // propósito (ver conversations.controller.ts): `vendedor` tem `inbox` de fábrica.
  it('inbox satisfaz support para efeito de rota', () => {
    expect(satisfazPerm(['inbox'], 'support')).toBe(true);
    expect(satisfazPerm([], 'support')).toBe(false);
  });
});
