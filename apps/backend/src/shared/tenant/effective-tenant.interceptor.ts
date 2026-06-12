import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '@/infra/prisma/prisma.service';

// Nucleo de seguranca do Platform Admin (docs/features/platform-admin sec 5.2 + 6).
// Resolve o "tenant efetivo" e o grava em req.effectiveTenantId ANTES do handler.
// O @CurrentTenant() le esse valor ja resolvido -- controllers nunca leem o header cru.
const ACTING_HEADER = 'x-acting-tenant-id';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class EffectiveTenantInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    // So atua em HTTP (ignora WebSocket/RPC).
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const user = req.user; // setado pelo JwtAuthGuard; undefined em rotas publicas/webhooks
    const headerTenant =
      (req.headers?.[ACTING_HEADER] as string | undefined)?.trim() || null;

    // Default: sem tenant efetivo (rotas publicas seguem com o fallback do controller).
    req.effectiveTenantId = null;
    req.isActingAsTenant = false;

    if (user) {
      const isPlatformAdmin = user.tenantId === null || user.tenantId === undefined;

      if (!isPlatformAdmin) {
        // REGRA 1 (ADR 005): cliente comum -> tenant SEMPRE do token. Header IGNORADO.
        req.effectiveTenantId = user.tenantId;
      } else if (headerTenant) {
        // Platform admin "agindo como" um cliente: validar o tenant do header.
        const tenant = await this.prisma.tenant.findUnique({ where: { id: headerTenant } });
        if (!tenant || tenant.status !== 'active') {
          throw new ForbiddenException('Cliente (tenant) invalido ou inativo.');
        }
        req.effectiveTenantId = tenant.id;
        req.isActingAsTenant = true;

        // FASE 1: modo cliente e SOMENTE LEITURA (sem acoes/escritas destrutivas).
        // Rotas de plataforma (/api/admin/*) sao isentas: sao operacoes do dono,
        // nao escrita de dados do cliente (ex.: POST /admin/tenants/:id/enter).
        const url = (req.originalUrl || req.url || '') as string;
        const isPlatformRoute = url.startsWith('/api/admin');
        const method = (req.method || 'GET').toUpperCase();
        if (WRITE_METHODS.has(method) && !isPlatformRoute) {
          throw new ForbiddenException('Modo cliente esta em somente leitura nesta fase.');
        }
      }
      // platform admin sem header -> effectiveTenantId = null ("nenhum cliente selecionado");
      // o @CurrentTenant() bloqueia rotas com escopo de tenant nesse estado.
    }

    return next.handle();
  }
}
