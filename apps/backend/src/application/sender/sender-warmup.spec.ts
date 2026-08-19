import { describe, it, expect } from 'vitest';
import { decidirAquecimento, type EscadaDeAquecimento, type EstadoDoNumero } from './sender-warmup';

/**
 * A escada existia e ninguém subia. Estes testes afirmam a REGRA de subida, que é a
 * peça que faltava — não o formato dos parâmetros.
 */
const ESCADA: EscadaDeAquecimento = {
  degraus: [10, 15, 20, 30],
  diasPorDegrau: 3,
  usoMinimoEmDias: 1,
};

const AGORA = new Date('2026-08-19T12:00:00Z');
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000);

function numero(over: Partial<EstadoDoNumero> = {}): EstadoDoNumero {
  return {
    warmupStage: 0,
    stageSince: diasAtras(5),
    createdAt: diasAtras(30),
    enviadosNoEstagio: 50,
    saudavel: true,
    ...over,
  };
}

describe('decidirAquecimento', () => {
  it('sobe quando cumpriu tempo, uso e saúde', () => {
    const v = decidirAquecimento(numero(), ESCADA, AGORA);
    expect(v.avanca).toBe(true);
    expect(v.proximoEstagio).toBe(1);
  });

  it('não sobe antes do tempo mínimo no degrau', () => {
    const v = decidirAquecimento(numero({ stageSince: diasAtras(1) }), ESCADA, AGORA);
    expect(v.avanca).toBe(false);
    expect(v.proximoEstagio).toBe(0);
    expect(v.motivo).toContain('faltam');
  });

  // O ponto do freio: volume só cresce sobre engajamento que o sustente. A escada e o
  // freio de engajamento leem o mesmo sinal e não podem discordar.
  it('não sobe número com engajamento reprovado, mesmo cumprindo tempo e uso', () => {
    const v = decidirAquecimento(numero({ saudavel: false }), ESCADA, AGORA);
    expect(v.avanca).toBe(false);
    expect(v.motivo).toContain('engajamento');
  });

  // Número parado tem permissão de andar e não andou: subir o teto dele é dar folga a
  // quem não pediu, e folga sem histórico é exatamente o que o WhatsApp pune.
  it('não sobe número que não usou o degrau', () => {
    const v = decidirAquecimento(numero({ enviadosNoEstagio: 3 }), ESCADA, AGORA);
    expect(v.avanca).toBe(false);
    expect(v.motivo).toContain('parado não aquece');
  });

  it('para no último degrau e diz que parou', () => {
    const v = decidirAquecimento(numero({ warmupStage: 3 }), ESCADA, AGORA);
    expect(v.avanca).toBe(false);
    expect(v.proximoEstagio).toBe(3);
    expect(v.motivo).toContain('último degrau');
  });

  // Números criados antes da coluna existir não têm carimbo. Sem este fallback eles
  // ficariam presos no degrau 0 para sempre — que é justamente o bug sendo corrigido.
  it('sem carimbo de degrau, conta a partir do nascimento do número', () => {
    const v = decidirAquecimento(
      numero({ stageSince: null, createdAt: diasAtras(10) }),
      ESCADA,
      AGORA,
    );
    expect(v.avanca).toBe(true);
  });

  it('sem carimbo e recém-criado, ainda espera o tempo mínimo', () => {
    const v = decidirAquecimento(
      numero({ stageSince: null, createdAt: diasAtras(1) }),
      ESCADA,
      AGORA,
    );
    expect(v.avanca).toBe(false);
  });

  // Sobe um degrau por vez, mesmo com muito tempo acumulado: pular de 10 para 30
  // direto é o salto de volume que a escada existe para evitar.
  it('sobe um degrau por vez, não pula para o topo', () => {
    const v = decidirAquecimento(
      numero({ warmupStage: 1, stageSince: diasAtras(90), enviadosNoEstagio: 900 }),
      ESCADA,
      AGORA,
    );
    expect(v.proximoEstagio).toBe(2);
  });

  // O uso mínimo acompanha o teto do degrau, não um número fixo: no degrau 2 (20/dia)
  // exigir os mesmos 10 do degrau 0 deixaria passar quem usou metade da permissão.
  it('o uso mínimo acompanha o teto do degrau atual', () => {
    const noLimite = decidirAquecimento(
      numero({ warmupStage: 2, enviadosNoEstagio: 19 }),
      ESCADA,
      AGORA,
    );
    expect(noLimite.avanca).toBe(false);

    const suficiente = decidirAquecimento(
      numero({ warmupStage: 2, enviadosNoEstagio: 20 }),
      ESCADA,
      AGORA,
    );
    expect(suficiente.avanca).toBe(true);
  });
});
