// Seed mínimo do Sprint 1 — produto inicial (HiperTMS) + KB exemplo.
// Idempotente: rodar 2x não duplica.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Usuário admin inicial (para login). Trocar a senha depois!
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@nexa.local' },
    update: {},
    create: {
      email: 'admin@nexa.local',
      passwordHash,
      name: 'Admin',
      role: 'admin',
    },
  });

  // Produto inicial: HiperTMS (1º conector — ADR 008/010)
  await prisma.product.upsert({
    where: { code: 'hipertms' },
    update: {},
    create: {
      code: 'hipertms',
      name: 'Hipervias TMS',
      connector: 'HiperTmsConnector',
      status: 'active',
    },
  });

  // KB de exemplo (aprovada) — só para validar o fluxo
  const kb = await prisma.aiKnowledgeBase.create({
    data: {
      tenantId: 'seed',
      productCode: 'hipertms',
      topic: 'planos',
      category: 'comercial',
      title: 'Planos HiperTMS',
      content: 'Básico R$89, Essencial R$299, Profissional R$599.',
      tags: ['planos', 'precos'],
      versions: {
        create: {
          version: 1,
          content: 'Básico R$89, Essencial R$299, Profissional R$599.',
          approved: true,
          author: 'seed',
          reviewer: 'seed',
          approvedAt: new Date(),
        },
      },
    },
  });

  console.log('Seed OK:', {
    admin: 'admin@nexa.local / admin123',
    product: 'hipertms',
    kb: kb.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
