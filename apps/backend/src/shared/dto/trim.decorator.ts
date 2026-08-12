/**
 * `@Trim()` — remove espaços das pontas ANTES das validações de tamanho.
 *
 * Sem ele, `@MinLength(2)` conta os espaços: um nome de cinco espaços passa e
 * vira uma linha em branco na lista. Foi assim que "     " virou vendedor,
 * parceiro e item da base de conhecimento (achado em 11/08/2026).
 *
 * A ordem importa: o `class-transformer` roda antes do `class-validator`, então
 * declarar `@Trim()` acima dos decoradores de validação faz o mínimo/máximo
 * medirem o texto que realmente vai para o banco.
 */
import { Transform } from 'class-transformer';

export function Trim() {
  return Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
}

/** Teto padrão para nome/título curto — o suficiente para razão social longa. */
export const NOME_MAX = 120;
