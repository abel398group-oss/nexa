import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infra/prisma/prisma.service';

// Áreas que podem ser habilitadas por usuário
export const AREAS = ['dashboard', 'inbox', 'contacts', 'knowledge', 'sellers', 'campaigns', 'ai_control', 'users'] as const;

const SELECT = { id: true, email: true, name: true, role: true, permissions: true, isActive: true, sellerId: true, createdAt: true };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, search?: string) {
    const where: any = { tenantId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.user.findMany({ where, select: SELECT, orderBy: { createdAt: 'asc' } });
  }

  async create(tenantId: string, dto: { name: string; email: string; password: string; role?: string; permissions?: string[] }) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('e-mail já cadastrado');
    const role = (dto.role as any) ?? 'operacional';
    return this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        name: dto.name,
        role,
        permissions: role === 'admin' ? [] : (dto.permissions ?? []).filter((p) => (AREAS as readonly string[]).includes(p)),
      },
      select: SELECT,
    });
  }

  async update(tenantId: string, id: string, dto: { role?: string; permissions?: string[]; password?: string }) {
    const u = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!u) throw new NotFoundException('usuário não encontrado');
    const data: any = {};
    if (dto.role) data.role = dto.role;
    if (dto.permissions) data.permissions = dto.permissions.filter((p) => (AREAS as readonly string[]).includes(p));
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.update({ where: { id }, data, select: SELECT });
  }

  async setActive(tenantId: string, id: string, active: boolean) {
    return this.prisma.user.updateMany({ where: { id, tenantId }, data: { isActive: active } });
  }

  // Exclui um usuário (login). Impede excluir o próprio usuário logado.
  async remove(tenantId: string, id: string, currentUserId?: string) {
    if (id === currentUserId) throw new BadRequestException('Você não pode excluir o próprio usuário.');
    const u = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!u) throw new NotFoundException('usuário não encontrado');
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
