import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/infra/prisma/prisma.service';

// Áreas que podem ser habilitadas por usuário.
//
// A lista deixou de morar aqui (16/08/2026): é um FILTRO — `create`/`update` descartam em
// silêncio o que não estiver nela — e viver longe dos `@RequirePerm` fazia ela atrasar.
// Três permissões exigidas por rota (`settings`, `webhooks:manage`, `admin`) tinham
// ficado de fora e viraram admin-only por acidente, sem ninguém decidir isso.
//
// Fonte única agora em `shared/auth/perms.ts`, do lado do guard que as consome. O nome
// `AREAS` fica como reexport para não quebrar quem já importa daqui.
export { GRANTABLE_PERMS as AREAS } from '@/shared/auth/perms';
import { GRANTABLE_PERMS } from '@/shared/auth/perms';

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
    if (exists) throw new BadRequestException('Este e-mail já está cadastrado.');
    const role = (dto.role as any) ?? 'operacional';
    try {
      return await this.prisma.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          name: dto.name,
          role,
          permissions: role === 'admin' ? [] : (dto.permissions ?? []).filter((p) => (GRANTABLE_PERMS as readonly string[]).includes(p)),
        },
        select: SELECT,
      });
    } catch (e: any) {
      // A checagem acima é check-then-act: em dois cliques no "Salvar", as duas
      // requisições passam pelo `findUnique` antes de qualquer uma gravar, e a
      // segunda bate no índice único do e-mail. Sem este catch o Prisma sobe
      // P2002 sem tratamento e o operador recebe "Internal server error" — não
      // descobre que só precisa usar outro e-mail (achado em 11/08/2026).
      //
      // Quem de fato impede a duplicata é o índice; o catch existe para traduzir
      // a recusa dele. Mesmo tratamento que `SellersService.update` já fazia.
      if (e?.code === 'P2002') throw new BadRequestException('Este e-mail já está cadastrado.');
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: { role?: string; permissions?: string[]; password?: string }) {
    const u = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!u) throw new NotFoundException('usuário não encontrado');
    const data: any = {};
    if (dto.role) data.role = dto.role;
    if (dto.permissions) data.permissions = dto.permissions.filter((p) => (GRANTABLE_PERMS as readonly string[]).includes(p));
    // Promoveu a admin → zera a lista, igual ao create. Admin passa direto pelo
    // guard, então manter permissões antigas é lixo que reaparece se um dia ele
    // for rebaixado (voltaria com os acessos de antes, sem ninguém pedir).
    if (dto.role === 'admin') data.permissions = [];
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
