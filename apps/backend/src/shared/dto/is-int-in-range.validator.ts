/**
 * @IsIntInRange(min, max) — inteiro dentro de uma faixa, com UMA mensagem que
 * corresponde ao que aconteceu.
 *
 * ## Por que existe
 *
 * `@Type(() => Number) @IsInt() @Min(1) @Max(5000)` parece certo e é o padrão,
 * mas com entrada não numérica o `Type` produz `NaN` — e aí os TRÊS validadores
 * falham juntos, porque toda comparação com NaN é falsa. Medido em 13/08/2026,
 * `?limit=abc` respondia:
 *
 *     [ "limit não pode ser maior que 5000",
 *       "limit não pode ser menor que 1",
 *       "limit deve ser um número inteiro" ]
 *
 * As duas primeiras não podem ser verdade ao mesmo tempo, e nenhuma descreve o
 * problema. A frase correta existia, mas em último — e quem mostra só a primeira
 * (um toast, ou o proxy do TMS, que exibe o array como texto) mostra uma
 * afirmação falsa. Ver validation-messages.pt.ts.
 *
 * Aqui a checagem é uma só, então a mensagem é uma só, e ela diz qual dos casos
 * ocorreu: não é número, tem casa decimal, está abaixo, ou está acima.
 *
 * Continua funcionando junto do `@Type(() => Number)` do DTO: `NaN` cai no ramo
 * "não é número".
 */
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function IsIntInRange(min: number, max: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIntInRange',
      target: object.constructor,
      propertyName,
      constraints: [min, max],
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
        },
        defaultMessage(args: ValidationArguments): string {
          const [piso, teto] = args.constraints as [number, number];
          const valor = args.value;
          const campo = args.property;

          // Sem teto de verdade (offset), imprimir MAX_SAFE_INTEGER só assusta.
          const semTeto = teto >= Number.MAX_SAFE_INTEGER;

          if (typeof valor !== 'number' || !Number.isFinite(valor)) {
            return semTeto
              ? `${campo} deve ser um número inteiro a partir de ${piso}.`
              : `${campo} deve ser um número inteiro entre ${piso} e ${teto}.`;
          }
          if (!Number.isInteger(valor)) {
            return `${campo} deve ser um número inteiro (sem casas decimais).`;
          }
          if (valor < piso) return `${campo} deve ser no mínimo ${piso}.`;
          return semTeto
            ? `${campo} deve ser um número inteiro a partir de ${piso}.`
            : `${campo} deve ser no máximo ${teto}.`;
        },
      },
    });
  };
}
