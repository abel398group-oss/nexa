// Backfill de Tenants — Platform Admin (docs/features/platform-admin §5.1).
// Cria um registro `Tenant` para CADA tenantId distinto já em uso nos dados.
// O Tenant.id = a própria string tenantId existente (NÃO um uuid novo), senão o
// "tenant efetivo" resolvido no backend não casaria com os registros atuais.
// Idempotente: rodar 2x não duplica (upsert por id).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Nomes amigáveis por tenantId. Ajuste aqui conforme o cliente real.
// (Hoje o cliente é o HiperTMS — confirme qual tenantId corresponde a ele.)
const TENANT_NAMES: Record<string, string> = {
  default: 'HiperTMS',
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tenant';
}

// Roda uma query distinct; se a tabela não existir neste banco (drift), pula.
async function safeDistinct(
  label: string,
  query: () => Promise<{ tenantId: string | null }[]>,
): Promise<{ tenantId: string | null }[]> {
  try {
    return await query();
  } catch (e: any) {
    if (e?.code === 'P2021') {
      console.warn(`(pulando) tabela de "${label}" não existe neste banco`);
      return [];
    }
    throw e;
  }
}

// Coleta tenantId distinto de cada tabela relevante e une num Set.
async function collectTenantIds(): Promise<string[]> {
  const set = new Set<string>();
  const add = (rows: { tenantId: string | null }[]) =>
    rows.forEach((r) => r.tenantId && set.add(r.tenantId));

  add(await safeDistinct('contacts', () => prisma.contact.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));
  add(await safeDistinct('aiConversation', () => prisma.aiConversation.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));
  add(await safeDistinct('seller', () => prisma.seller.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));
  add(await safeDistinct('campaign', () => prisma.campaign.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));
  add(await safeDistinct('emailChannel', () => prisma.emailChannel.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));
  add(await safeDistinct('aiKnowledgeBase', () => prisma.aiKnowledgeBase.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));
  add(await safeDistinct('notification', () => prisma.notification.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));
  add(await safeDistinct('user', () => prisma.user.findMany({ distinct: ['tenantId'], select: { tenantId: true } })));

  return [...set];
}

async function main() {
  const ids = await collectTenantIds();

  // Garante ao menos o tenant 'default' (cliente atual) mesmo sem dados ainda.
  if (!ids.includes('default')) ids.push('default');

  for (const id of ids) {
    const name = TENANT_NAMES[id] ?? id;
    await prisma.tenant.upsert({
      where: { id },
      update: {}, // não sobrescreve nome/slug já ajustados manualmente
      create: { id, name, slug: slugify(name), status: 'active' },
    });
  }

  const all = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  console.log(`Backfill OK — ${all.length} tenant(s):`, all);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
