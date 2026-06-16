import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

// Audit log central (ADR 005/012). Registrar quem fez o quê.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: string;
    userId?: string | null;
    tenantId?: string | null;
    resource?: string;
    metadata?: Record<string, unknown>;
    correlationId?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        action: params.action,
        userId: params.userId ?? null,
        tenantId: params.tenantId ?? null,
        resource: params.resource,
        metadata: (params.metadata ?? {}) as any,
        correlationId: params.correlationId,
      },
    });
  }
}
