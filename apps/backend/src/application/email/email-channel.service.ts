/**
 * EmailChannelService — CRUD do canal de e-mail por tenant.
 * Usado pelo painel de configurações.
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';

export interface UpsertEmailChannelDto {
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUser: string;
  imapPass?: string;
  imapMailbox?: string;
  isActive?: boolean;
}

// Campos que NUNCA voltam para o frontend (senhas)
const SAFE_SELECT = {
  id: true,
  tenantId: true,
  provider: true,
  fromEmail: true,
  fromName: true,
  replyTo: true,
  smtpHost: true,
  smtpPort: true,
  smtpUser: true,
  smtpSecure: true,
  imapHost: true,
  imapPort: true,
  imapUser: true,
  imapMailbox: true,
  isActive: true,
  lastPollAt: true,
  createdAt: true,
  updatedAt: true,
  // smtpPass e imapPass: NÃO incluídos
};

@Injectable()
export class EmailChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EmailCryptoService,
  ) {}

  async get(tenantId: string) {
    return this.prisma.emailChannel.findUnique({
      where: { tenantId },
      select: SAFE_SELECT,
    });
  }

  async upsert(tenantId: string, dto: UpsertEmailChannelDto) {
    const existing = await this.prisma.emailChannel.findUnique({ where: { tenantId } });

    // Senha vazia/ausente = "manter a senha atual" (só faz sentido no update).
    const smtpPass = dto.smtpPass && dto.smtpPass.length > 0 ? dto.smtpPass : undefined;
    const imapPass = dto.imapPass && dto.imapPass.length > 0 ? dto.imapPass : undefined;

    // Na PRIMEIRA configuração as senhas são obrigatórias — avisa em vez de quebrar (500).
    if (!existing && (!smtpPass || !imapPass)) {
      throw new BadRequestException(
        'Na primeira configuração do canal, informe a senha SMTP e a senha IMAP.',
      );
    }

    const base = {
      fromEmail: dto.fromEmail,
      fromName: dto.fromName ?? 'Lia HiperTMS',
      replyTo: dto.replyTo ?? null,
      smtpHost: dto.smtpHost ?? 'mail.hipertms.com.br',
      smtpPort: dto.smtpPort ?? 465,
      smtpUser: dto.smtpUser,
      smtpSecure: dto.smtpSecure ?? true,
      imapHost: dto.imapHost ?? 'mail.hipertms.com.br',
      imapPort: dto.imapPort ?? 993,
      imapUser: dto.imapUser,
      imapMailbox: dto.imapMailbox ?? 'INBOX',
      isActive: dto.isActive ?? true,
    };

    const result = await this.prisma.emailChannel.upsert({
      where: { tenantId },
      // update: só troca a senha se uma nova foi enviada (vazio mantém a atual)
      update: {
        ...base,
        ...(smtpPass ? { smtpPass: this.crypto.encrypt(smtpPass) } : {}),
        ...(imapPass ? { imapPass: this.crypto.encrypt(imapPass) } : {}),
      },
      create: {
        tenantId,
        provider: 'smtp',
        ...base,
        smtpPass: this.crypto.encrypt(smtpPass as string),
        imapPass: this.crypto.encrypt(imapPass as string),
      },
      select: SAFE_SELECT,
    });

    return result;
  }

  async setActive(tenantId: string, isActive: boolean) {
    const ch = await this.prisma.emailChannel.findUnique({ where: { tenantId } });
    if (!ch) throw new NotFoundException('Canal de e-mail não configurado');
    return this.prisma.emailChannel.update({
      where: { tenantId },
      data: { isActive },
      select: SAFE_SELECT,
    });
  }
}
