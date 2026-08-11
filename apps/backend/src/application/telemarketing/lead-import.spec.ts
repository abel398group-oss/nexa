import { describe, expect, it } from 'vitest';
import {
  CAMPOS_PROTEGIDOS,
  contarLote,
  estaVazio,
  podeForcar,
  preencherSemSobrescrever,
  violaProtecao,
} from './lead-import';

describe('R2 — a importação nunca sobrescreve o que a Lia coletou', () => {
  // Um teste por campo protegido: é a assertion crítica da feature, e uma
  // asserção genérica esconderia justamente o campo que alguém esquecer.
  for (const campo of CAMPOS_PROTEGIDOS) {
    it(`não sobrescreve \`${campo}\` quando já tem dado`, () => {
      const atual = {
        name: 'Carlos Mendes',
        company: 'Transportes Silva',
        fleetSize: 12,
        interestScore: 70,
        leadStatus: 'hot',
      };
      const daPlanilha = { [campo]: 'valor da planilha' } as Partial<typeof atual>;

      expect(preencherSemSobrescrever(atual, daPlanilha)).toEqual({});
      expect(violaProtecao(atual, daPlanilha)).toEqual([campo]);
    });
  }

  it('preenche o campo que está vazio', () => {
    const atual = { name: 'Carlos', company: null, fleetSize: null };
    const delta = preencherSemSobrescrever(atual, {
      name: 'Carlos Mendes',
      company: 'Transportes Silva',
      fleetSize: 12,
    });

    // `name` já tinha dado, mesmo mais curto — planilha não melhora dado existente.
    expect(delta).toEqual({ company: 'Transportes Silva', fleetSize: 12 });
  });

  it('planilha com coluna em branco não apaga nada', () => {
    const atual = { name: 'Carlos', company: 'Silva', fleetSize: 12 };
    const delta = preencherSemSobrescrever(atual, {
      name: '',
      company: '   ',
      fleetSize: null as unknown as number,
    });

    expect(delta).toEqual({});
  });

  it('interestScore 0 é pontuação, não campo vazio', () => {
    // O bug que `!valor` produziria: a Lia pontuou 0 e a planilha sobrescreveria.
    const atual = { interestScore: 0 };
    expect(estaVazio(atual.interestScore)).toBe(false);
    expect(preencherSemSobrescrever(atual, { interestScore: 50 })).toEqual({});
  });

  it('não considera a origem do dado — só se está vazio', () => {
    // nameSource='pushname' é dado fraco, mas continua sendo dado. A regra não abre
    // exceção por origem: exceção por origem é onde o bug entra depois.
    const atual = { name: 'Carlos', nameSource: 'pushname' };
    expect(preencherSemSobrescrever(atual, { name: 'CARLOS MENDES LTDA' })).toEqual({});
  });
});

describe('override da peneira', () => {
  it('só "já na base" pode ser forçado', () => {
    expect(podeForcar('ja_na_base')).toBe(true);
  });

  it.each(['opt_out', 'email_invalido', 'cliente', 'concorrente'] as const)(
    'não deixa forçar %s',
    (motivo) => {
      expect(podeForcar(motivo)).toBe(false);
    },
  );
});

describe('contadores do lote', () => {
  it('separa duplicado de inválido e conta os sem nome', () => {
    const c = contarLote([
      { descarte: null, temNome: true },
      { descarte: null, temNome: false },
      { descarte: null, temNome: false },
      { descarte: 'duplicado', temNome: true },
      { descarte: 'telefone_invalido', temNome: true },
      { descarte: 'email_invalido', temNome: true },
      { descarte: 'opt_out', temNome: true },
    ]);

    expect(c).toMatchObject({
      received: 7,
      valid: 3,
      noName: 2,
      duplicate: 1,
      invalid: 2, // telefone + e-mail
    });
    expect(c.porMotivo).toEqual({
      duplicado: 1,
      telefone_invalido: 1,
      email_invalido: 1,
      opt_out: 1,
    });
  });

  it('lote vazio não divide por zero em lugar nenhum', () => {
    expect(contarLote([])).toMatchObject({ received: 0, valid: 0, noName: 0 });
  });

  it('conta quem entrou com lixo no telefone', () => {
    // Entra porque o e-mail vale, mas o SDR não vai poder ligar — e isso precisa aparecer
    // ANTES da importação, não na fila dele.
    const c = contarLote([
      { descarte: null, temNome: true, foneInvalido: true },
      { descarte: null, temNome: true },
      { descarte: 'duplicado', temNome: true, foneInvalido: true }, // descartado não conta
    ]);
    expect(c.foneLixo).toBe(1);
    expect(c.valid).toBe(2);
  });

  it('descartado não conta como sem nome', () => {
    // Senão o aviso "120 leads sem nome" incluiria gente que nem entrou.
    const c = contarLote([{ descarte: 'opt_out', temNome: false }]);
    expect(c.noName).toBe(0);
  });
});
