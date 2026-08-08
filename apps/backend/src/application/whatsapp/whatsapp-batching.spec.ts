import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsappService } from './whatsapp.service';

// Agrupamento de mensagens seguidas (2026-08-08).
//
// Antes, a 2ª e a 3ª mensagem dentro da janela do rate-limit eram gravadas no
// banco e NUNCA chegavam à IA: o lead escrevia "oi" / "quero saber o preço" /
// "tenho 8 caminhões" e a Lia respondia apenas ao "oi". O que qualificava o lead
// se perdia. Estes testes fixam o contrato do lote: uma única chamada de IA com
// o texto completo, e nenhuma resposta com a autonomia desligada.
describe('WhatsappService — agrupamento de mensagens seguidas', () => {
  let handle: ReturnType<typeof vi.fn>;
  let autonomyOn: boolean;
  let svc: any;

  // A classe tem 11 dependências, mas o caminho do lote só toca `autonomy` e
  // `agent` — o resto entra como stub vazio de propósito, para o teste falhar
  // por comportamento e não por fiação.
  const build = () => {
    handle = vi.fn().mockResolvedValue({ route: { agent: 'sales', leadScore: 70 }, autoSent: true });
    const agent = { handle } as any;
    const autonomy = { isEnabled: () => autonomyOn } as any;
    const s = new WhatsappService(
      {} as any, // prisma
      {} as any, // contacts
      {} as any, // conversations
      agent,
      {} as any, // followup
      autonomy,
      {} as any, // notifications
      {} as any, // transcription
      {} as any, // emitter
      {} as any, // internalNumbers
      {} as any, // optOutRegistry
    );
    // O logger real escreve no stdout do teste; silenciar mantém a saída legível.
    (s as any).logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    return s as any;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    autonomyOn = true;
    svc = build();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('junta as mensagens seguidas em UMA chamada de IA com o texto completo', async () => {
    svc.bufferInbound('5511999999999', 't1', 'conv1', 'quero saber o preço');
    svc.bufferInbound('5511999999999', 't1', 'conv1', 'tenho 8 caminhões');

    expect(handle).not.toHaveBeenCalled(); // ainda esperando o lead parar de digitar

    await vi.advanceTimersByTimeAsync(7000);

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith('t1', {
      message: 'quero saber o preço\ntenho 8 caminhões',
      conversationId: 'conv1',
    });
  });

  it('cada mensagem nova adia o disparo (espera o lead terminar de digitar)', async () => {
    svc.bufferInbound('5511999999999', 't1', 'conv1', 'oi');
    await vi.advanceTimersByTimeAsync(4000); // ainda dentro da janela

    svc.bufferInbound('5511999999999', 't1', 'conv1', 'esqueci de falar');
    await vi.advanceTimersByTimeAsync(4000); // o timer foi rearmado — não disparou
    expect(handle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0][1].message).toBe('oi\nesqueci de falar');
  });

  it('usa a conversa mais recente quando uma reabertura troca o id no meio do lote', async () => {
    svc.bufferInbound('5511999999999', 't1', 'conv-antiga', 'oi');
    svc.bufferInbound('5511999999999', 't1', 'conv-nova', 'ainda estou aí?');

    await vi.advanceTimersByTimeAsync(7000);

    expect(handle.mock.calls[0][1].conversationId).toBe('conv-nova');
  });

  it('não responde se a autonomia for desligada durante a espera', async () => {
    svc.bufferInbound('5511999999999', 't1', 'conv1', 'quero saber o preço');
    autonomyOn = false;

    await vi.advanceTimersByTimeAsync(7000);

    expect(handle).not.toHaveBeenCalled();
  });

  it('respeita o teto de mensagens por lote e loga o descarte', async () => {
    for (let i = 0; i < 15; i++) {
      svc.bufferInbound('5511999999999', 't1', 'conv1', `msg ${i}`);
    }
    await vi.advanceTimersByTimeAsync(7000);

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0][1].message.split('\n')).toHaveLength(10); // BATCH_MAX_MSGS
    expect(svc.logger.warn).toHaveBeenCalled(); // descarte nunca é silencioso
  });

  it('uma falha da IA no lote não derruba o processo', async () => {
    handle.mockRejectedValue(new Error('anthropic 500'));
    svc.bufferInbound('5511999999999', 't1', 'conv1', 'oi');

    await expect(vi.advanceTimersByTimeAsync(7000)).resolves.not.toThrow();
    expect(svc.logger.error).toHaveBeenCalled();
  });
});
