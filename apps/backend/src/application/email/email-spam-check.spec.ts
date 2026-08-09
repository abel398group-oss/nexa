import { describe, it, expect } from 'vitest';
import { avisosDeSpam, encurtadoresEncontrados, dominiosDosLinks } from './email-spam-check';

/**
 * Antes disto o cabeçalho do worker prometia bloquear "MAIÚSCULAS excessivas,
 * pontuação excessiva ou palavras proibidas" e o código fazia outra coisa: procurava
 * 12 substrings, SÓ no assunto, e mandava o resultado para um `logger.warn()`.
 * Documentação afirmando uma trava que não existe é pior que trava nenhuma — quem lê
 * para de conferir.
 */

describe('encurtadoresEncontrados — o único bloqueio', () => {
  // O Gmail não classifica como promoção: descarta por associação com phishing.
  // Não é uma questão de score, o e-mail não chega.
  it('pega os encurtadores comuns', () => {
    expect(encurtadoresEncontrados('veja https://bit.ly/abc')).toEqual(['bit.ly']);
    expect(encurtadoresEncontrados('http://tinyurl.com/x')).toEqual(['tinyurl.com']);
    expect(encurtadoresEncontrados('https://encurtador.com.br/abc')).toEqual(['encurtador.com.br']);
  });

  it('olha vários campos de uma vez (assunto, corpo, link)', () => {
    const achados = encurtadoresEncontrados('Assunto normal', 'corpo normal', 'https://cutt.ly/z');
    expect(achados).toEqual(['cutt.ly']);
  });

  it('link normal do domínio não é encurtador', () => {
    expect(encurtadoresEncontrados('acesse https://hipertms.com.br/planos')).toEqual([]);
  });

  // A comparação é por DOMÍNIO do link, não substring solta: "t.co" dentro de
  // "contato.com.br" derrubaria campanhas legítimas.
  it('não confunde substring com domínio', () => {
    expect(encurtadoresEncontrados('https://contato.com.br/x')).toEqual([]);
    expect(encurtadoresEncontrados('escreva para bit.ly sem link')).toEqual([]);
  });

  it('reconhece subdomínio do encurtador', () => {
    expect(encurtadoresEncontrados('https://go.bit.ly/x')).toEqual(['go.bit.ly']);
  });

  it('ignora www e caixa', () => {
    expect(dominiosDosLinks('https://WWW.Bit.LY/abc')).toEqual(['bit.ly']);
  });
});

describe('avisosDeSpam — o que sobe o score sem condenar', () => {
  it('e-mail bem escrito não gera aviso', () => {
    const corpo =
      'Bom dia, João.\n\nVi que a sua transportadora trabalha com carga fracionada e queria ' +
      'entender como vocês fazem a cotação hoje. Faz sentido conversarmos dez minutos esta semana?';
    expect(avisosDeSpam('Cotação de frete na sua operação', corpo)).toEqual([]);
  });

  it('aponta palavra de gatilho no assunto e no corpo, sem depender de acento', () => {
    const avisos = avisosDeSpam('PROMOÇÃO especial', 'aproveite a promocao e ganhe mais');
    expect(avisos.join(' ')).toContain('Assunto tem palavra de gatilho');
    expect(avisos.join(' ')).toContain('Corpo tem palavra de gatilho');
  });

  it('aponta assunto em CAIXA ALTA', () => {
    const avisos = avisosDeSpam('ATENCAO TRANSPORTADORA IMPORTANTE', 'corpo qualquer com bastante texto aqui dentro');
    expect(avisos.some((a) => a.includes('CAIXA ALTA'))).toBe(true);
  });

  it('não acusa CAIXA ALTA em sigla curta', () => {
    const avisos = avisosDeSpam('Sobre o TMS da sua operação de frete', 'texto normal e suficientemente longo para não acusar corpo curto demais aqui');
    expect(avisos.some((a) => a.includes('CAIXA ALTA'))).toBe(false);
  });

  it('aponta excesso de pontuação', () => {
    expect(avisosDeSpam('Imperdível!!', '').some((a) => a.includes('pontuação'))).toBe(true);
    expect(avisosDeSpam('Sério?!', '').some((a) => a.includes('pontuação'))).toBe(true);
  });

  it('aponta cifrões em sequência', () => {
    expect(avisosDeSpam('Economize $$$', '').some((a) => a.includes('$$$'))).toBe(true);
  });

  // Em primeiro contato frio o objetivo é a resposta, não o clique.
  it('aponta excesso de links no corpo', () => {
    const corpo = 'veja https://a.com/1 e https://b.com/2 e https://c.com/3 e também https://d.com/4';
    expect(avisosDeSpam('Assunto', corpo).some((a) => a.includes('links no corpo'))).toBe(true);
  });

  it('aponta corpo curto demais (parece disparo em massa)', () => {
    expect(avisosDeSpam('Assunto', 'Oi, tudo bem?').some((a) => a.includes('muito curto'))).toBe(true);
  });

  it('corpo ausente não gera aviso de tamanho', () => {
    expect(avisosDeSpam('Assunto normal e tranquilo').some((a) => a.includes('muito curto'))).toBe(false);
  });
});
