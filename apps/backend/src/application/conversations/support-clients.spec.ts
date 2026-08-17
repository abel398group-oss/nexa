import { describe, expect, it } from 'vitest';
import {
  cruzarChamadosPorEmpresa,
  juntarClientesComChamados,
  type ChamadoParaCruzar,
} from './support-clients';

const chamado = (p: Partial<ChamadoParaCruzar> = {}): ChamadoParaCruzar => ({
  externalId: 'pessoa-1',
  aberto: true,
  em: 1_000,
  ...p,
});

/**
 * A conversa de suporte guarda o id da PESSOA (`tenant_core_user.id`); a base de clientes
 * é de EMPRESAS (`system_core_tenant`). Este é o degrau entre os dois, e é o que faz a
 * tela "Clientes" deixar de ser "quem abriu chamado".
 */
describe('cruzamento de chamados por empresa', () => {
  const deQuem = new Map([
    ['pessoa-1', 'empresa-a'],
    ['pessoa-2', 'empresa-a'],
    ['pessoa-3', 'empresa-b'],
  ]);

  it('duas pessoas da mesma empresa somam na mesma empresa', () => {
    const { porEmpresa } = cruzarChamadosPorEmpresa(
      [chamado({ externalId: 'pessoa-1' }), chamado({ externalId: 'pessoa-2' })],
      deQuem,
    );
    expect(porEmpresa.get('empresa-a')).toEqual({ chamados: 2, abertos: 2, ultimoEm: 1_000 });
  });

  it('conta aberto e fechado separado', () => {
    const { porEmpresa } = cruzarChamadosPorEmpresa(
      [chamado({ aberto: true }), chamado({ aberto: false }), chamado({ aberto: false })],
      deQuem,
    );
    expect(porEmpresa.get('empresa-a')).toMatchObject({ chamados: 3, abertos: 1 });
  });

  it('guarda a atividade mais RECENTE, não a última lida', () => {
    const { porEmpresa } = cruzarChamadosPorEmpresa(
      [chamado({ em: 5_000 }), chamado({ em: 2_000 })],
      deQuem,
    );
    expect(porEmpresa.get('empresa-a')?.ultimoEm).toBe(5_000);
  });

  it('chamado sem id e de usuário removido são CONTADOS, não sumidos', () => {
    // Se sumissem, a soma por empresa ficaria menor que o total de chamados e a tela
    // pareceria estar perdendo atendimento.
    const { porEmpresa, semEmpresa } = cruzarChamadosPorEmpresa(
      [chamado({ externalId: null }), chamado({ externalId: 'quem-saiu' }), chamado()],
      deQuem,
    );
    expect(semEmpresa).toBe(2);
    expect(porEmpresa.size).toBe(1);
  });

  it('nada a cruzar não quebra', () => {
    expect(cruzarChamadosPorEmpresa([], deQuem)).toEqual({ porEmpresa: new Map(), semEmpresa: 0 });
  });
});

describe('junção com a base de clientes', () => {
  const base = [
    { id: 'empresa-a', name: 'Alfa Transportes', ativo: true },
    { id: 'empresa-b', name: 'Beta Cargas', ativo: true },
    { id: 'empresa-c', name: 'Gama Log', ativo: false },
  ];

  it('cliente que NUNCA abriu chamado aparece com zero — é o ponto da tela', () => {
    const r = juntarClientesComChamados(base, { porEmpresa: new Map(), semEmpresa: 0 });
    expect(r).toHaveLength(3);
    expect(r.every((c) => c.chamados === 0 && c.abertos === 0 && c.ultimoEm === null)).toBe(true);
  });

  it('quem tem chamado ABERTO sobe para o topo', () => {
    const r = juntarClientesComChamados(base, {
      porEmpresa: new Map([['empresa-c', { chamados: 1, abertos: 1, ultimoEm: 10 }]]),
      semEmpresa: 0,
    });
    expect(r[0].id).toBe('empresa-c');
  });

  it('sem aberto, ordena por atividade mais recente', () => {
    const r = juntarClientesComChamados(base, {
      porEmpresa: new Map([
        ['empresa-a', { chamados: 1, abertos: 0, ultimoEm: 100 }],
        ['empresa-b', { chamados: 1, abertos: 0, ultimoEm: 900 }],
      ]),
      semEmpresa: 0,
    });
    expect(r.map((c) => c.id)).toEqual(['empresa-b', 'empresa-a', 'empresa-c']);
  });

  it('empate total cai no nome, em português', () => {
    const r = juntarClientesComChamados(
      [
        { id: '1', name: 'Zeta', ativo: true },
        { id: '2', name: 'Ácido', ativo: true },
      ],
      { porEmpresa: new Map(), semEmpresa: 0 },
    );
    expect(r.map((c) => c.name)).toEqual(['Ácido', 'Zeta']);
  });

  it('empresa com chamado que não está na base não inventa linha', () => {
    // A BASE manda na lista. Chamado de empresa que saiu do TMS não recria a empresa.
    const r = juntarClientesComChamados(base, {
      porEmpresa: new Map([['empresa-fantasma', { chamados: 5, abertos: 5, ultimoEm: 1 }]]),
      semEmpresa: 0,
    });
    expect(r).toHaveLength(3);
    expect(r.some((c) => c.id === 'empresa-fantasma')).toBe(false);
  });
});
