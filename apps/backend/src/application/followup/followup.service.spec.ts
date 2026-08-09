import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MSG, renderFollowUp } from './followup.service';
import { spinVariants } from '@/application/sender/spintax';

// O follow-up mandava duas frases FIXAS, iguais caractere por caractere, para
// 100% dos leads que não responderam — mesmo público e mesmo número da campanha,
// que já tinha spintax. Estes testes prendem a variação e o tratamento do nome.

const envAnterior = { ...process.env };

afterEach(() => {
  process.env = { ...envAnterior };
});

describe('renderFollowUp — variação de texto', () => {
  beforeEach(() => {
    process.env.LGPD_OPT_OUT_FOOTER = 'false'; // rodapé fora do escopo destes testes
  });

  it('gera variantes suficientes nos dois estágios', () => {
    // Piso — spinVariants não conta aninhamento, então o real é >= isto.
    expect(spinVariants(MSG[1])).toBeGreaterThanOrEqual(50);
    expect(spinVariants(MSG[2])).toBeGreaterThanOrEqual(50);
  });

  it('dois leads diferentes não recebem o mesmo texto', () => {
    // rand determinístico distinto por chamada → variantes diferentes
    const primeiro = renderFollowUp(1, 'Ana', () => 0);
    const ultimo = renderFollowUp(1, 'Ana', () => 0.99);

    expect(primeiro).not.toBe(ultimo);
  });

  it('não sobra nenhuma chave de spintax no texto final', () => {
    for (const stage of [1, 2] as const) {
      for (const r of [0, 0.5, 0.99]) {
        const txt = renderFollowUp(stage, 'Ana', () => r);
        expect(txt).not.toMatch(/[{}|]/);
      }
    }
  });

  it('estágio inexistente devolve string vazia (o worker marca done)', () => {
    expect(renderFollowUp(3 as any, 'Ana')).toBe('');
  });
});

describe('renderFollowUp — nome do lead', () => {
  beforeEach(() => {
    process.env.LGPD_OPT_OUT_FOOTER = 'false';
  });

  it('usa o primeiro nome', () => {
    expect(renderFollowUp(1, 'Ana Paula Souza', () => 0)).toContain('Ana');
  });

  it('sem nome, NÃO chama a pessoa de "tudo bem"', () => {
    // O fallback antigo era a string literal "tudo bem", que produzia
    // "Oi tudo bem, passando pra saber…" em mais da metade da base.
    const txt = renderFollowUp(1, null, () => 0);

    expect(txt).not.toContain('tudo bem');
    expect(txt).not.toMatch(/\{\{/);
  });

  it('sem nome, não sobra pontuação órfã nem espaço duplo', () => {
    const txt = renderFollowUp(1, null, () => 0);

    expect(txt).not.toMatch(/ ,/);
    expect(txt).not.toMatch(/ {2}/);
    // "Oi , passando" viraria "Oi, passando" — a vírgula existia só pro nome
    expect(txt).toMatch(/^(Oi|Olá|Opa),/);
  });

  it('nome-lixo de lista raspada é tratado como sem nome', () => {
    // telefone no campo nome, letra solta — casos reais da base importada
    expect(renderFollowUp(1, '5511999998888', () => 0)).not.toContain('5511999998888');
    expect(renderFollowUp(1, 'A', () => 0)).toMatch(/^(Oi|Olá|Opa),/);
  });
});

describe('renderFollowUp — rodapé de opt-out', () => {
  it('inclui o rodapé por padrão', () => {
    delete process.env.LGPD_OPT_OUT_FOOTER;

    expect(renderFollowUp(1, 'Ana', () => 0)).toContain('Responda SAIR');
  });

  it('LGPD_OPT_OUT_FOOTER=false remove o rodapé (DISP-018 — mesma chave do disparo)', () => {
    process.env.LGPD_OPT_OUT_FOOTER = 'false';

    expect(renderFollowUp(1, 'Ana', () => 0)).not.toContain('Responda SAIR');
  });

  it('o rodapé sobrevive ao spintax sem virar variante', () => {
    delete process.env.LGPD_OPT_OUT_FOOTER;
    for (const r of [0, 0.5, 0.99]) {
      expect(renderFollowUp(2, 'Ana', () => r)).toContain('Responda SAIR');
    }
  });
});
