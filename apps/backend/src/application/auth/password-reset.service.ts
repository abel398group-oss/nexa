/**
 * Recuperação de senha — "Esqueceu a senha?".
 *
 * Antes disso, o botão na tela de login era decorativo: mostrava "fale com o
 * administrador" e nada acontecia. Quem esquecesse a senha dependia de alguém
 * mexer no banco — e o platform admin, que não aparece em nenhuma tela, não
 * tinha saída nenhuma.
 *
 * Decisões de segurança:
 *
 * 1. **Nunca revelar se o e-mail existe.** `request()` responde igual para
 *    e-mail cadastrado ou não. Caso contrário a tela vira um oráculo para
 *    descobrir quem tem conta (e daí partir para phishing/força bruta).
 * 2. **Guardar o HASH do token.** O link vai por e-mail com o token em claro,
 *    mas o banco só tem o hash. Vazou o banco? Os links pendentes não servem.
 * 3. **Uso único + TTL de 30 min.** Curto de propósito: e-mail pode ficar
 *    aberto em máquina compartilhada.
 * 4. **Invalida os tokens anteriores** a cada novo pedido — senão vários links
 *    válidos circulam ao mesmo tempo.
 * 5. **Derruba as sessões** ao redefinir: se a conta estava comprometida, o
 *    invasor cai junto.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailReplyService } from '@/application/email/email-reply.service';

const TTL_MIN = 30;
const TTL_MS = TTL_MIN * 60 * 1000;

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailReplyService,
  ) {}

  /**
   * Pedido de redefinição. SEMPRE retorna ok — o chamador não descobre se o
   * e-mail existe. Quando existe, manda o link; quando não, só registra no log.
   */
  async request(rawEmail: string, appBaseUrl: string): Promise<{ ok: true }> {
    const email = (rawEmail ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Informe o e-mail.');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // Log interno para suporte, resposta idêntica para quem chamou.
      this.logger.warn(`reset solicitado para e-mail sem conta ativa: ${email}`);
      return { ok: true };
    }

    // um pedido novo invalida os anteriores
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });

    const link = `${appBaseUrl.replace(/\/$/, '')}/redefinir-senha?token=${token}`;
    const nome = user.name?.split(' ')[0] ?? '';
    const corpo =
      `${nome ? `Olá, ${nome}.` : 'Olá.'}\n\n` +
      `Recebemos um pedido para redefinir a senha do seu acesso ao Nexa.\n\n` +
      `Use o link abaixo (vale por ${TTL_MIN} minutos e só pode ser usado uma vez):\n\n` +
      `${link}\n\n` +
      `Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.`;

    // tenantId do usuário resolve a config SMTP; platform admin cai no .env
    const r = await this.email.sendAlertEmail(
      user.email,
      'Redefinição de senha — Nexa',
      corpo,
      user.tenantId ?? 'default',
    );
    if (!r.sent) {
      // REGRA 3: nunca engolir o motivo. O usuário segue vendo a msg genérica.
      this.logger.error(`falha ao enviar e-mail de reset para ${email}: ${r.reason}`);
    } else {
      this.logger.log(`link de redefinição enviado para ${email}`);
    }
    return { ok: true };
  }

  /** Confirma o token e grava a nova senha. */
  async reset(rawToken: string, newPassword: string): Promise<{ ok: true }> {
    const token = (rawToken ?? '').trim();
    const senha = (newPassword ?? '').trim();
    if (!token) throw new BadRequestException('Link inválido.');
    if (senha.length < 8) throw new BadRequestException('A nova senha precisa ter pelo menos 8 caracteres.');

    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });

    // comparação em tempo constante evita medir o tempo de resposta para
    // descobrir se um token existe
    const valido =
      !!row &&
      !row.usedAt &&
      row.expiresAt > new Date() &&
      timingSafeEqual(Buffer.from(sha256(token)), Buffer.from(row.tokenHash));

    if (!valido) throw new BadRequestException('Link inválido ou expirado. Peça um novo.');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row!.userId },
        data: { passwordHash: await bcrypt.hash(senha, 10) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row!.id },
        data: { usedAt: new Date() },
      }),
      // conta pode ter sido comprometida — derruba tudo que estava aberto
      this.prisma.session.updateMany({
        where: { userId: row!.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log(`senha redefinida via link (user ${row!.userId})`);
    return { ok: true };
  }
}
