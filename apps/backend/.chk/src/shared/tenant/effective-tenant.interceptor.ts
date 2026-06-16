import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AuditService } from '@/shared/audit/audit.service';

// Nucleo de seguranca do Platform Admin (docs/features/platform-admin sec 5.2 + 6).
// Resolve o "tenant efetivo" em req.effectiveTenantId ANTES do handler.
// Fase 2: escrita em modo cliente e PERMITIDA, porem AUDITADA. Acoes irreversiveis
// (delete, disparo de campanha) exigem override explicito (quebra de vidro).
const ACTING_HEADER = 'x-acting-tenant-id';
const OVERRIDE_HEADER = 'x-acting-override';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Acoes irreversiveis bloqueadas por padrao em modo cliente (liberadas com override).
export function isDestructiveAction(method: string, url: string): boolean {
  if (method === 'DELETE') return true; // qualquer exclusao
  if (method === 'POST' && /\/contacts\/bulk-delete\b/.test(url)) return true; // exclusao em lote
  if (method === 'POST' && /\/campaigns\/[^/]+\/start\b/.test(url)) return true; // disparar campanha
  return false;
}

@Injectable()
export class EffectiveTenantInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    if (ctx.getType() !== 'http') return next.handle();

    const req = ctx.switchToHttp().getRequest();
    req.effectiveTenantId = null;
    req.isActingAsTenant = false;

    const user = req.user; // undefined em rotas publicas/webhooks
    if (!user) return next.handle();

    const isPlatformAdmin = user.tenantId === null || user.tenantId === undefined;
    if (!isPlatformAdmin) {
      // REGRA 1 (ADR 005): cliente comum -> tenant SEMPRE do token. Header IGNORADO.
      req.effectiveTenantId = user.tenantId;
      return next.handle();
    }

    // Platform admin: so age num cliente via header validado.
    const headerTenant = (req.headers?.[ACTING_HEADER] as string | undefined)?.trim() || null;
    if (!headerTenant) return next.handle(); // nenhum cliente selecionado

    const tenant = await this.prisma.tenant.findUnique({ where: { id: headerTenant } });
    if (!tenant || tenant.status !== 'active') {
      throw new ForbiddenException('Cliente (tenant) invalido ou inativo.');
    }
    req.effectiveTenantId = tenant.id;
    req.isActingAsTenant = true;

    const url = (req.originalUrl || req.url || '') as string;
    const method = (req.method || 'GET').toUpperCase();
    const isAdminRoute = url.startsWith('/api/admin');

    // Leitura, ou rota de plataforma -> segue sem auditoria de escrita.
    if (!WRITE_METHODS.has(method) || isAdminRoute) return next.handle();

    // Fase 2: irreversiveis exigem override (quebra de vidro).
    const override = String(req.headers?.[OVERRIDE_HEADER] ?? '').toLowerCase() === 'true';
    const destructive = isDestructiveAction(method, url);
    if (destructive && !override) {
      throw new HttpException(
        {
          code: 'acting_destructive_blocked',
          message: 'Acao irreversivel em modo cliente. Confirme para executar.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Auditoria reforcada: registra a escrita no sucesso (sem corpo - ADR 005).
    const action = destructive ? 'platform_admin.override_destructive' : 'platform_admin.acting_write';
    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          action,
          userId: user.userId ?? null,
          tenantId: tenant.id,
          resource: `${method} ${url.split('?')[0]}`,
          metadata: { method, override },
          correlationId: req.correlationId,
        });
      }),
    );
  }
}
