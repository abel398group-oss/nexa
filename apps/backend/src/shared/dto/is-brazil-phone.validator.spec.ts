import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { IsBrazilPhone } from './is-brazil-phone.validator';

// Casos reais achados na caça a bugs de 11/08/2026: com `@MinLength(10)` no
// lugar deste validador, os dois primeiros criavam vendedor com telefone errado
// e devolviam 201.

class Alvo {
  @IsBrazilPhone()
  phone!: string;
  constructor(phone: any) { this.phone = phone; }
}

const erros = async (v: any) => {
  const r = await validate(new Alvo(v));
  return r.length ? Object.values(r[0].constraints ?? {}).join(' | ') : null;
};

describe('IsBrazilPhone', () => {
  describe('recusa o que virava registro errado', () => {
    it('dez letras — passavam no MinLength e viravam telefone VAZIO', async () => {
      const e = await erros('abcdefghij');
      expect(e).toBeTruthy();
      expect(e).toContain('apenas números');
    });

    it('emoji no meio — sumia e sobrava um número plausível com um dígito a menos', async () => {
      // "11999🚚8888" → dígitos "119998888" (9) → viraria 55119998888
      const e = await erros('11999🚚8888');
      expect(e).toBeTruthy();
      // a mensagem precisa dizer QUANTOS dígitos sobraram, senão quem digitou
      // não entende por que "o número certo" foi recusado
      expect(e).toContain('9 dígito');
    });
  });

  describe('recusa o resto do lixo', () => {
    it.each([
      ['vazio', ''],
      ['só espaços', '   '],
      ['curto demais', '1199'],
      ['só símbolos', '(--) ----'],
      ['longo demais', '5511999887766554433'],
      ['não é string', 12345678901 as any],
      ['nulo', null as any],
    ])('%s', async (_rotulo, valor) => {
      expect(await erros(valor)).toBeTruthy();
    });
  });

  describe('aceita o que é telefone de verdade', () => {
    it.each([
      ['celular com DDD', '11999887766'],
      ['celular com DDI', '5511999887766'],
      ['formatado', '+55 (11) 99988-7766'],
      ['fixo', '1133334444'],
    ])('%s', async (_rotulo, valor) => {
      expect(await erros(valor)).toBeNull();
    });
  });
});
