import { describe, it, expect, afterEach } from 'vitest';
import { lowVariationWarning, spinVariants } from './spintax';

// `spin()` devolve o texto intacto quando não há `{a|b}` — retrocompatibilidade
// desejada, mas que faz uma campanha com template plano sair byte a byte igual
// em silêncio. `spinVariants` já existia e nunca era chamada por ninguém.

const envAnterior = { ...process.env };
afterEach(() => {
  process.env = { ...envAnterior };
});

const PLANO = 'Oi {{nome}}, tudo bem? Conhece o HiperTMS?';
const VARIADO = '{Oi|Olá|Opa} {{nome}}, {tudo bem|como vai|beleza}? {Conhece|Já ouviu falar d}o HiperTMS?';

describe('lowVariationWarning', () => {
  it('lista pequena não gera aviso, mesmo com texto plano', () => {
    // 20 mensagens iguais não formam padrão detectável — o aviso seria só ruído
    expect(lowVariationWarning(PLANO, 5)).toBeNull();
    expect(lowVariationWarning(PLANO, 19)).toBeNull();
  });

  it('texto plano em lista grande avisa, dizendo quantos recebem igual', () => {
    const aviso = lowVariationWarning(PLANO, 500);

    expect(aviso).toContain('500');
    expect(aviso).toContain('EXATAMENTE igual');
    // o aviso precisa ensinar a resolver, não só apontar o problema
    expect(aviso).toContain('{opção1|opção2|opção3}');
  });

  it('variação insuficiente para o tamanho da lista avisa com a taxa de repeticao', () => {
    // 18 variantes para 900 destinatários = ~50 repetições de cada texto
    expect(spinVariants(VARIADO)).toBe(18);
    const aviso = lowVariationWarning(VARIADO, 900);

    expect(aviso).toContain('18 variações');
    expect(aviso).toContain('~50x');
  });

  it('variação suficiente não gera aviso', () => {
    // 18 variantes para 100 destinatários = ~6 repetições, abaixo do limite
    expect(lowVariationWarning(VARIADO, 100)).toBeNull();
  });

  it('template vazio conta como uma variante só', () => {
    expect(lowVariationWarning('', 500)).toContain('EXATAMENTE igual');
  });

  it('baixar o piso de destinatarios faz uma lista pequena avisar', () => {
    expect(lowVariationWarning(PLANO, 6)).toBeNull();

    process.env.SPINTAX_WARN_MIN_RECIPIENTS = '5';
    process.env.SPINTAX_WARN_MAX_REPEAT = '2';

    expect(lowVariationWarning(PLANO, 6)).toContain('EXATAMENTE igual');
  });

  it('afrouxar a taxa de repeticao cala o aviso', () => {
    expect(lowVariationWarning(PLANO, 500)).not.toBeNull();

    process.env.SPINTAX_WARN_MAX_REPEAT = '9999';

    expect(lowVariationWarning(PLANO, 500)).toBeNull();
  });
});
