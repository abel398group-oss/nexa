import { describe, expect, it } from 'vitest';
import { abertura, cancelado, naoEntendi, pergunta, recusado, resultado } from './quote-messages';
import type { EstadoCotacao } from './quote-flow';

const CAMPINAS = { code: '1', name: 'Campinas', state: 'SP' };
const BH = { code: '2', name: 'Belo Horizonte', state: 'MG' };

const estado = (p: Partial<EstadoCotacao>): EstadoCotacao => ({
  etapa: 'origem',
  tentativas: 0,
  ...p,
});

describe('perguntas', () => {
  it('a abertura diz quantas perguntas são e como sair', () => {
    const t = abertura();
    expect(t).toContain('5 ou 6 perguntas');
    expect(t).toContain('*sair*');
    expect(t).toContain('1/5');
  });

  it('cada pergunta numera o passo — sem isso a pessoa acha que não acaba', () => {
    expect(pergunta(estado({ etapa: 'origem' }))).toContain('1/5');
    expect(pergunta(estado({ etapa: 'destino', origem: CAMPINAS }))).toContain('2/5');
    expect(pergunta(estado({ etapa: 'modalidade', destino: BH }))).toContain('3/5');
    // Dedicado tem 6 perguntas: veiculo e carga entram no caminho dele.
    expect(pergunta(estado({ etapa: 'veiculo' }))).toContain('4/6');
    expect(pergunta(estado({ etapa: 'carga', opcoesCarga: ['A', 'B'] }))).toContain('5/6');
    expect(pergunta(estado({ etapa: 'peso' }))).toContain('4/5');
    expect(pergunta(estado({ etapa: 'valor' }))).toContain('5/5');
    expect(pergunta(estado({ etapa: 'valor', modalidade: 'dedicado' }))).toContain('6/6');
  });

  it('O ECO: a pergunta seguinte mostra a cidade que ficou gravada', () => {
    // É a última trava contra cidade errada virar preço.
    expect(pergunta(estado({ etapa: 'destino', origem: CAMPINAS }))).toContain('Campinas/SP');
    expect(pergunta(estado({ etapa: 'modalidade', destino: BH }))).toContain('Belo Horizonte/MG');
  });

  it('o menu de cidade numera as opções', () => {
    const t = pergunta(estado({ etapa: 'escolher_origem', opcoes: [CAMPINAS, BH] }));
    expect(t).toContain('*1* Campinas/SP');
    expect(t).toContain('*2* Belo Horizonte/MG');
  });

  it('cada pergunta traz exemplo — é o que substitui o manual no início', () => {
    expect(pergunta(estado({ etapa: 'origem' }))).toContain('exemplo:');
    expect(pergunta(estado({ etapa: 'valor' }))).toContain('exemplo:');
  });
});

describe('erro', () => {
  it('a segunda tentativa NÃO repete a pergunta — dá a dica que faltou', () => {
    const t = naoEntendi(estado({ etapa: 'origem' }), false);
    expect(t).toContain('com o estado');
    expect(t).not.toContain('1/5');
  });

  it('na desistência, entrega para humano em vez de insistir', () => {
    const t = naoEntendi(estado({ etapa: 'origem' }), true);
    expect(t.toLowerCase()).toContain('time');
  });

  it('o erro do valor avisa que por extenso não vale', () => {
    expect(naoEntendi(estado({ etapa: 'valor' }), false)).toContain('80 mil');
  });
});

describe('resultado', () => {
  const pronto = estado({
    etapa: 'pronto',
    origem: CAMPINAS,
    destino: BH,
    modalidade: 'dedicado',
    veiculo: 'carreta',
    valorMercadoria: 80000,
  });

  it('mostra rota, valor em reais e o rascunho', () => {
    const t = resultado(pronto, { valor: 5200, pisoAntt: 3800, distanciaKm: 586, rascunhoId: '1234' });
    expect(t).toContain('Campinas/SP → Belo Horizonte/MG');
    expect(t).toContain('586 km');
    expect(t).toContain('#1234');
    expect(t.replace(/ /g, ' ')).toContain('R$ 5.200,00');
  });

  it('diz que é referência — o número já vira preço na cabeça de quem lê', () => {
    expect(resultado(pronto, { valor: 5200 })).toContain('referência');
  });

  it('sem piso e sem rascunho, não imprime linha vazia no lugar', () => {
    const t = resultado(pronto, { valor: 5200 });
    expect(t).not.toContain('Piso ANTT');
    expect(t).not.toContain('Rascunho');
  });

  it('fracionado mostra o peso no lugar do veículo', () => {
    const t = resultado(
      estado({ etapa: 'pronto', origem: CAMPINAS, destino: BH, modalidade: 'fracionado', pesoKg: 500 }),
      { valor: 900 },
    );
    expect(t).toContain('Fracionado');
    expect(t).toContain('500 kg');
  });
});

describe('recusa do TMS', () => {
  it('permissão e cota têm frases DIFERENTES', () => {
    // A mesma frase para os dois faria quem estourou a cota pedir permissão que já tem.
    expect(recusado('sem_permissao')).not.toBe(recusado('cota_estourada'));
    expect(recusado('sem_permissao')).toContain('liberado');
    expect(recusado('cota_estourada')).toContain('limite');
  });
});

describe('cancelamento', () => {
  it('diz como recomeçar', () => {
    expect(cancelado()).toContain('*cotar*');
  });
});
