import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { randomBytes } from 'crypto';

// Gera token URL-safe de 8 chars sem dependência externa
function genToken(): string {
  return randomBytes(6).toString('base64url').slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '0');
}

const TOKEN_TTL_MS_DEFAULT = 5 * 60 * 1000;   // 5 minutos (portal session, handoff)
export const TOKEN_TTL_MS_WEBCHAT = 15 * 60 * 1000; // 15 minutos (ADR 027 — web_chat widget)

// Token TMS_SERVICE_TOKEN — server-to-server, nunca exposto ao browser
//
// SEGURANÇA (fix pós-auditoria do módulo de suporte): sem TMS_SERVICE_TOKEN
// configurado, o handoff aceitava QUALQUER token — risco real de produção,
// pois um atacante poderia forjar identidade de cliente (ADR 022). Em
// produção isso agora é fail-closed: aborta a criação do handoff em vez de
// aceitar sem autenticação. Em dev/test, mantém o comportamento permissivo
// (com warning) para não travar o ambiente local antes do token existir.
function validateServiceToken(provided: string | undefined): void {
  const expected = process.env.TMS_SERVICE_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  if (!expected) {
    if (isProd) {
      Logger.error(
        'TMS_SERVICE_TOKEN não configurado em produção — handoff bloqueado (fail-closed)',
        'HandoffService',
      );
      throw new UnauthorizedException('Handoff indisponível: autenticação de serviço não configurada');
    }
    // Não configurado fora de produção: aceita qualquer token (avisa no log)
    Logger.warn('TMS_SERVICE_TOKEN não configurado — handoff sem autenticação (dev only)', 'HandoffService');
    return;
  }
  if (!provided || provided !== expected) {
    throw new UnauthorizedException('TMS_SERVICE_TOKEN inválido');
  }
}

export interface CreateHandoffInput {
  externalId: string;
  tenantId: string;
  name?: string; // nome do usuário logado no TMS (identidade segura)
  page?: string;
  errorCode?: string;
  isManager?: boolean; // true = gestor (pode ver chamados da empresa)
  serviceToken?: string;
  /** TTL em ms. Default: 5 min (portal). Web chat usa TOKEN_TTL_MS_WEBCHAT (15 min). */
  ttlMs?: number;
}

export interface HandoffContext {
  externalId: string;
  tenantId: string;
  name?: string | null;
  page?: string | null;
  errorCode?: string | null;
  isManager: boolean;
}

@Injectable()
export class HandoffService {
  private readonly logger = new Logger('HandoffService');

  constructor(private readonly prisma: PrismaService) {}

  // Gerado pelo Nexa a pedido do TMS (server-to-server).
  async create(input: CreateHandoffInput): Promise<{ token: string; expiresIn: number }> {
    validateServiceToken(input.serviceToken);

    if (!input.externalId || !input.tenantId) {
      throw new BadRequestException('externalId e tenantId são obrigatórios');
    }

    const token = genToken();
    const ttl = input.ttlMs ?? TOKEN_TTL_MS_DEFAULT;
    const expiresAt = new Date(Date.now() + ttl);

    // Usa o tenant do Nexa configurado no env, não o tenantId que o TMS envia
    // (o TMS manda o próprio UUID de tenant, diferente do tenant do Nexa).
    // NEXA_DEFAULT_TENANT_ID deve ser o tenantId do operador no Nexa (ex: 'default').
    const nexaTenantId = process.env.NEXA_DEFAULT_TENANT_ID ?? input.tenantId;

    await this.prisma.handoffToken.create({
      data: {
        token,
        tenantId: nexaTenantId,
        externalId: input.externalId,
        name: input.name ?? null,
        page: input.page ?? null,
        errorCode: input.errorCode ?? null,
        isManager: input.isManager ?? false,
        expiresAt,
      },
    });

    this.logger.log(`Handoff token criado: ${token} | tenant=${input.tenantId} | ext=${input.externalId} | nome=${input.name ?? '-'} | page=${input.page ?? '-'}`);
    return { token, expiresIn: ttl / 1000 };
  }

  // Consome o token (uso único). Retorna o contexto ou null se inválido/expirado.
  async consume(token: string): Promise<HandoffContext | null> {
    const record = await this.prisma.handoffToken.findUnique({ where: { token } });

    if (!record) return null;
    if (record.usedAt) {
      this.logger.warn(`Handoff token já usado: ${token}`);
      return null;
    }
    if (record.expiresAt < new Date()) {
      this.logger.warn(`Handoff token expirado: ${token}`);
      return null;
    }

    // Marca como usado (uso único)
    await this.prisma.handoffToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    return {
      externalId: record.externalId,
      tenantId: record.tenantId,
      name: record.name,
      page: record.page,
      errorCode: record.errorCode,
      isManager: record.isManager,
    };
  }
}
