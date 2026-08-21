/**
 * EmailOptOutService — ADR 021 D9 + Adendo
 *
 * Gera tokens de opt-out de e-mail (DB-backed).
 * Fluxo:
 *   1. generateToken() — gerado ao enviar cada e-mail
 *   2. consume()       — chamado no POST /api/email/optout (confirma)
 *
 * DUAS REGRAS QUE PARECEM FROUXAS E SÃO O CONTRÁRIO (09/08/2026)
 * ──────────────────────────────────────────────────────────────
 * O TTL era 30 dias e o token era de uso único. Quem clicasse em "Cancelar
 * inscrição" no dia 31 — ou clicasse duas vezes — recebia uma página de erro 410.
 * A pessoa que quer sair e não consegue faz a única coisa que sobra: marca como
 * spam. E reclamação de spam é a métrica mais cara que existe (o Google exige
 * abaixo de 0,10%), enquanto um token de descadastro vazado não faz nada além de…
 * descadastrar. O risco estava invertido.
 *
 * Então: TTL longo (o suficiente para cobrir qualquer e-mail que ainda esteja na
 * caixa de alguém) e `consume()` IDEMPOTENTE — token já usado ou vencido continua
 * descadastrando e devolvendo sucesso. Todo caminho que sai daqui tem que terminar
 * em "você não recebe mais", nunca em erro.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { OptOutRegistryService } from '@/application/contacts/opt-out-registry.service';
import { randomBytes } from 'crypto';

/**
 * ~2 anos. Não é segurança, é alcance: e-mail arquivado é reaberto muito depois, e
 * o botão nativo do Gmail/Outlook tem que continuar funcionando quando isso
 * acontecer.
 */
const TTL_DAYS = 730;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly optOutRegistry: OptOutRegistryService,
  ) {}

  /** Gera um token de opt-out para incluir no rodapé do e-mail. */
  async generateToken(tenantId: string, contactId: string, email: string): Promise<string> {
    const token = genToken();
    const expiresAt = new Date(Date.now() + TTL_MS);

    await this.prisma.emailOptOutToken.create({
      data: { token, tenantId, contactId, email, expiresAt },
    });

    return token;
  }

  /**
   * Lê o token para a página de confirmação (GET — não consome).
   *
   * Token desconhecido é o único caso que devolve `null`: aí não há o que mostrar.
   * Vencido ou já usado devolve o contexto com a marca correspondente, porque a
   * página tem que conseguir dizer "você já está descadastrado" em vez de "link
   * inválido" — ver o cabeçalho deste arquivo.
   */
  async peek(token: string): Promise<(OptOutContext & { jaUsado: boolean; vencido: boolean }) | null> {
    const record = await this.prisma.emailOptOutToken.findUnique({ where: { token } });
    if (!record) return null;
    return {
      contactId: record.contactId,
      tenantId: record.tenantId,
      email: record.email,
      jaUsado: !!record.usedAt,
      vencido: record.expiresAt < new Date(),
    };
  }

  /**
   * Efetiva o opt-out. Idempotente: só devolve `null` para token desconhecido.
   *
   * Token vencido ou já usado descadastra do mesmo jeito (o `updateMany` é
   * idempotente por natureza) e devolve sucesso — o objetivo é que ninguém que
   * queira sair termine numa página de erro. Ver o cabeçalho deste arquivo.
   */
  async consume(token: string): Promise<{ email: string; tenantId: string } | null> {
    const record = await this.prisma.emailOptOutToken.findUnique({ where: { token } });
    if (!record) return null;

    if (record.usedAt) {
      this.logger.log(`EmailOptOut token reapresentado (${record.email}) — reconfirmando descadastro`);
    } else if (record.expiresAt < new Date()) {
      this.logger.log(`EmailOptOut token vencido (${record.email}) — descadastrando assim mesmo`);
    }

    // Marca como usado + efetiva opt-out no contato (transação).
    // `usedAt` só é gravado na primeira vez, para o log preservar quando de fato
    // a pessoa pediu para sair.
    await this.prisma.$transaction([
      this.prisma.emailOptOutToken.updateMany({
        where: { token, usedAt: null },
        data: { usedAt: new Date() },
      }),
      // `status: { not: 'opted_out' }` preserva o `optOutAt` original numa segunda
      // apresentação do link — a data em que a pessoa pediu para sair é registro,
      // não deve se mover porque ela clicou de novo.
      this.prisma.contact.updateMany({
        where: { id: record.contactId, tenantId: record.tenantId, status: { not: 'opted_out' } },
        data: { status: 'opted_out', interestScore: 0, optOutAt: new Date() },
      }),
    ]);

    // Registro PERMANENTE (LGPD), fora do contato: apagar a base e reimportar o CSV
    // não pode trazer de volta quem pediu para sair — ver opt-out-registry.service.ts
    // (caso Patrícia, 03/08/2026; o canal WhatsApp registra desde então, o e-mail não).
    // `register` nunca lança — o descadastro no contato acima já aconteceu.
    await this.optOutRegistry.register(record.tenantId, { email: record.email }, 'pedido_email');

    this.logger.log(`Email opt-out confirmado: ${record.email} (contact=${record.contactId})`);
    return { email: record.email, tenantId: record.tenantId };
  }
}
