import { describe, it, expect } from 'vitest';
import { SalesAgentService } from './sales-agent.service';
import { SenderService } from '@/application/sender/sender.service';

// ─── Extração do perfil do lead (2026-08-01) ────────────────────────────────
// A Lia devolve `PERFIL={...}` junto com a resposta. Tudo é defensivo: JSON
// quebrado, campo vazio ou ausente → undefined, e o contato fica como está.
// Gravar lixo no cadastro do lead é pior que não gravar nada.

const parse = (s: string) => SalesAgentService.parseProfile(s);

describe('parseProfile — extrai o que o lead revelou', () => {
  it('nome, empresa e frota', () => {
    expect(parse('Claro!\nACTION=none\nPERFIL={"nome":"João","empresa":"Transportadora Silva","frota":12}'))
      .toEqual({ nome: 'João', empresa: 'Transportadora Silva', frota: 12 });
  });

  it('só o que o lead disse (campos ausentes não viram undefined explícito)', () => {
    expect(parse('ACTION=none\nPERFIL={"nome":"Maria"}')).toEqual({ nome: 'Maria' });
    expect(parse('ACTION=none\nPERFIL={"frota":40}')).toEqual({ frota: 40 });
  });

  it('frota decimal é arredondada', () => {
    expect(parse('PERFIL={"frota":12.4}')).toEqual({ frota: 12 });
  });
});

describe('parseProfile — casos que NÃO devem gravar nada', () => {
  it('o lead não falou de si', () => {
    expect(parse('Bom dia! Como posso ajudar?\nACTION=none\nPERFIL={}')).toBeUndefined();
  });

  it('modelo não devolveu a linha', () => {
    expect(parse('Bom dia!\nACTION=none')).toBeUndefined();
  });

  it('JSON quebrado não derruba nem grava', () => {
    expect(parse('PERFIL={"nome":"João",,,}')).toBeUndefined();
    expect(parse('PERFIL={nome: Joao}')).toBeUndefined();
    expect(parse('PERFIL=')).toBeUndefined();
  });

  it('campos vazios ou de tipo errado são ignorados', () => {
    expect(parse('PERFIL={"nome":"","empresa":"  "}')).toBeUndefined();
    expect(parse('PERFIL={"nome":123,"frota":"muitos"}')).toBeUndefined();
  });

  it('frota absurda (alucinação) é descartada', () => {
    expect(parse('PERFIL={"frota":0}')).toBeUndefined();
    expect(parse('PERFIL={"frota":-5}')).toBeUndefined();
    expect(parse('PERFIL={"frota":999999}')).toBeUndefined();
  });

  it('frase inteira no campo nome é descartada (>80 chars)', () => {
    const frase = 'a'.repeat(81);
    expect(parse(`PERFIL={"nome":"${frase}"}`)).toBeUndefined();
  });
});

// ─── Saudação quando o contato não tem nome ─────────────────────────────────
// 1.666 dos 3.097 leads entram sem nome. Antes o fallback era a string
// "tudo bem", gerando "Bom dia tudo bem, tudo bem?".

describe('saudação sem nome — frase se recompõe sozinha', () => {
  const { firstName, tidyMissingName } = SenderService;
  const render = (tpl: string, name?: string) => {
    const f = firstName(name);
    const t = tpl.replace(/\{\{\s*nome\s*\}\}/gi, f).replace(/\{\{\s*saudacao\s*\}\}/gi, 'Bom dia');
    return f ? t : tidyMissingName(t);
  };

  it('vírgula órfã some', () => {
    expect(render('{{saudacao}} {{nome}}, tudo bem?')).toBe('Bom dia, tudo bem?');
    expect(render('{{saudacao}} {{nome}}, tudo bem?', 'João Silva')).toBe('Bom dia João, tudo bem?');
  });

  it('pontuação colidindo não deixa "Bom dia,."', () => {
    expect(render('{{saudacao}}, {{nome}}. Sou a Lia.')).toBe('Bom dia. Sou a Lia.');
  });

  it('exclamação encosta na saudação', () => {
    expect(render('Oi {{nome}}! Vi seu contato.')).toBe('Oi! Vi seu contato.');
  });

  it('nome-lixo de lista raspada é tratado como sem nome', () => {
    expect(firstName('5511999998888')).toBe('');
    expect(firstName('J')).toBe('');
    expect(firstName('🚛')).toBe('');
    expect(firstName('  ')).toBe('');
    expect(firstName('João Silva')).toBe('João');
  });
});
