import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SENDER_DEFAULTS } from './sender.service';

/**
 * `SENDER_DEFAULTS` descreve, na tela de Saúde dos números, uma linha de WhatsApp que
 * foi pareada mas ainda não enviou nada — o registro no banco só nasce no primeiro
 * envio. Se o schema mudar um default e esta constante ficar para trás, a tela passa a
 * exibir o teto errado de um chip novo, que é exatamente onde errar custa banimento.
 *
 * Por isso o teste lê o `schema.prisma` como texto: é a única fonte que manda de
 * verdade, e comparar com ela é o que transforma a duplicação em duplicação vigiada.
 */
describe('defaults do SenderNumber', () => {
  const schema = readFileSync(
    join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );
  const modelo = schema.slice(
    schema.indexOf('model SenderNumber {'),
    schema.indexOf('@@map("sender_numbers")'),
  );

  const defaultDe = (campo: string): number => {
    const m = modelo.match(new RegExp(`^\\s*${campo}\\s+Int\\s+@default\\((\\d+)\\)`, 'm'));
    if (!m) throw new Error(`campo ${campo} não encontrado no model SenderNumber`);
    return Number(m[1]);
  };

  it('o modelo foi localizado no schema (senão o teste passaria vazio)', () => {
    expect(modelo).toContain('warmup_stage');
  });

  it.each(['dailyLimit', 'hourlyLimit', 'warmupStage'] as const)(
    '%s bate com o @default do schema',
    (campo) => {
      expect(SENDER_DEFAULTS[campo]).toBe(defaultDe(campo));
    },
  );
});
