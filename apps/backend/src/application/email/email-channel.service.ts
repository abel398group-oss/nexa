/**
 * EmailChannelService — caixas de e-mail do tenant. Usado pelo painel.
 *
 * PERFIS DE REMETENTE (10/08/2026)
 * ───────────────────────────────
 * Era uma caixa por tenant. Quando a prospecção passou a sair do endereço do
 * vendedor em vez do da Lia, isso virou um problema: trocar significava
 * sobrescrever a única linha, e a resposta a qualquer disparo antigo cairia numa
 * caixa que ninguém mais lê.
 *
 * Agora convivem várias. TODAS as ativas são LIDAS (o histórico não se perde na
 * troca); só a marcada com `isSender` ENVIA. Trocar o remetente é um clique, e a
 * senha de cada caixa é digitada uma vez, no cadastro dela.
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EmailCryptoService } from '@/shared/email-crypto/email-crypto.service';

export interface UpsertEmailChannelDto {
  /** Ausente = cria uma caixa nova. Presente = edita aquela. */
  id?: string;
  label?: string;
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
  imapSentMailbox?: string;
  isActive?: boolean;
  /** Marca esta caixa como a remetente já no salvamento. */
  isSender?: boolean;
}

// Campos que NUNCA voltam para o frontend (senhas)
const SAFE_SELECT = {
  id: true,
  tenantId: true,
  label: true,
  isSender: true,
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
  imapSentMailbox: true,
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

  /** Todas as caixas do tenant, a remetente primeiro. */
  async list(tenantId: string) {
    return this.prisma.emailChannel.findMany({
      where: { tenantId },
      orderBy: [{ isSender: 'desc' }, { createdAt: 'asc' }],
      select: SAFE_SELECT,
    });
  }

  /** A caixa que envia hoje. `null` quando o tenant ainda não configurou nenhuma. */
  async getSender(tenantId: string) {
    const caixas = await this.list(tenantId);
    return caixas.find((c: any) => c.isSender && c.isActive) ?? caixas[0] ?? null;
  }

  async upsert(tenantId: string, dto: UpsertEmailChannelDto) {
    const existing = dto.id
      ? await this.prisma.emailChannel.findFirst({ where: { id: dto.id, tenantId } })
      : null;
    if (dto.id && !existing) throw new NotFoundException('Caixa de e-mail não encontrada');

    // Senha vazia/ausente = "manter a senha atual" (só faz sentido no update).
    const smtpPass = dto.smtpPass && dto.smtpPass.length > 0 ? dto.smtpPass : undefined;
    const imapPass = dto.imapPass && dto.imapPass.length > 0 ? dto.imapPass : undefined;

    // Na PRIMEIRA configuração as senhas são obrigatórias — avisa em vez de quebrar (500).
    if (!existing && (!smtpPass || !imapPass)) {
      throw new BadRequestException(
        'Ao cadastrar uma caixa, informe a senha SMTP e a senha IMAP.',
      );
    }

    const base = {
      label: dto.label?.trim() || dto.fromEmail.split('@')[0] || 'Principal',
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
      // Vazio = descoberta automática pelo atributo \Sent. Ver EmailImapService.
      imapSentMailbox: dto.imapSentMailbox?.trim() || null,
      isActive: dto.isActive ?? true,
    };

    const salvo = existing
      ? await this.prisma.emailChannel.update({
          where: { id: existing.id },
          data: {
            ...base,
            ...(smtpPass ? { smtpPass: this.crypto.encrypt(smtpPass) } : {}),
            ...(imapPass ? { imapPass: this.crypto.encrypt(imapPass) } : {}),
          },
          select: SAFE_SELECT,
        })
      : await this.prisma.emailChannel.create({
          data: {
            tenantId,
            provider: 'smtp',
            ...base,
            // A primeira caixa do tenant já nasce remetente: um tenant com caixa
            // cadastrada e nenhuma remetente não manda e-mail nenhum, e o motivo
            // não apareceria em lugar nenhum da tela.
            isSender: false,
            smtpPass: this.crypto.encrypt(smtpPass as string),
            imapPass: this.crypto.encrypt(imapPass as string),
          },
          select: SAFE_SELECT,
        });

    const primeira = (await this.prisma.emailChannel.count({ where: { tenantId } })) === 1;
    if (dto.isSender || primeira) return this.setSender(tenantId, salvo.id);
    return salvo;
  }

  /**
   * Troca quem envia. É o seletor da tela.
   *
   * Numa transação porque o estado "duas remetentes" produziria envios saindo de
   * endereços diferentes conforme a ordem da consulta — o tipo de coisa que só
   * aparece dias depois, no e-mail de um lead.
   */
  async setSender(tenantId: string, id: string) {
    const alvo = await this.prisma.emailChannel.findFirst({ where: { id, tenantId } });
    if (!alvo) throw new NotFoundException('Caixa de e-mail não encontrada');
    if (!alvo.isActive) {
      throw new BadRequestException('Ative a caixa antes de torná-la a remetente.');
    }

    const [, atualizada] = await this.prisma.$transaction([
      this.prisma.emailChannel.updateMany({
        where: { tenantId, id: { not: id } },
        data: { isSender: false },
      }),
      this.prisma.emailChannel.update({
        where: { id },
        data: { isSender: true },
        select: SAFE_SELECT,
      }),
    ]);
    return atualizada;
  }

  async setActive(tenantId: string, id: string, isActive: boolean) {
    const ch = await this.prisma.emailChannel.findFirst({ where: { id, tenantId } });
    if (!ch) throw new NotFoundException('Caixa de e-mail não encontrada');
    // Desativar a remetente deixaria o tenant sem quem envie, e o disparo pararia
    // com "smtp_not_configured" — erro cujo motivo real (alguém desligou a caixa)
    // não aparece em lugar nenhum.
    if (!isActive && ch.isSender) {
      throw new BadRequestException(
        'Esta é a caixa que envia. Escolha outra como remetente antes de desativá-la.',
      );
    }
    return this.prisma.emailChannel.update({
      where: { id },
      data: { isActive },
      select: SAFE_SELECT,
    });
  }

  /** Remove uma caixa. A remetente não sai sem alguém assumir o lugar. */
  async remove(tenantId: string, id: string) {
    const ch = await this.prisma.emailChannel.findFirst({ where: { id, tenantId } });
    if (!ch) throw new NotFoundException('Caixa de e-mail não encontrada');
    if (ch.isSender) {
      throw new BadRequestException(
        'Esta é a caixa que envia. Escolha outra como remetente antes de excluí-la.',
      );
    }
    await this.prisma.emailChannel.delete({ where: { id } });
    return { ok: true };
  }

  // ── Support e-mail routing — SupportEmailRoute table ──────────────────────
  // category = null  →  default/fallback route
  // category = 'fiscal' | 'financeiro' | ...  →  category-specific route
  // Listener resolves: category-route → default-route → SUPPORT_EMAIL env → no-send.

  async listSupportRoutes(tenantId: string) {
    return this.prisma.supportEmailRoute.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }],
      select: { id: true, category: true, email: true, label: true, updatedAt: true },
    } as any);
  }

  async upsertSupportRoute(
    tenantId: string,
    category: string | null,
    email: string,
    label?: string,
  ) {
    return (this.prisma as any).supportEmailRoute.upsert({
      where: { tenantId_category: { tenantId, category: category ?? null } },
      update: { email, label: label ?? null, updatedAt: new Date() },
      create: { tenantId, category: category ?? null, email, label: label ?? null },
      select: { id: true, category: true, email: true, label: true, updatedAt: true },
    });
  }

  async deleteSupportRoute(id: string, tenantId: string): Promise<void> {
    await (this.prisma as any).supportEmailRoute.deleteMany({
      where: { id, tenantId },
    });
  }
}
