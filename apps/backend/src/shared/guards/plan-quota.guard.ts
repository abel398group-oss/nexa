/**
 * PlanQuotaGuard — bloqueia operações de escrita quando o tenant atingiu o limite do plano.
 *
 * Uso: decorar o endpoint com @UsePlanQuota('contacts') e o guard verifica o limite antes
 * de chamar o handler. Retorna 402 (Payment Required) se o limite foi atingido.
 *
 * Recursos suportados: 'contacts' | 'campaigns' | 'messages_month'
 *
 * A tabela plan_limits é opcional — sem linha, sem limite. Isso permite ativar gradualmente
 * sem precisar popular registros para todos os tenants existentes.
 *
 * O guard não cobre leitura/listagem, somente criação (POST). Aplique só nos endpoints
 * de criação (ex.: POST /contacts, POST /campaigns, POST /sender/send).
 */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@/infra/prisma/prisma.service';

export const QUOTA_RESOURCE_KEY = 'quotaResource';
export type QuotaResource = 'contacts' | 'campaigns' | 'messages_month';

/** Decora o endpoint que consome quota de um recurso. */
export const UsePlanQuota = (resource: QuotaResource) =>
  SetMetadata(QUOTA_RESOURCE_KEY, resource);

@Injectable()
export class PlanQuotaGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<QuotaResource>(QUOTA_RESOURCE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // Guard sem decorador → passa (não limita)
    if (!resource) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: { tenantId?: string } }>();
    const tenantId = req.user?.tenantId;
    if (!tenantId) return true; // sem tenant → JWT guard já rejeitou antes

    const limit = await this.prisma.planLimit.findUnique({ where: { tenantId } });
    if (!limit) return true; // sem registro → sem limite

    const exceeded = await this.isExceeded(tenantId, resource, limit);
    if (exceeded) {
      throw new HttpException(
        `Limite do plano atingido: ${resource}. Faça upgrade para continuar.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }

  private async isExceeded(
    tenantId: string,
    resource: QuotaResource,
    limit: { maxContacts: number | null; maxCampaigns: number | null; maxMessagesMonth: number | null },
  ): Promise<boolean> {
    switch (resource) {
      case 'contacts': {
        if (limit.maxContacts === null) return false;
        const count = await this.prisma.contact.count({ where: { tenantId } });
        return count >= limit.maxContacts;
      }
      case 'campaigns': {
        if (limit.maxCampaigns === null) return false;
        const count = await this.prisma.campaign.count({ where: { tenantId } });
        return count >= limit.maxCampaigns;
      }
      case 'messages_month': {
        if (limit.maxMessagesMonth === null) return false;
        // Contagem de mensagens do mês corrente via AiMessage
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const count = await this.prisma.aiMessage.count({
          where: { tenantId, createdAt: { gte: startOfMonth } },
        });
        return count >= limit.maxMessagesMonth;
      }
      default:
        return false;
    }
  }
}
