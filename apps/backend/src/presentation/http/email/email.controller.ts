/**
 * EmailController — ADR 021
 *
 * POST /api/webhooks/email     — webhook Mailgun inbound
 * GET  /api/email/optout       — renderiza página de confirmação (2 passos, evita prefetch)
 * POST /api/email/optout       — efetiva o descadastro
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { EmailService } from '@/application/email/email.service';
import { EmailOptOutService } from '@/application/email/email-optout.service';

@Controller()
export class EmailController {
  private readonly logger = new Logger('EmailController');

  constructor(
    private readonly email: EmailService,
    private readonly optout: EmailOptOutService,
  ) {}

  // ── Mailgun Inbound Route ───────────────────────────────────────────────────
  // Mailgun POST o payload como multipart/form-data ou application/x-www-form-urlencoded.
  // Configurar em Mailgun: Receiving → Routes → Forward to: <base_url>/api/webhooks/email
  //
  // C2 (auditoria 2026-07-08): webhook server-to-server (Mailgun) isento do
  // ThrottlerGuard global — um lote de e-mails inbound não pode ser descartado por
  // 429. As páginas de opt-out (GET/POST abaixo) NÃO são isentas de propósito:
  // são públicas e voltadas ao usuário, então mantêm o throttle como anti-abuso.
  @SkipThrottle()
  @Post('webhooks/email')
  @HttpCode(200)
  async inbound(@Body() body: Record<string, string>) {
    this.logger.log(`Mailgun inbound de: ${body['from'] ?? body['From'] ?? 'desconhecido'}`);
    // Mailgun aguarda 200 OK em < 5s; processamos de forma síncrona por enquanto.
    // Para escala, substituir por fila (Bull/BullMQ) — fase 2.
    const result = await this.email.process(body);
    return result;
  }

  // ── Opt-out — GET (confirmação, não descadastra — evita prefetch) ───────────
  @Get('email/optout')
  async optOutPage(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      return res.status(400).send(this.renderPage('Link inválido', 'Este link de descadastro não é válido.'));
    }

    const ctx = await this.optout.peek(token);

    if (!ctx) {
      return res.status(410).send(
        this.renderPage('Link expirado', 'Este link de descadastro expirou ou já foi utilizado.'),
      );
    }

    // Renderiza formulário de confirmação (POST confirma)
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Descadastro de e-mail — HiperTMS</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f8f9fa; }
    .card { background: #fff; border-radius: 12px; padding: 40px;
            max-width: 440px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    h1 { font-size: 1.25rem; color: #1a1a2e; margin-bottom: 8px; }
    p  { color: #555; font-size: 0.95rem; line-height: 1.5; }
    .email { background: #f0f4ff; border-radius: 6px; padding: 6px 12px;
             font-size: 0.9rem; color: #3b5bdb; display: inline-block; margin: 12px 0; }
    button { background: #e03131; color: #fff; border: none; border-radius: 8px;
             padding: 12px 28px; font-size: 1rem; cursor: pointer; margin-top: 20px;
             transition: background .15s; }
    button:hover { background: #c92a2a; }
    .cancel { display: block; margin-top: 14px; color: #888; font-size: 0.85rem; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Confirmar descadastro</h1>
    <p>Deseja parar de receber mensagens da Lia / HiperTMS para:</p>
    <span class="email">${ctx.email}</span>
    <form method="POST" action="/api/email/optout">
      <input type="hidden" name="token" value="${token}">
      <button type="submit">Sim, quero me descadastrar</button>
    </form>
    <a class="cancel" href="/">Cancelar — voltar ao site</a>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  // ── Opt-out — POST (efetiva o descadastro) ──────────────────────────────────
  @Post('email/optout')
  @HttpCode(200)
  async optOutConfirm(@Body() body: { token?: string }, @Res() res: Response) {
    const token = body?.token;
    if (!token) {
      return res.status(400).send(this.renderPage('Erro', 'Token não fornecido.'));
    }

    const result = await this.optout.consume(token);

    if (!result) {
      return res.status(410).send(
        this.renderPage('Link inválido', 'Este link já foi usado ou expirou.'),
      );
    }

    this.logger.log(`Email opt-out confirmado via POST: ${result.email}`);

    return res.status(200).send(
      this.renderPage(
        'Descadastro confirmado ✅',
        `O endereço <strong>${result.email}</strong> foi descadastrado com sucesso.<br>
         Você não receberá mais mensagens automáticas da Lia.`,
      ),
    );
  }

  // Página HTML simples para erros / confirmação
  private renderPage(title: string, message: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — HiperTMS</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f8f9fa; }
    .card { background: #fff; border-radius: 12px; padding: 40px;
            max-width: 440px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    h1 { font-size: 1.25rem; color: #1a1a2e; }
    p  { color: #555; font-size: 0.95rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}
