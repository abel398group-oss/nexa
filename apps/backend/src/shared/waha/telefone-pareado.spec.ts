import { describe, expect, it } from 'vitest';
import { telefonePareado } from './waha-client.service';

/**
 * O WAHA informa o chip pareado em `me.id`. Ler daí é o que faz a tela de Saúde mostrar
 * o número certo sem depender de alguém declarar uma env — e sem ficar desatualizada
 * quando o chip é trocado.
 *
 * `me.number` NÃO serve, e este é o teste que guarda a lição: em 16/08/2026 a resolução
 * de LID leu `number` e gravou "234754356076551", que é o user do LID sem código de
 * país — número inválido com cara de número válido.
 */
describe('telefone pareado do WAHA', () => {
  it('tira o número de me.id', () => {
    expect(telefonePareado({ status: 'WORKING', me: { id: '5512997880659@c.us' } })).toBe(
      '5512997880659',
    );
  });

  it('ignora me.number, mesmo quando ele existe', () => {
    const sessao = { me: { id: '5512988073788@c.us', number: '234754356076551' } };
    expect(telefonePareado(sessao)).toBe('5512988073788');
  });

  it('sessão sem pareamento não inventa número', () => {
    // Em SCAN_QR_CODE o WAHA não manda `me`.
    expect(telefonePareado({ status: 'SCAN_QR_CODE' })).toBeNull();
    expect(telefonePareado({ status: 'WORKING', me: {} })).toBeNull();
    expect(telefonePareado(null)).toBeNull();
    expect(telefonePareado(undefined)).toBeNull();
  });

  it('recusa o que não tem tamanho de telefone', () => {
    // Identificador interno curto não pode virar telefone na tela.
    expect(telefonePareado({ me: { id: '12345@c.us' } })).toBeNull();
    expect(telefonePareado({ me: { id: '@c.us' } })).toBeNull();
  });

  it('descarta o sufixo de aparelho do jid em vez de colar no telefone', () => {
    // O WAHA manda também `jid: "5512997880659:15@s.whatsapp.net"`. Os dígitos depois do
    // `:` são o APARELHO. Sem cortar ali sairia "551299788065915" — 15 dígitos, dentro de
    // qualquer faixa generosa de tamanho, e um número que não existe.
    expect(telefonePareado({ me: { id: '5512997880659:15@s.whatsapp.net' } })).toBe(
      '5512997880659',
    );
  });

  it('número comprido demais é recusado, não truncado', () => {
    // Truncar fabricaria um telefone; recusar faz a tela dizer que não identificou.
    expect(telefonePareado({ me: { id: '551299788065912345@c.us' } })).toBeNull();
  });
});
