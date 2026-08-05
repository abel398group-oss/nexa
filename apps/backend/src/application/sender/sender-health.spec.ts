import { describe, it, expect } from 'vitest';
import { assessHealth, type HealthThresholds } from './sender-health';

const T: HealthThresholds = { minSample: 30, minReplyRate: 0.03, maxFailureRate: 0.3 };

describe('assessHealth — amostra pequena não condena', () => {
  it('campanha recém-começada, ninguém respondeu ainda → saudável', () => {
    // O caso mais importante: com 5 envios a taxa é 0%, mas isso é falta de tempo,
    // não sinal. Pausar aqui inviabilizaria qualquer campanha nova.
    expect(assessHealth({ sent: 5, replied: 0, failed: 0 }, T).healthy).toBe(true);
  });

  it('exatamente na borda da amostra mínima já vale o veredito', () => {
    expect(assessHealth({ sent: 29, replied: 0, failed: 0 }, T).healthy).toBe(true);
    expect(assessHealth({ sent: 30, replied: 0, failed: 0 }, T).healthy).toBe(false);
  });

  it('zero envio não divide por zero', () => {
    const r = assessHealth({ sent: 0, replied: 0, failed: 0 }, T);
    expect(r.healthy).toBe(true);
    expect(r.replyRate).toBe(0);
    expect(r.failureRate).toBe(0);
  });
});

describe('assessHealth — piso de resposta', () => {
  it('300 envios e 2 respostas → reprova', () => {
    const r = assessHealth({ sent: 300, replied: 2, failed: 0 }, T);
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/resposta/i);
    expect(r.reason).toContain('2 de 300');
  });

  it('300 envios e 40 respostas → aprova', () => {
    expect(assessHealth({ sent: 300, replied: 40, failed: 0 }, T).healthy).toBe(true);
  });

  it('exatamente no piso passa (o corte é "abaixo de")', () => {
    // 3% de 100 = 3 respostas
    expect(assessHealth({ sent: 100, replied: 3, failed: 0 }, T).healthy).toBe(true);
    expect(assessHealth({ sent: 100, replied: 2, failed: 0 }, T).healthy).toBe(false);
  });
});

describe('assessHealth — teto de falha', () => {
  it('muita falha reprova mesmo com resposta boa', () => {
    // 100 enviados com ótima resposta, mas 60 falharam: o número está sendo recusado.
    const r = assessHealth({ sent: 100, replied: 50, failed: 60 }, T);
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/falha/i);
  });

  it('falha é medida sobre TENTATIVAS, não sobre enviados', () => {
    // 90 ok + 10 falhas = 10% de falha (e não 11% sobre os 90)
    const r = assessHealth({ sent: 90, replied: 30, failed: 10 }, T);
    expect(r.failureRate).toBeCloseTo(0.1, 5);
    expect(r.healthy).toBe(true);
  });

  it('falha tem prioridade sobre resposta no motivo relatado', () => {
    // Os dois problemas presentes: o motivo deve citar a falha, que é o sinal mais duro.
    const r = assessHealth({ sent: 100, replied: 0, failed: 100 }, T);
    expect(r.reason).toMatch(/falha/i);
  });
});

describe('assessHealth — números do relatório', () => {
  it('calcula as taxas usadas no aviso ao time', () => {
    const r = assessHealth({ sent: 200, replied: 4, failed: 0 }, T);
    expect(r.replyRate).toBeCloseTo(0.02, 5);
    expect(r.reason).toContain('2.0%');
  });

  it('entrada negativa é tratada como zero em vez de gerar taxa absurda', () => {
    const r = assessHealth({ sent: -5, replied: -1, failed: -2 }, T);
    expect(r.healthy).toBe(true);
    expect(r.replyRate).toBe(0);
  });
});
