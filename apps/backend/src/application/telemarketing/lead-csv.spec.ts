import { describe, expect, it } from 'vitest';
import { avaliarLinha, detectarSeparador, parseCsvDeLeads } from './lead-csv';

describe('separador', () => {
  it('detecta ponto-e-vírgula do Excel brasileiro', () => {
    // O caso clássico: com `,` fixo, o arquivo inteiro vira uma coluna e o operador
    // acha que a lista está ruim.
    expect(detectarSeparador('nome;empresa;telefone')).toBe(';');
  });

  it('detecta vírgula', () => {
    expect(detectarSeparador('nome,empresa,telefone')).toBe(',');
  });

  it('detecta tab', () => {
    expect(detectarSeparador('nome\tempresa\ttelefone')).toBe('\t');
  });
});

describe('parse', () => {
  it('lê as colunas e normaliza telefone e e-mail', () => {
    const { linhas } = parseCsvDeLeads(
      [
        'nome;empresa;telefone;email;frota',
        'Carlos Mendes;Transportes Silva;(12) 98807-3788;CARLOS@Silva.com.BR;12 caminhões',
      ].join('\n'),
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      linha: 2, // o operador conta o cabeçalho como linha 1
      name: 'Carlos Mendes',
      company: 'Transportes Silva',
      phone: '5512988073788', // DDI acrescentado, formatação removida
      fleetSize: 12,
      descarte: null,
      temNome: true,
    });
    expect(linhas[0].email).toBe('carlos@silva.com.br');
  });

  it('aceita cabeçalhos com acento e variações', () => {
    const { linhas, colunasIgnoradas } = parseCsvDeLeads(
      ['Razão Social;Celular;E-mail;CNPJ', 'Silva Ltda;11999887766;a@b.com;123'].join('\n'),
    );

    expect(linhas[0]).toMatchObject({ company: 'Silva Ltda', phone: '5511999887766' });
    // Coluna desconhecida é reportada, não descartada em silêncio.
    expect(colunasIgnoradas).toEqual(['CNPJ']);
  });

  it('respeita aspas com separador dentro', () => {
    const { linhas } = parseCsvDeLeads(
      ['nome;empresa;telefone', 'Carlos;"Silva, Transportes";11999887766'].join('\n'),
    );
    expect(linhas[0].company).toBe('Silva, Transportes');
  });

  it('e-mail ausente é null, nunca string vazia (ADR 021)', () => {
    const { linhas } = parseCsvDeLeads(
      ['nome;telefone;email', 'Carlos;11999887766;'].join('\n'),
    );
    expect(linhas[0].email).toBeNull();
  });

  it('marca duplicado dentro do próprio arquivo', () => {
    const { linhas } = parseCsvDeLeads(
      [
        'nome;telefone',
        'Carlos;11999887766',
        'Carlos Mendes;(11) 99988-7766', // mesmo número, escrito diferente
      ].join('\n'),
    );

    expect(linhas[0].descarte).toBeNull();
    expect(linhas[1].descarte).toBe('duplicado');
  });

  it('arquivo vazio ou só com cabeçalho não quebra', () => {
    expect(parseCsvDeLeads('').linhas).toEqual([]);
    expect(parseCsvDeLeads('nome;telefone').linhas).toEqual([]);
  });

  it('lê CRLF e BOM do Excel', () => {
    const { linhas } = parseCsvDeLeads('﻿nome;telefone\r\nCarlos;11999887766\r\n');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].name).toBe('Carlos');
  });
});

describe('veredito da linha', () => {
  const base = { linha: 2, name: null, company: null, fleetSize: null };

  it('lead só com e-mail é válido', () => {
    // Descartar por não ter telefone jogaria fora lead de formulário do site.
    const r = avaliarLinha({ ...base, phone: null, email: 'a@b.com' }, new Set());
    expect(r).toBeNull();
  });

  it('lead só com telefone é válido', () => {
    expect(avaliarLinha({ ...base, phone: '5511999887766', email: null }, new Set())).toBeNull();
  });

  it('telefone curto e sem e-mail cai como telefone_invalido', () => {
    const r = avaliarLinha({ ...base, phone: '5511999', email: null }, new Set());
    expect(r).toBe('telefone_invalido');
  });

  it('e-mail torto mas telefone bom continua válido', () => {
    const r = avaliarLinha({ ...base, phone: '5511999887766', email: 'sem-arroba' }, new Set());
    expect(r).toBeNull();
  });

  it('linha sem nada aproveitável é descartada', () => {
    expect(avaliarLinha({ ...base, phone: null, email: null }, new Set())).toBe(
      'telefone_invalido',
    );
  });
});
