/**
 * EmailOptOutService — ADR 021 D9 + Adendo
 *
 * Gera tokens de opt-out de e-mail (TTL 30 dias, uso único, DB-backed).
 * Fluxo:
 *   1. generateToken() — gerado ao enviar cada e-mail
 *   2. consume()       — chamado no POST /api/email/optout (confirma)
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { randomBytes } from 'crypto';

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

function genToken(): string {
  return randomBytes(18).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
}

export interface OptOutContext {
  contactId: string;
  tenantId: string;
  email: string;
}

@Injectable()
export class EmailOptOutService {
  private readonly logger = new Logger('EmailOptOutService');

  constructor(private readonly prisma: PrismaService) {}

  /** Gera um token de opt-out para incluir no rodapé do e-mail. */
  async generateToken(tenantId: string, contactId: string, email: string): Promise<string> {
    const token = genToken();
    const expiresAt = new Date(Date.now() + TTL_MS);

    await this.prisma.emailOptOutToken.create({
      data: { token, tenantId, contactId, email, expiresAt },
    });

    return token;
  }

  /** Valida o token (para o GET — apenas leitura, não consome). */
  async peek(token: string): Promise<OptOutContext | null> {
    const record = await this.prisma.emailOptOutToken.findUnique({ where: { token } });
    if (!record) return null;
    if (record.usedAt) return null;
    if (record.expiresAt < new Date()) return null;
    return { contactId: record.contactId, tenantId: record.tenantId, email: record.email };
  }

  /** Consome o token e efetiva o opt-out no contato. Retorna o email descadastrado ou null. */
  async consume(token: string): Promise<{ email: string; tenantId: string } | null> {
    const record = await this.prisma.emailOptOutToken.findUnique({ where: { token } });
    if (!record) return null;
    if (record.usedAt) {
      this.logger.warn(`EmailOptOut token já usado: ${token}`);
      return null;
    }
    if (record.expiresAt < new Date()) {
      this.logger.warn(`EmailOptOut token expirado: ${token}`);
      return null;
    }

    // Marca como usado + efetiva opt-out no contato (transação)
    await this.prisma.$transaction([
      this.prisma.emailOptOutToken.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
      this.prisma.contact.updateMany({
        where: { id: record.contactId, tenantId: record.tenantId },
        data: { status: 'opted_out', interestScore: 0, optOutAt: new Date() },
      }),
    ]);

    this.logger.log(`Email opt-out confirmado: ${record.email} (contact=${record.contactId})`);
    return { email: record.email, tenantId: record.tenantId };
  }
}
