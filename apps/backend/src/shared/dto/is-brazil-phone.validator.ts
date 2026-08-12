/**
 * @IsBrazilPhone — valida telefone brasileiro no BOUNDARY (DTO), não depois.
 *
 * ## Por que existe
 *
 * Os DTOs validavam telefone só por COMPRIMENTO (`@MinLength(10)`), e o
 * `normalizePhone()` roda depois, no service. A combinação deixava passar duas
 * coisas que viraram registro errado no banco (achadas em 11/08/2026):
 *
 * - `"abcdefghij"` — dez letras passam no `@MinLength(10)`; o normalize remove
 *   tudo que não é dígito e grava telefone VAZIO. O vendedor existe na lista e
 *   nunca recebe handoff.
 * - `"11999🚚8888"` — o emoji some no normalize e sobra `55119998888`, com um
 *   dígito a MENOS. O resultado tem cara de celular válido, ninguém percebe, e
 *   o lead quente vai para um desconhecido.
 *
 * O segundo é o perigoso: falhar calado com um número plausível é pior do que
 * falhar. Por isso a validação usa o número JÁ NORMALIZADO — é ele que vai para
 * o banco, e é ele que precisa fazer sentido.
 *
 * Aceita fixo (12 dígitos) além de celular (13). Para exigir celular de
 * verdade — com DDD da Anatel e 9º dígito — existe `canReceiveCampaign`
 * (application/sender/phone-eligibility.ts), usado no disparo.
 */
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { isValidBrazilPhone, normalizePhone } from '@/shared/utils/phone.util';

export function IsBrazilPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBrazilPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return isValidBrazilPhone(value);
        },
        defaultMessage(args: ValidationArguments): string {
          const bruto = typeof args.value === 'string' ? args.value : '';
          const digitos = normalizePhone(bruto).replace(/^55/, '');
          // A mensagem diz o que sobrou dos dígitos: sem isso, quem digitou um
          // emoji no meio do número não entende por que "o número está certo"
          // foi recusado.
          if (!digitos) {
            return 'Telefone inválido: informe apenas números, com DDD (ex.: 11999887766).';
          }
          return `Telefone inválido: sobraram ${digitos.length} dígito(s) ("${digitos}"). ` +
            'Informe DDD + número, só com dígitos (ex.: 11999887766).';
        },
      },
    });
  };
}
