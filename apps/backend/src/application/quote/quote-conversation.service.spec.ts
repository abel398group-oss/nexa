import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteConversationService } from './quote-conversation.service';
import type { EstadoCotacao } from './quote-flow';

const CAMPINAS = { code: '3509502', name: 'Campinas', state: 'SP' };
const BH = { code: '3106200', name: 'Belo Horizonte', state: 'MG' };
const FONE = '5511917747429';
const USER = 'user-1';

/// Sessão em memória — o serviço não deve saber que é Redis do outro lado.
function sessoesFalsas() {
  const mapa = new Map<string, EstadoCotacao>();
  return {
    disponivel: true,
    ler: vi.fn(async (p: string) => mapa.get(p) ?? null),
    gravar: vi.fn(async (p: string, e: EstadoCotacao) => void mapa.set(p, e)),
    apagar: vi.fn(async (p: string) => void mapa.delete(p)),
    _mapa: mapa,
  };
}

function tmsFalso(over: Partial<any> = {}) {
  return {
    configurado: true,
    buscarCidades: vi.fn(async () => [CAMPINAS]),
    tiposDeCarga: vi.fn(async () => ['Carga Geral']),
    cotar: vi.fn(async () => ({ ok: true, price: 5200, minimumFloor: 3800, distanceKm: 586, draftId: '1234' })),
    ...over,
  };
}

function criar(sessoes: any, tms: any) {
  return new QuoteConversationService(sessoes as any, tms as any);
}

describe('cotação por WhatsApp', () => {
  beforeEach(() => {
    process.env.QUOTE_WHATSAPP_ENABLED = 'true';
  });

  it('DESLIGADA por padrão, devolve null e não toca em nada', async () => {
    delete process.env.QUOTE_WHATSAPP_ENABLED;
    const s = sessoesFalsas();
    const svc = criar(s, tmsFalso());
    expect(await svc.responderMensagem(FONE, 'cotar', USER)).toBeNull();
    expect(s.ler).not.toHaveBeenCalled();
  });

  it('mensagem que não é gatilho e não tem sessão devolve null — o resto do WhatsApp segue igual', async () => {
    const svc = criar(sessoesFalsas(), tmsFalso());
    expect(await svc.responderMensagem(FONE, 'ok', USER)).toBeNull();
    expect(await svc.responderMensagem(FONE, 'obrigado', USER)).toBeNull();
  });

  it('o gatilho abre e grava a sessão', async () => {
    const s = sessoesFalsas();
    const svc = criar(s, tmsFalso());
    const r = await svc.responderMensagem(FONE, 'cotar', USER);
    expect(r).toContain('Cotação de frete');
    expect(s._mapa.get(FONE)?.etapa).toBe('origem');
  });

  it('"cotar" no meio da conversa RECOMEÇA em vez de virar resposta', async () => {
    const s = sessoesFalsas();
    const svc = criar(s, tmsFalso());
    await svc.responderMensagem(FONE, 'cotar', USER);
    await svc.responderMensagem(FONE, 'Campinas SP', USER);
    const r = await svc.responderMensagem(FONE, 'cotar', USER);
    expect(r).toContain('Cotação de frete');
    expect(s._mapa.get(FONE)?.etapa).toBe('origem');
  });

  it('percorre as 6 perguntas e devolve o valor com o rascunho', async () => {
    const s = sessoesFalsas();
    const tms = tmsFalso({
      buscarCidades: vi
        .fn()
        .mockResolvedValueOnce([CAMPINAS])
        .mockResolvedValueOnce([BH]),
      tiposDeCarga: vi.fn(async () => ['Carga Geral', 'Frigorificada']),
    });
    const svc = criar(s, tms);

    await svc.responderMensagem(FONE, 'cotar', USER);
    await svc.responderMensagem(FONE, 'Campinas SP', USER);
    await svc.responderMensagem(FONE, 'Belo Horizonte MG', USER);
    await svc.responderMensagem(FONE, '1', USER); // dedicado
    await svc.responderMensagem(FONE, '2', USER); // carreta
    await svc.responderMensagem(FONE, '1', USER); // Carga Geral
    const fim = await svc.responderMensagem(FONE, '80000', USER);

    expect(fim).toContain('5.200,00');
    expect(fim).toContain('1234');
    // A sessão MORRE no fim: a próxima mensagem não pode virar resposta de formulário.
    expect(s._mapa.has(FONE)).toBe(false);
  });

  it('manda o telefone junto na cotação — é a proveniência do rascunho', async () => {
    const s = sessoesFalsas();
    const tms = tmsFalso();
    const svc = criar(s, tms);
    await svc.responderMensagem(FONE, 'cotar', USER);
    await svc.responderMensagem(FONE, 'Campinas SP', USER);
    await svc.responderMensagem(FONE, 'Belo Horizonte MG', USER);
    await svc.responderMensagem(FONE, '2', USER); // fracionado
    await svc.responderMensagem(FONE, '500', USER);
    await svc.responderMensagem(FONE, '12000', USER);
    expect(tms.cotar).toHaveBeenCalledWith(USER, expect.anything(), FONE);
  });

  it('falha na busca de cidade NÃO vira "não achei essa cidade"', async () => {
    // Mandar corrigir um nome que estava certo é o pior conselho possível aqui.
    const s = sessoesFalsas();
    const svc = criar(s, tmsFalso({ buscarCidades: vi.fn(async () => null) }));
    await svc.responderMensagem(FONE, 'cotar', USER);
    const r = await svc.responderMensagem(FONE, 'Campinas SP', USER);
    expect(r).toContain('consultar');
    expect(r).not.toContain('não achei');
  });

  it('sem tabela de frete encerra com frase própria', async () => {
    const s = sessoesFalsas();
    const svc = criar(s, tmsFalso({ tiposDeCarga: vi.fn(async () => []) }));
    await svc.responderMensagem(FONE, 'cotar', USER);
    await svc.responderMensagem(FONE, 'Campinas SP', USER);
    await svc.responderMensagem(FONE, 'Belo Horizonte MG', USER);
    await svc.responderMensagem(FONE, '1', USER);
    const r = await svc.responderMensagem(FONE, '2', USER);
    expect(r).toContain('tabela de frete');
    expect(s._mapa.has(FONE)).toBe(false);
  });

  it('403 e 429 do TMS geram frases diferentes', async () => {
    const caminho = async (motivo: 'sem_permissao' | 'cota_estourada') => {
      const s = sessoesFalsas();
      const svc = criar(s, tmsFalso({ cotar: vi.fn(async () => ({ ok: false, motivo })) }));
      await svc.responderMensagem(FONE, 'cotar', USER);
      await svc.responderMensagem(FONE, 'Campinas SP', USER);
      await svc.responderMensagem(FONE, 'Belo Horizonte MG', USER);
      await svc.responderMensagem(FONE, '2', USER);
      await svc.responderMensagem(FONE, '500', USER);
      return svc.responderMensagem(FONE, '12000', USER);
    };
    const semPerm = await caminho('sem_permissao');
    const semCota = await caminho('cota_estourada');
    expect(semPerm).not.toBe(semCota);
    expect(semPerm).toContain('liberado');
    expect(semCota).toContain('limite');
  });

  it('errar três vezes encerra a sessão em vez de repetir para sempre', async () => {
    const s = sessoesFalsas();
    const svc = criar(s, tmsFalso());
    await svc.responderMensagem(FONE, 'cotar', USER);
    await svc.responderMensagem(FONE, 'Campinas SP', USER);
    await svc.responderMensagem(FONE, 'Belo Horizonte MG', USER);
    await svc.responderMensagem(FONE, 'xxx', USER);
    await svc.responderMensagem(FONE, 'yyy', USER);
    const r = await svc.responderMensagem(FONE, 'zzz', USER);
    expect(r).toContain('time');
    expect(s._mapa.has(FONE)).toBe(false);
  });

  it('sair cancela e apaga a sessão', async () => {
    const s = sessoesFalsas();
    const svc = criar(s, tmsFalso());
    await svc.responderMensagem(FONE, 'cotar', USER);
    const r = await svc.responderMensagem(FONE, 'sair', USER);
    expect(r).toContain('cancelada');
    expect(s._mapa.has(FONE)).toBe(false);
  });

  it('sem Redis, avisa em vez de abrir uma sessão que não sobrevive', async () => {
    const s = { ...sessoesFalsas(), disponivel: false };
    const svc = criar(s, tmsFalso());
    const r = await svc.responderMensagem(FONE, 'cotar', USER);
    expect(r).toContain('indisponível');
  });
});
