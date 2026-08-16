import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PERMS } from './perms';

/**
 * Varre o código em busca de `@RequirePerm(...)` e confere contra o catálogo.
 *
 * O tipo `Perm` já protege código novo, mas só em tempo de compilação e só quem não
 * escapou com `as any`. Este teste protege o outro lado: a permissão que EXISTE numa rota
 * e sumiu da lista concedível vira admin-only sem ninguém decidir — foi exatamente assim
 * que `settings`, `webhooks:manage` e `admin` ficaram inalcançáveis por qualquer tela,
 * trancando configuração de mercado e roteiro do SDR.
 */
const SRC = path.resolve(__dirname, '../..');

function arquivosTs(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivosTs(p, acc);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) acc.push(p);
  }
  return acc;
}

describe('@RequirePerm — cobertura contra o catálogo', () => {
  const usadas = new Map<string, string[]>();
  for (const f of arquivosTs(SRC)) {
    const txt = fs.readFileSync(f, 'utf8');
    // O decorator aceita mais de uma permissão: `@RequirePerm('campaigns', 'settings')`.
    // Capturar só a primeira deixaria a segunda fora da conferência — e é justamente
    // uma permissão a menos na lista que torna a rota inalcançável por qualquer tela.
    for (const m of txt.matchAll(/@RequirePerm\(([^)]+)\)/g)) {
      const rel = path.relative(SRC, f).replace(/\\/g, '/');
      for (const q of m[1].matchAll(/'([^']+)'/g)) {
        usadas.set(q[1], [...(usadas.get(q[1]) ?? []), rel]);
      }
    }
  }

  it('encontra decorators (se zerar, a varredura quebrou e o teste vira placebo)', () => {
    expect(usadas.size).toBeGreaterThan(5);
  });

  it('toda permissão exigida por rota existe no catálogo', () => {
    const orfas = [...usadas.entries()].filter(([p]) => !(PERMS as readonly string[]).includes(p));
    expect(orfas.map(([p, f]) => `${p} (${f[0]})`)).toEqual([]);
  });

  it('telemarketing não é mais exigida por rota — foi separada em sdr/closer', () => {
    expect(usadas.get('telemarketing')).toBeUndefined();
  });
});
