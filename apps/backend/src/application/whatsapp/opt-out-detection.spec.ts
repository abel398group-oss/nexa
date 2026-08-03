import { describe, it, expect } from 'vitest';
import { detectOptOut, isOptOutMessage } from './opt-out-detection';

// Caso real (2026-08-03): a Patrícia pediu para parar DUAS vezes, continuou
// recebendo, e só saiu da lista quando escreveu "não quero" — por acaso.
describe('detectOptOut — falsos NEGATIVOS que o `includes` deixava passar', () => {
  const pedidos = [
    'Para de ficar mandando msg que saco!',
    'Para de mandar msg',
    'pare de me mandar mensagem',
    'parem de enviar isso',
    'não me manda mais nada',
    'me tira dessa lista',
    'me remove por favor',
    'nao tenho interesse',
    'sem interesse, obrigado',
    'quero cancelar o recebimento',
    'chega de mensagens',
    'não me perturbe',
  ];

  for (const msg of pedidos) {
    it(`"${msg}" → opt-out`, () => {
      const r = detectOptOut(msg);
      expect(r.optOut).toBe(true);
      expect(r.reason).toBe('pedido');
    });
  }
});

// Hostilidade/ameaça também para o contato: insistir é risco jurídico.
describe('detectOptOut — hostilidade e ameaça', () => {
  const hostis = [
    'Vou processar esta empresa por perturbação',
    'vou chamar meu advogado',
    'isso é spam',
    'vou no procon',
    'vou denunciar vocês',
  ];

  for (const msg of hostis) {
    it(`"${msg}" → opt-out`, () => {
      expect(detectOptOut(msg).optOut).toBe(true);
    });
  }
});

// O `includes` antigo casava 'pare' dentro de "parece" e descadastrava um lead
// interessado. Perder lead quente por falso positivo é pior que o falso negativo.
describe('detectOptOut — falsos POSITIVOS que precisam continuar passando', () => {
  const normais = [
    'parece interessante, me conta mais',
    'pareceu bom o preço',
    'vou sair para almoçar e já volto',   // "sair" isolado ainda casa — ver nota
    'quero saber o valor',
    'me manda mais detalhes',
    'tenho interesse sim',
    'bom dia, tudo bem?',
    'quantos veículos preciso ter?',
  ];

  it('"parece interessante" NAO e opt-out (o bug do substring)', () => {
    expect(isOptOutMessage('parece interessante, me conta mais')).toBe(false);
  });
  it('"pareceu bom o preço" NAO e opt-out', () => {
    expect(isOptOutMessage('pareceu bom o preço')).toBe(false);
  });
  it('"me manda mais detalhes" NAO e opt-out (nao confundir com "nao me manda")', () => {
    expect(isOptOutMessage('me manda mais detalhes')).toBe(false);
  });
  it('"tenho interesse sim" NAO e opt-out (nao confundir com "sem interesse")', () => {
    expect(isOptOutMessage('tenho interesse sim')).toBe(false);
  });

  it('mensagens comuns de lead nao disparam opt-out', () => {
    for (const m of normais.filter((x) => !x.includes('sair'))) {
      expect(isOptOutMessage(m)).toBe(false);
    }
  });
});

describe('detectOptOut — palavra-chave do rodapé', () => {
  it('"SAIR" continua funcionando (é o que o rodapé LGPD instrui)', () => {
    expect(isOptOutMessage('SAIR')).toBe(true);
    expect(isOptOutMessage('sair')).toBe(true);
  });
  it('acento não atrapalha', () => {
    expect(isOptOutMessage('não quero receber')).toBe(true);
  });
  it('texto vazio não é opt-out', () => {
    expect(isOptOutMessage('')).toBe(false);
    expect(isOptOutMessage('   ')).toBe(false);
  });
});
