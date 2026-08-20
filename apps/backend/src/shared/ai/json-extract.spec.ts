import { describe, expect, it } from 'vitest';
import { descascarCerca, extrairJson, primeiroValorBalanceado } from './json-extract';

/**
 * Os casos aqui são os que o sistema PRODUZ, não hipóteses: a cerca de markdown
 * (que derrubou o "Gerar do roteiro" em 20/08/2026), o array aninhado do rascunho
 * de modelos, e o `{{nome}}` que os nossos prompts mandam a IA escrever.
 */
describe('extrairJson', () => {
  it('JSON puro passa direto', () => {
    expect(extrairJson('{"rota":"vendas"}')).toEqual({ rota: 'vendas' });
  });

  // O caso real do incidente: resposta correta, embrulhada em ```json.
  it('descasca a cerca de markdown', () => {
    const raw = '```json\n{"modelos":[{"name":"Toque 1","step":1}]}\n```';
    expect(extrairJson(raw)).toEqual({ modelos: [{ name: 'Toque 1', step: 1 }] });
  });

  it('cerca sem a palavra json também', () => {
    expect(extrairJson('```\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  // A regex non-greedy antiga cortava em `{"modelos":[{"name":"x"}` — inválido.
  it('array aninhado sobrevive inteiro', () => {
    const raw = '{"modelos":[{"name":"A","step":1},{"name":"B","step":2}]}';
    expect(extrairJson<any>(raw).modelos).toHaveLength(2);
  });

  // Os prompts MANDAM escrever {{nome}} e {{saudacao}} no corpo: cada um virava
  // um falso candidato na extração antiga.
  it('{{nome}} dentro do texto não confunde a contagem', () => {
    const raw = '{"body":"{{saudacao}}, {{nome}}! Tudo bem?","step":1}';
    expect(extrairJson<any>(raw).body).toBe('{{saudacao}}, {{nome}}! Tudo bem?');
  });

  it('texto explicativo antes e depois do JSON', () => {
    const raw = 'Claro! Aqui está:\n{"rota":"suporte"}\nEspero ter ajudado.';
    expect(extrairJson(raw)).toEqual({ rota: 'suporte' });
  });

  it('array na raiz também é válido', () => {
    expect(extrairJson('[{"a":1},{"a":2}]')).toHaveLength(2);
  });

  // Chave escapada dentro de string encerraria a string cedo sem o tratamento
  // de barra invertida, e a contagem sairia errada dali em diante.
  it('aspas escapadas não quebram a varredura', () => {
    const raw = 'nota:\n{"texto":"ele disse \\"oi\\" e saiu","n":2}';
    expect(extrairJson<any>(raw)).toEqual({ texto: 'ele disse "oi" e saiu', n: 2 });
  });

  // Estouro de max_tokens corta a resposta no meio. Devolver o pedaço só empurra
  // o erro para o JSON.parse de quem chamou.
  it('resposta truncada devolve null, não um pedaço', () => {
    expect(extrairJson('{"modelos":[{"name":"Toque 1",')).toBeNull();
  });

  it('sem JSON nenhum devolve null', () => {
    expect(extrairJson('Desculpe, não posso ajudar com isso.')).toBeNull();
    expect(extrairJson('')).toBeNull();
  });
});

describe('descascarCerca', () => {
  it('sem cerca, devolve o texto como está', () => {
    expect(descascarCerca('{"a":1}')).toBe('{"a":1}');
  });
});

describe('primeiroValorBalanceado', () => {
  it('pega o primeiro valor completo e para nele', () => {
    expect(primeiroValorBalanceado('{"a":1} {"b":2}')).toBe('{"a":1}');
  });

  it('objeto dentro de objeto fecha na chave certa', () => {
    expect(primeiroValorBalanceado('{"x":{"y":1}}')).toBe('{"x":{"y":1}}');
  });
});
