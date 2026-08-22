import { describe, expect, it } from 'vitest';
import { TmsLookupService } from '../../infra/tms/tms-lookup.service';
import { normalizePhone } from '../../shared/utils/phone.util';
import { vereditoDeBanco, type FatosDoContato } from './lead-import';

const NOVO = null;
const semNada: FatosDoContato = {
  optOutAt: null,
  status: 'active',
  emailBouncedAt: null,
  customerSince: null,
};

const base = {
  temFone: true,
  temEmail: true,
  estaNoTms: false,
  forcarJaNaBase: false,
  temOportunidadeAtivaNoMercado: false,
};

describe('chave do TMS — o erro que ninguém veria na tela', () => {
  // O `batchLookup` indexa o Map por telefone SEM o 55. O service consulta esse Map
  // normalizando de novo com o mesmo método estático. Se as duas pontas divergirem,
  // acontece uma de duas coisas, as duas silenciosas: nenhum cliente é pego (cliente
  // recebe oferta do que já paga), ou tudo casa (a lista inteira é descartada e o
  // operador conclui que a lista era ruim).
  it.each([
    ['+55 (12) 98807-3788', '12988073788'],
    ['5512988073788', '12988073788'],
    ['12988073788', '12988073788'],
    ['(11) 3333-4444', '1133334444'],
    ['5511999887766@c.us', '11999887766'], // chatId do WAHA
  ])('%s casa com a chave %s', (entrada, esperada) => {
    // O caminho real: parser normaliza para o canônico do Nexa, service converte para
    // a chave do TMS. As duas etapas juntas, como acontece em produção.
    const canonico = normalizePhone(entrada);
    expect(TmsLookupService.normalize(canonico)).toBe(esperada);
  });

  it('o mesmo número escrito de cinco formas cai numa chave só', () => {
    const formas = [
      '+55 (12) 98807-3788',
      '5512988073788',
      '12988073788',
      '12 98807 3788',
      '5512988073788:5@c.us',
    ];
    const chaves = new Set(
      formas.map((f) => TmsLookupService.normalize(normalizePhone(f))),
    );
    expect(chaves.size).toBe(1);
  });

  it('DDD 55 sem DDI NÃO sobrevive à normalização — limitação conhecida', () => {
    // Santa Maria/RS é DDD 55, e região de transportadora. "55 99887766" tem os
    // dígitos do DDI, então `normalizePhone` trata o DDD como DDI e o número fica
    // curto — cai como telefone_invalido na peneira.
    // Não corrigido aqui de propósito: `normalizePhone` é a fonte única de verdade do
    // telefone no Nexa e mexer nela afeta WhatsApp, disparo e inbox. Fica pinado como
    // comportamento atual; a saída prática é a lista trazer o DDI.
    expect(normalizePhone('5599887766')).toBe('5599887766'); // 10 dígitos: inválido
    expect(normalizePhone('555599887766')).toBe('555599887766'); // com DDI: ok
  });
});

describe('precedência dos motivos', () => {
  it('cliente ganha de já na base', () => {
    // O motivo importa mais que o descarte: `ja_na_base` é forçável, `cliente` não.
    // Reportar o frouxo deixaria o operador achar que dá pra forçar um cliente.
    const r = vereditoDeBanco({
      ...base,
      existente: { ...semNada, customerSince: new Date() },
    });
    expect(r.descarte).toBe('cliente');
  });

  it('cliente ganha mesmo com forcarJaNaBase ligado', () => {
    const r = vereditoDeBanco({
      ...base,
      existente: { ...semNada, customerSince: new Date() },
      forcarJaNaBase: true,
    });
    expect(r.descarte).toBe('cliente');
  });

  it('cliente do TMS descarta mesmo sem existir no Nexa', () => {
    const r = vereditoDeBanco({ ...base, existente: NOVO, estaNoTms: true });
    expect(r.descarte).toBe('cliente');
  });

  it('opt-out ganha de já na base, e forçar não muda', () => {
    const r = vereditoDeBanco({
      ...base,
      existente: { ...semNada, optOutAt: new Date() },
      forcarJaNaBase: true,
    });
    expect(r.descarte).toBe('opt_out'); // LGPD
  });

  it('status opted_out vale como opt-out', () => {
    const r = vereditoDeBanco({ ...base, existente: { ...semNada, status: 'opted_out' } });
    expect(r.descarte).toBe('opt_out');
  });
});

describe('hard bounce apaga o e-mail, não o lead', () => {
  it('com telefone: lead entra sem o e-mail', () => {
    const r = vereditoDeBanco({
      ...base,
      existente: { ...semNada, emailBouncedAt: new Date() },
      forcarJaNaBase: true, // já está na base; queremos ver o bounce isolado
    });
    expect(r.descarte).toBeNull();
    expect(r.descartarEmail).toBe(true);
  });

  it('sem telefone: e-mail queimado era o único canal, então cai', () => {
    const r = vereditoDeBanco({
      ...base,
      temFone: false,
      existente: { ...semNada, emailBouncedAt: new Date() },
      forcarJaNaBase: true,
    });
    expect(r.descarte).toBe('email_invalido');
  });

  it('contato sem bounce não perde o e-mail', () => {
    const r = vereditoDeBanco({ ...base, existente: NOVO });
    expect(r.descartarEmail).toBe(false);
  });
});

describe('forcarJaNaBase', () => {
  it('desligado: contato existente é descartado', () => {
    expect(vereditoDeBanco({ ...base, existente: semNada }).descarte).toBe('ja_na_base');
  });

  it('ligado: contato existente entra', () => {
    const r = vereditoDeBanco({ ...base, existente: semNada, forcarJaNaBase: true });
    expect(r.descarte).toBeNull();
  });

  it('lead novo entra com ou sem a flag', () => {
    expect(vereditoDeBanco({ ...base, existente: NOVO }).descarte).toBeNull();
    expect(
      vereditoDeBanco({ ...base, existente: NOVO, forcarJaNaBase: true }).descarte,
    ).toBeNull();
  });
});

describe('reimportação forçada não duplica negócio aberto', () => {
  it('forcarJaNaBase ligado + oportunidade ativa no mesmo mercado: bloqueia', () => {
    const r = vereditoDeBanco({
      ...base,
      existente: semNada,
      forcarJaNaBase: true,
      temOportunidadeAtivaNoMercado: true,
    });
    expect(r.descarte).toBe('ja_tem_oportunidade');
  });

  it('não é forçável — nem um segundo forcarJaNaBase muda o veredito', () => {
    // Ao contrário de 'ja_na_base', não existe um segundo parâmetro para destravar
    // isto: a única saída é a oportunidade em aberto fechar (won/lost/discarded).
    const r = vereditoDeBanco({
      ...base,
      existente: semNada,
      forcarJaNaBase: true,
      temOportunidadeAtivaNoMercado: true,
    });
    expect(r.descarte).not.toBe('ja_na_base');
    expect(r.descarte).not.toBeNull();
  });

  it('ganha de ja_na_base mas perde para cliente e opt_out', () => {
    expect(
      vereditoDeBanco({
        ...base,
        existente: { ...semNada, customerSince: new Date() },
        forcarJaNaBase: true,
        temOportunidadeAtivaNoMercado: true,
      }).descarte,
    ).toBe('cliente');

    expect(
      vereditoDeBanco({
        ...base,
        existente: { ...semNada, optOutAt: new Date() },
        forcarJaNaBase: true,
        temOportunidadeAtivaNoMercado: true,
      }).descarte,
    ).toBe('opt_out');
  });

  it('sem forcarJaNaBase, oportunidade ativa não muda o motivo (já cairia em ja_na_base de qualquer jeito)', () => {
    const r = vereditoDeBanco({
      ...base,
      existente: semNada,
      forcarJaNaBase: false,
      temOportunidadeAtivaNoMercado: true,
    });
    expect(r.descarte).toBe('ja_tem_oportunidade');
  });

  it('oportunidade já fechada (won/lost/discarded) não bloqueia — pode reimportar', () => {
    // O fato chega pronto de fora (`peneiraDeBanco` já filtrou por stage); aqui só
    // confirmamos que "false" deixa passar normalmente.
    const r = vereditoDeBanco({
      ...base,
      existente: semNada,
      forcarJaNaBase: true,
      temOportunidadeAtivaNoMercado: false,
    });
    expect(r.descarte).toBeNull();
  });

  it('lead novo (sem contato existente) nunca é bloqueado por este motivo', () => {
    const r = vereditoDeBanco({
      ...base,
      existente: NOVO,
      temOportunidadeAtivaNoMercado: true, // não deveria nem ser calculado para NOVO, mas defensivo
    });
    expect(r.descarte).toBeNull();
  });
});
