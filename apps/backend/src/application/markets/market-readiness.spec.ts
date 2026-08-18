import { describe, it, expect } from 'vitest';
import { avaliarMercado, MIN_CONHECIMENTO, type MarketCounts } from './market-readiness';

// A trava existe para impedir um clique distraído de soltar a Lia falando de um produto
// que ela não conhece, com um parceiro assistindo. Ver ADR 037.

const PRONTO: MarketCounts = {
  conhecimentoUtil: 12,
  conhecimentoSemFonte: 0,
  modelos: 2,
  vendedores: 2,
  temIdentidade: true,
};

const campos = (c: MarketCounts) => avaliarMercado(c).pendencias.map((p) => p.campo);

describe('avaliarMercado — quando libera', () => {
  it('mercado completo está pronto', () => {
    expect(avaliarMercado(PRONTO)).toEqual({ pronto: true, pendencias: [], counts: PRONTO });
  });

  it('exatamente no mínimo de conhecimento já passa', () => {
    expect(avaliarMercado({ ...PRONTO, conhecimentoUtil: MIN_CONHECIMENTO }).pronto).toBe(true);
  });
});

describe('avaliarMercado — o que bloqueia', () => {
  it('sem identidade', () => {
    const r = avaliarMercado({ ...PRONTO, temIdentidade: false });
    expect(r.pronto).toBe(false);
    expect(campos({ ...PRONTO, temIdentidade: false })).toContain('identidade');
  });

  it('sem conhecimento nenhum — e o motivo diz o problema real', () => {
    const r = avaliarMercado({ ...PRONTO, conhecimentoUtil: 0 });
    expect(r.pronto).toBe(false);
    expect(r.pendencias[0].motivo).toMatch(/não tem o que responder/i);
  });

  it('conhecimento abaixo do mínimo mostra o quanto falta', () => {
    const r = avaliarMercado({ ...PRONTO, conhecimentoUtil: 1 });
    expect(r.pronto).toBe(false);
    expect(r.pendencias[0].motivo).toContain(`1 de ${MIN_CONHECIMENTO}`);
  });

  it('sem modelo de mensagem', () => {
    expect(avaliarMercado({ ...PRONTO, modelos: 0 }).pronto).toBe(false);
    expect(campos({ ...PRONTO, modelos: 0 })).toContain('modelos');
  });

  it('sem vendedor ativo', () => {
    expect(avaliarMercado({ ...PRONTO, vendedores: 0 }).pronto).toBe(false);
    expect(campos({ ...PRONTO, vendedores: 0 })).toContain('vendedores');
  });

  it('mercado vazio lista TODAS as pendências, não só a primeira', () => {
    const vazio: MarketCounts = {
      conhecimentoUtil: 0, conhecimentoSemFonte: 0, modelos: 0, vendedores: 0, temIdentidade: false,
    };
    expect(campos(vazio)).toEqual(['identidade', 'conhecimento', 'modelos', 'vendedores']);
  });
});

describe('avaliarMercado — número sem fonte avisa, não bloqueia', () => {
  // Estatística inventada não impede o mercado de existir. Mas quem libera precisa
  // saber que está lá — senão descobre quando a Lia repetir para o lead do parceiro.
  it('não impede a liberação', () => {
    const r = avaliarMercado({ ...PRONTO, conhecimentoSemFonte: 4 });
    expect(r.pronto).toBe(true);
    expect(r.pendencias).toHaveLength(1);
    expect(r.pendencias[0].bloqueia).toBe(false);
  });

  it('diz quantos são', () => {
    const r = avaliarMercado({ ...PRONTO, conhecimentoSemFonte: 4 });
    expect(r.pendencias[0].motivo).toContain('4 fato(s)');
  });

  // O artigo pendente de fonte não pode ser contado como conhecimento útil: senão um
  // mercado inteiro feito de estatística inventada passaria na trava.
  it('mercado só com fatos sem fonte NÃO libera', () => {
    const r = avaliarMercado({ ...PRONTO, conhecimentoUtil: 0, conhecimentoSemFonte: 20 });
    expect(r.pronto).toBe(false);
    expect(r.pendencias.some((p) => p.campo === 'conhecimento' && p.bloqueia)).toBe(true);
  });
});
