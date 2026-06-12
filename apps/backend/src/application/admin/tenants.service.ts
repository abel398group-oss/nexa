import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AuditService } from '@/shared/audit/audit.service';

// Casos de uso de Tenants para o Platform Admin (docs/features/platform-admin sec 5.2c).
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Lista de clientes para o seletor.
  list() {
    return this.prisma.tenant.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, status: true },
    });
  }

  async getOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, status: true, productId: true, createdAt: true },
    });
    if (!tenant) throw new NotFoundException('Cliente nao encontrado');
    return tenant;
  }

  // Registra a entrada do platform admin num tenant (accountability obrigatoria - sec 6.4).
  async enter(id: string, user: { userId?: string; role?: string }, correlationId?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException('Cliente nao encontrado ou inativo');
    }
    await this.audit.log({
      action: 'platform_admin.enter_tenant',
      userId: user?.userId ?? null,
      tenantId: tenant.id,
      resource: 'tenant',
      metadata: { tenantName: tenant.name, slug: tenant.slug, role: user?.role },
      correlationId,
    });
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status };
  }
}
