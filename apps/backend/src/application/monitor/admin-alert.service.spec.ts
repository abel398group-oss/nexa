import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdminAlertService } from './admin-alert.service';

// ─── AdminAlertService — aviso ao admin nos 2 canais (WhatsApp + e-mail) ─────

const nodemailerSend = vi.fn().mockResolvedValue(undefined);
vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: nodemailerSend }),
}));

function makeService(opts: { waSent?: boolean; emailChannel?: any } = {}) {
  const prisma = {
    emailChannel: { findFirst: vi.fn().mockResolvedValue(opts.emailChannel ?? null) },
  } as any;
  const waha = { sendText: vi.fn().mockResolvedValue({ sent: opts.waSent ?? true }) } as any;
  const crypto = { decrypt: vi.fn((s: string) => `dec:${s}`) } as any;
  const svc = new AdminAlertService(prisma, waha, crypto);
  return { svc, prisma, waha, crypto };
}

describe('AdminAlertService.notifyAdmin', () => {
  const orig = { ...process.env };
  beforeEach(() => {
    nodemailerSend.mockClear();
    delete process.env.ALERT_ADMIN_PHONE;
    delete process.env.ALERT_ADMIN_EMAIL;
    delete process.env.EMAIL_SMTP_HOST;
    delete process.env.EMAIL_SMTP_USER;
    delete process.env.EMAIL_SMTP_PASS;
  });
  afterEach(() => {
    process.env = { ...orig };
  });

  it('WhatsApp: envia pro ALERT_ADMIN_PHONE (só dígitos, com título em negrito)', async () => {
    process.env.ALERT_ADMIN_PHONE = '5511917747429';
    const { svc, waha } = makeService();
    const r = await svc.notifyAdmin('WAHA caiu', 'sessão fora há 5min');
    expect(r.whatsapp).toBe(true);
    const [phone, text] = waha.sendText.mock.calls[0];
    expect(phone).toBe('5511917747429');
    expect(text).toContain('*WAHA caiu*');
    expect(text).toContain('sessão fora há 5min');
  });

  it('número inválido (< 12 dígitos) → não envia WhatsApp', async () => {
    process.env.ALERT_ADMIN_PHONE = '123';
    const { svc, waha } = makeService();
    const r = await svc.notifyAdmin('x', 'y');
    expect(r.whatsapp).toBe(false);
    expect(waha.sendText).not.toHaveBeenCalled();
  });

  it('e-mail: usa fallback .env quando não há canal no banco', async () => {
    process.env.ALERT_ADMIN_EMAIL = 'abel@empresa.com';
    process.env.EMAIL_SMTP_HOST = 'smtp.x.com';
    process.env.EMAIL_SMTP_USER = 'user@x.com';
    process.env.EMAIL_SMTP_PASS = 'senha';
    const { svc } = makeService();
    const r = await svc.notifyAdmin('Escala', 'conexões 20/25');
    expect(r.email).toBe(true);
    const sent = nodemailerSend.mock.calls[0][0];
    expect(sent.to).toBe('abel@empresa.com');
    expect(sent.subject).toBe('[Nexa] Escala');
    expect(sent.text).toContain('conexões 20/25');
  });

  it('e-mail: prefere o canal SMTP salvo no banco (senha decriptada)', async () => {
    process.env.ALERT_ADMIN_EMAIL = 'abel@empresa.com';
    const { svc, crypto } = makeService({
      emailChannel: { smtpHost: 'db.smtp', smtpUser: 'db@x.com', smtpPass: 'ENC:xyz', smtpPort: 587, smtpSecure: false, fromName: 'Monitor' },
    });
    const r = await svc.notifyAdmin('x', 'y');
    expect(r.email).toBe(true);
    expect(crypto.decrypt).toHaveBeenCalledWith('ENC:xyz');
  });

  it('sem ALERT_ADMIN_EMAIL → não envia e-mail', async () => {
    const { svc } = makeService();
    const r = await svc.notifyAdmin('x', 'y');
    expect(r.email).toBe(false);
    expect(nodemailerSend).not.toHaveBeenCalled();
  });

  it('nenhum canal configurado → { whatsapp:false, email:false }, sem quebrar', async () => {
    const { svc } = makeService();
    const r = await svc.notifyAdmin('x', 'y');
    expect(r).toEqual({ whatsapp: false, email: false });
  });

  it('falha do WhatsApp não impede o e-mail (canais independentes)', async () => {
    process.env.ALERT_ADMIN_PHONE = '5511917747429';
    process.env.ALERT_ADMIN_EMAIL = 'abel@empresa.com';
    process.env.EMAIL_SMTP_HOST = 'smtp.x.com';
    process.env.EMAIL_SMTP_USER = 'user@x.com';
    process.env.EMAIL_SMTP_PASS = 'senha';
    const { svc, waha } = makeService();
    waha.sendText.mockRejectedValue(new Error('waha down'));
    const r = await svc.notifyAdmin('x', 'y');
    expect(r.whatsapp).toBe(false);
    expect(r.email).toBe(true);
  });
});
