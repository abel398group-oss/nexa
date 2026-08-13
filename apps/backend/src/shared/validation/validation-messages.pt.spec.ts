import { describe, it, expect } from 'vitest';
import {
  traduzirMensagemDeValidacao,
  traduzirMensagensDeValidacao,
} from './validation-messages.pt';

describe('traduzirMensagemDeValidacao', () => {
  // A mensagem que já derrubou a abertura de chamado do widget duas vezes. Ela
  // vai como texto para o usuário final do TMS, então precisa dizer sozinha o
  // que aconteceu — e precisa manter o nome do campo, que é a única pista de
  // qual propriedade sobrou no payload.
  it('campo não declarado: mantém o nome do campo e explica', () => {
    expect(traduzirMensagemDeValidacao('property isManager should not exist')).toBe(
      'o campo "isManager" não é aceito nesta rota',
    );
  });

  it.each([
    ['phone should not be empty', 'phone não pode ficar vazio'],
    ['phone must be a string', 'phone deve ser um texto'],
    ['limit must be an integer number', 'limit deve ser um número inteiro'],
    ['limit must not be less than 1', 'limit não pode ser menor que 1'],
    ['limit must not be greater than 5000', 'limit não pode ser maior que 5000'],
    ['email must be an email', 'email deve ser um e-mail válido'],
    ['ativo must be a boolean value', 'ativo deve ser verdadeiro ou falso'],
    ['ids must be an array', 'ids deve ser uma lista'],
    ['metadata must be an object', 'metadata deve ser um objeto'],
    ['id must be a UUID', 'id deve ser um UUID'],
    ['url must be a URL address', 'url deve ser uma URL válida'],
    ['valor must be a number conforming to the specified constraints', 'valor deve ser um número'],
    ['inicio must be a Date instance', 'inicio deve ser uma data'],
    [
      'scheduledAt must be a valid ISO 8601 date string',
      'scheduledAt deve ser uma data no formato ISO 8601',
    ],
    ['userId should not be null or undefined', 'userId é obrigatório'],
    ['qtd must be a positive number', 'qtd deve ser um número positivo'],
  ])('traduz %s', (entrada, esperado) => {
    expect(traduzirMensagemDeValidacao(entrada)).toBe(esperado);
  });

  it('preserva a lista de valores aceitos do IsIn — é a parte útil da mensagem', () => {
    expect(
      traduzirMensagemDeValidacao(
        'status must be one of the following values: all, open, closed',
      ),
    ).toBe('status deve ser um destes valores: all, open, closed');
  });

  it('traduz limites de tamanho de texto com o número no lugar', () => {
    expect(
      traduzirMensagemDeValidacao('nome must be shorter than or equal to 120 characters'),
    ).toBe('nome deve ter no máximo 120 caractere(s)');
    expect(
      traduzirMensagemDeValidacao('senha must be longer than or equal to 8 characters'),
    ).toBe('senha deve ter no mínimo 8 caractere(s)');
  });

  it('traduz limites de tamanho de lista', () => {
    expect(traduzirMensagemDeValidacao('ids must contain at least 1 elements')).toBe(
      'ids deve ter pelo menos 1 item(ns)',
    );
    expect(traduzirMensagemDeValidacao('ids must contain no more than 50 elements')).toBe(
      'ids deve ter no máximo 50 item(ns)',
    );
  });

  // A regex crua não diz nada a quem preencheu o campo.
  it('esconde a regex do @Matches', () => {
    expect(traduzirMensagemDeValidacao('cep must match /^\\d{5}-\\d{3}$/ regular expression')).toBe(
      'cep está em formato inválido',
    );
  });

  // Decorator com `{ each: true }` ganha o prefixo "each value in" do
  // class-validator. Sem tratar, a frase saía metade em inglês.
  it('traduz também o prefixo dos validadores por item', () => {
    expect(traduzirMensagemDeValidacao('each value in events must be a string')).toBe(
      'cada item de events deve ser um texto',
    );
    expect(traduzirMensagemDeValidacao('each value in ids must be a UUID')).toBe(
      'cada item de ids deve ser um UUID',
    );
  });

  // Validador próprio já escreve em português — não pode ser mexido por acidente.
  it('deixa intacta a mensagem que não casa com nenhum padrão', () => {
    const propria =
      'phone deve ser um telefone brasileiro válido — sobraram 9 dígitos depois de limpar';
    expect(traduzirMensagemDeValidacao(propria)).toBe(propria);
    expect(traduzirMensagemDeValidacao('Mercado "x" não existe.')).toBe('Mercado "x" não existe.');
  });

  it('traduz a lista inteira preservando a ordem', () => {
    expect(
      traduzirMensagensDeValidacao([
        'contactId should not be empty',
        'phone must be a string',
        'property hackeado should not exist',
      ]),
    ).toEqual([
      'contactId não pode ficar vazio',
      'phone deve ser um texto',
      'o campo "hackeado" não é aceito nesta rota',
    ]);
  });
});
