import { describe, it, expect } from 'vitest';
import { precisaTrocarMercado } from './conversation-market';

/**
 * Com UM número de WhatsApp, o mesmo lead recebe campanha de mais de um mercado na
 * mesma thread. A conversa pertence ao mercado da ÚLTIMA campanha — senão o lead
 * responde à mensagem de pneus e a Lia devolve o preço do TMS. Ver ADR 037.
 */
describe('precisaTrocarMercado', () => {
  it('conversa do TMS recebendo campanha de pneus: troca', () => {
    expect(precisaTrocarMercado('hipertms', 'pneus')).toBe(true);
  });

  it('conversa sem mercado recebendo campanha de um mercado: adota', () => {
    expect(precisaTrocarMercado(null, 'pneus')).toBe(true);
    expect(precisaTrocarMercado(undefined, 'pneus')).toBe(true);
  });

  // Um UPDATE por envio numa base grande, para gravar o valor que já está lá.
  it('mesma campanha do mesmo mercado: não escreve à toa', () => {
    expect(precisaTrocarMercado('pneus', 'pneus')).toBe(false);
  });

  // Campanha antiga (criada antes dos mercados) chega sem produto. Apagar aqui faria
  // a Lia perder um contexto que ela já tinha — regressão silenciosa.
  it('campanha SEM mercado nunca apaga o mercado da conversa', () => {
    expect(precisaTrocarMercado('hipertms', null)).toBe(false);
    expect(precisaTrocarMercado('hipertms', undefined)).toBe(false);
    expect(precisaTrocarMercado('hipertms', '')).toBe(false);
  });

  it('sem mercado dos dois lados: nada a fazer', () => {
    expect(precisaTrocarMercado(null, null)).toBe(false);
  });

  // O caso que motivou tudo, na ordem em que aconteceria.
  it('a sequência do lead que recebe dos dois mercados', () => {
    let mercado: string | null = null;

    // 12/08 — campanha do HiperTMS cria a conversa
    expect(precisaTrocarMercado(mercado, 'hipertms')).toBe(true);
    mercado = 'hipertms';

    // 28/08 — campanha de pneus reusa a MESMA thread
    expect(precisaTrocarMercado(mercado, 'pneus')).toBe(true);
    mercado = 'pneus';

    // o "quanto custa?" que chega agora é sobre pneus
    expect(mercado).toBe('pneus');
  });
});
