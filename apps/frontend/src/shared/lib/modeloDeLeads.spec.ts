import { describe, expect, it } from 'vitest';
import { CSV_MODELO } from './modeloDeLeads';

/**
 * O modelo que a tela oferece precisa ser aceito pela peneira que roda na
 * importação. Um modelo que o próprio sistema recusa é a pior ajuda possível:
 * quem baixa confia nele, sobe, e leva o erro de volta.
 *
 * O parser vive no backend, então aqui se afirma o CONTRATO que ele espera —
 * cabeçalho, separador e o fato de as linhas serem propositalmente incompletas.
 * A prova ponta a ponta é `lead-csv.spec.ts`, do outro lado.
 */
describe('modelo de lista de leads', () => {
  const linhas = CSV_MODELO.trim().split(/\r?\n/);

  it('tem o cabeçalho que o importador reconhece', () => {
    expect(linhas[0]).toBe('nome;empresa;telefone;email;frota');
  });

  it('usa ponto-e-vírgula — é o separador do Excel brasileiro', () => {
    linhas.forEach((l) => expect(l.split(';')).toHaveLength(5));
  });

  // O ponto do modelo. Cinco linhas completas ensinariam que a lista precisa
  // estar cheia, e quem tem a planilha furada deixaria de subir.
  it('mostra que lista incompleta entra', () => {
    const dados = linhas.slice(1).map((l) => l.split(';'));
    const [nome, empresa, telefone, email] = [0, 1, 2, 3];

    expect(dados.some((c) => !c[nome])).toBe(true);
    expect(dados.some((c) => !c[empresa])).toBe(true);
    expect(dados.some((c) => !c[telefone])).toBe(true);
    expect(dados.some((c) => !c[email])).toBe(true);
  });

  // Um canal basta, mas nenhum canal não: linha sem telefone E sem e-mail seria
  // descartada pela peneira, e o modelo estaria ensinando a errar.
  it('toda linha tem pelo menos um canal', () => {
    linhas.slice(1).forEach((l) => {
      const c = l.split(';');
      expect(!!c[2] || !!c[3]).toBe(true);
    });
  });

  it('não leva contato real — modelo compartilhado vira vazamento', () => {
    expect(CSV_MODELO).not.toMatch(/@(hipertms|hipervias)\.com\.br/i);
  });
});
