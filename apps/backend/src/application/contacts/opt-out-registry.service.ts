/**
 * Lista de bloqueio (LGPD) — quem pediu para não receber mais.
 *
 * Por que não basta o `status` do contato:
 *
 * Em 2026-08-03 a Patrícia pediu para parar, o sistema marcou `opted_out`
 * corretamente e confirmou por mensagem. Depois a base de contatos foi limpa e o
 * CSV original reimportado — ela voltou como `active` e recebeu campanha de novo,
 * 3 horas após ter escrito "vou processar esta empresa por perturbação".
 *
 * O pedido dela morava dentro do registro que foi apagado. Esta tabela guarda o
 * pedido FORA do contato: apagar contato não apaga o bloqueio.
 *
 * Regra de uso: **nunca** limpar `opt_out_records` junto com contatos.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

@Injectable()
export class OptOutRegistryService {
  private readonly logger = new Logger('OptOutRegistry');

  constructor(private readonly prisma: PrismaService) {}

  /** Registra o bloqueio. Idempotente — pedir duas vezes não gera erro. */
  async register(
    tenantId: string,
    alvo: { phone?: string | null; email?: string | null },
    reason = 'pedido',
  ): Promise<void> {
    const phone = (alvo.phone ?? '').replace(/\D/g, '') || null;
    const email = (alvo.email ?? '').trim().toLowerCase() || null;
    if (!phone && !email) return;

    try {
      await this.prisma.optOutRecord.upsert({
        where: phone
          ? { tenantId_phone: { tenantId, phone } }
          : { tenantId_email: { tenantId, email: email as string } },
        update: {}, // já bloqueado: mantém o registro original (e a data)
        create: { tenantId, phone, email, reason },
      });
      this.logger.log(`bloqueio registrado (${reason}): ${phone ?? email}`);
    } catch (e: any) {
      // Não pode derrubar o fluxo de opt-out — o contato já foi marcado.
      this.logger.error(`falha ao registrar bloqueio de ${phone ?? email}: ${e?.message}`);
    }
  }

  /** Dos telefones passados, quais estão bloqueados. */
  async blockedPhones(tenantId: string, phones: string[]): Promise<Set<string>> {
    const limpos = phones.map((p) => (p ?? '').replace(/\D/g, '')).filter(Boolean);
    if (!limpos.length) return new Set();
    const rows = await this.prisma.optOutRecord.findMany({
      where: { tenantId, phone: { in: limpos } },
      select: { phone: true },
    });
    return new Set(rows.map((r) => r.phone as string));
  }

  /** Dos e-mails passados, quais estão bloqueados. */
  async blockedEmails(tenantId: string, emails: string[]): Promise<Set<string>> {
    const limpos = emails.map((e) => (e ?? '').trim().toLowerCase()).filter(Boolean);
    if (!limpos.length) return new Set();
    const rows = await this.prisma.optOutRecord.findMany({
      where: { tenantId, email: { in: limpos } },
      select: { email: true },
    });
    return new Set(rows.map((r) => (r.email as string).toLowerCase()));
  }

  /** Checagem unitária — usada na hora do envio (defesa em profundidade). */
  async isBlocked(tenantId: string, alvo: { phone?: string | null; email?: string | null }): Promise<boolean> {
    const phone = (alvo.phone ?? '').replace(/\D/g, '') || null;
    const email = (alvo.email ?? '').trim().toLowerCase() || null;
    if (!phone && !email) return false;
    const row = await this.prisma.optOutRecord.findFirst({
      where: {
        tenantId,
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
      },
      select: { id: true },
    });
    return !!row;
  }
}
