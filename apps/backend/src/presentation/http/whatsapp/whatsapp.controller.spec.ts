import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from '@/application/whatsapp/whatsapp.service';
import { WahaHealthService } from '@/application/whatsapp/waha-health.service';
import { ForbiddenException } from '@nestjs/common';

// Instancia o controller diretamente com mock — mais simples e rápido que TestingModule
const mockWhatsappService = {
  process: vi.fn().mockResolvedValue({ ok: true }),
  handleAck: vi.fn().mockResolvedValue({ ok: true }),
} as unknown as WhatsappService;

const mockHealth = {
  handleStatusEvent: vi.fn().mockResolvedValue(undefined),
} as unknown as WahaHealthService;

const VALID_TOKEN = 'test_webhook_token_123';

const makeController = () => new WhatsappController(mockWhatsappService, mockHealth);

describe('WhatsappController', () => {
  beforeEach(() => {
    process.env.WAHA_WEBHOOK_TOKEN = VALID_TOKEN;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.WAHA_WEBHOOK_TOKEN;
  });

  describe('Autenticação do webhook', () => {
    it('rejeita se WAHA_WEBHOOK_TOKEN não estiver configurado', async () => {
      delete process.env.WAHA_WEBHOOK_TOKEN;
      await expect(makeController().waha({}, VALID_TOKEN)).rejects.toThrow(ForbiddenException);
    });

    it('rejeita token inválido', async () => {
      await expect(makeController().waha({}, 'token_errado')).rejects.toThrow(ForbiddenException);
    });

    it('rejeita sem token', async () => {
      await expect(makeController().waha({}, undefined)).rejects.toThrow(ForbiddenException);
    });

    it('aceita token válido e processa', async () => {
      const result = await makeController().waha({ event: 'message' }, VALID_TOKEN);
      expect(result).toBeDefined();
    });
  });

  describe('Roteamento de eventos', () => {
    it('ignora eventos que não são message, message.ack ou session.status', async () => {
      const result = await makeController().waha({ event: 'group.join' }, VALID_TOKEN);
      expect(result).toEqual({ ignored: true, reason: 'evento group.join' });
      expect(mockWhatsappService.process).not.toHaveBeenCalled();
    });

    it('encaminha session.status para o monitor de saúde', async () => {
      const result = await makeController().waha(
        { event: 'session.status', payload: { status: 'STOPPED' } },
        VALID_TOKEN,
      );
      expect(mockHealth.handleStatusEvent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: true });
      expect(mockWhatsappService.process).not.toHaveBeenCalled();
    });

    it('processa evento message', async () => {
      await makeController().waha({ event: 'message', payload: { text: 'Olá' } }, VALID_TOKEN);
      expect(mockWhatsappService.process).toHaveBeenCalledTimes(1);
    });

    it('processa evento message.ack via handleAck', async () => {
      await makeController().waha({ event: 'message.ack' }, VALID_TOKEN);
      expect(mockWhatsappService.handleAck).toHaveBeenCalledTimes(1);
      expect(mockWhatsappService.process).not.toHaveBeenCalled();
    });

    it('processa body sem event como message', async () => {
      await makeController().waha({ payload: { text: 'sem event explícito' } }, VALID_TOKEN);
      expect(mockWhatsappService.process).toHaveBeenCalledWith(
        { payload: { text: 'sem event explícito' } },
        'default',
      );
    });

    it('lê event de body.body.event (payload aninhado do WAHA)', async () => {
      await makeController().waha({ body: { event: 'message.ack' } }, VALID_TOKEN);
      expect(mockWhatsappService.handleAck).toHaveBeenCalledTimes(1);
    });
  });
});
