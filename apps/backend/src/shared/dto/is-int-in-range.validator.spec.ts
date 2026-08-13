import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto } from './pagination.dto';

/**
 * Medido em 13/08/2026: `?limit=abc` respondia três mensagens, e as duas
 * primeiras eram falsas e contraditórias — "não pode ser maior que 5000" junto
 * de "não pode ser menor que 1". O `@Type(() => Number)` transforma "abc" em
 * NaN, e toda comparação com NaN é falsa, então `@Min` e `@Max` disparavam
 * junto com o `@IsInt`. A frase correta existia, mas em último; quem mostra só
 * a primeira mostrava uma mentira.
 */
async function erros(query: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(PaginationQueryDto, query);
  const r = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return r.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('PaginationQueryDto — limit', () => {
  it('texto no lugar do número: UMA mensagem, e ela é verdadeira', async () => {
    const e = await erros({ limit: 'abc' });
    expect(e).toHaveLength(1);
    expect(e[0]).toBe('limit deve ser um número inteiro entre 1 e 5000.');
  });

  // O ponto do conserto: nenhuma frase de faixa pode sair quando o valor não é
  // número. Eram justamente essas que apareciam primeiro.
  it('texto no lugar do número: não fala em maior nem menor', async () => {
    const e = (await erros({ limit: 'abc' })).join(' ');
    expect(e).not.toContain('maior');
    expect(e).not.toContain('menor');
  });

  it.each([
    [0, 'limit deve ser no mínimo 1.'],
    [-5, 'limit deve ser no mínimo 1.'],
    [99999, 'limit deve ser no máximo 5000.'],
    [1.5, 'limit deve ser um número inteiro (sem casas decimais).'],
  ])('limit=%s → %s', async (v, esperado) => {
    expect(await erros({ limit: v })).toEqual([esperado]);
  });

  it.each([1, 50, 5000])('limit=%i continua válido', async (v) => {
    expect(await erros({ limit: v })).toEqual([]);
  });

  it('limit em string numérica continua funcionando (query string é texto)', async () => {
    expect(await erros({ limit: '50' })).toEqual([]);
  });

  it('sem limit: usa o default e não reclama', async () => {
    expect(await erros({})).toEqual([]);
    expect(plainToInstance(PaginationQueryDto, {}).limit).toBe(50);
  });
});

describe('PaginationQueryDto — offset', () => {
  it('texto: uma mensagem, sem citar um teto que não existe', async () => {
    const e = await erros({ offset: 'abc' });
    expect(e).toEqual(['offset deve ser um número inteiro a partir de 0.']);
    expect(e[0]).not.toContain('9007199254740991');
  });

  it('negativo é recusado', async () => {
    expect(await erros({ offset: -3 })).toEqual(['offset deve ser no mínimo 0.']);
  });

  it.each([0, 10, 999999])('offset=%i continua válido', async (v) => {
    expect(await erros({ offset: v })).toEqual([]);
  });
});

describe('PaginationQueryDto — search', () => {
  it('busca continua aceitando texto livre', async () => {
    expect(await erros({ search: 'transportadora' })).toEqual([]);
  });

  it('campo não declarado continua sendo recusado', async () => {
    expect((await erros({ hackeado: true })).join(' ')).toContain('hackeado');
  });
});
