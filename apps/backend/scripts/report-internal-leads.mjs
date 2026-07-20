// Report: contacts/conversations created from INTERNAL phone numbers (sellers
// and Monitor alert recipients) BEFORE the inbound gate existed (commit
// a296251, 2026-07-20 — InternalNumbersService).
//
// READ-ONLY: prints a report, changes nothing. The cleanup decision is Abel's,
// made on top of this output.
//
// Uso (a partir de apps/backend, com o .env apontando pro banco):
//   node scripts/report-internal-leads.mjs
//
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega DATABASE_URL do .env do backend, se não estiver no ambiente.
if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* .env ausente — DATABASE_URL precisa vir do ambiente */
  }
}

// Same tolerant matching as internal-numbers.service.ts (kept in sync by the
// spec there; duplicated here because scripts/ can't import TS sources).
const digits = (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : '');
function phonesMatch(a, b) {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 10 && db.length >= 10) return da.endsWith(db) || db.endsWith(da);
  return false;
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

try {
  // 1) internal numbers: sellers (any tenant) + monitor alert recipients
  const sellers = await prisma.seller.findMany({
    select: { name: true, phone: true, tenantId: true },
  });
  const configs = await prisma.tenantNotificationConfig.findMany({
    select: { tenantId: true, notificationPhone: true, sectorConfig: true, contacts: true },
  });

  /** @type {Array<{phone: string, label: string}>} */
  const internal = [];
  for (const s of sellers) {
    if (s.phone) internal.push({ phone: s.phone, label: `vendedor ${s.name} (${s.tenantId})` });
  }
  for (const cfg of configs) {
    if (cfg.notificationPhone) {
      internal.push({ phone: cfg.notificationPhone, label: `alerta notificationPhone (${cfg.tenantId})` });
    }
    for (const c of cfg.contacts ?? []) {
      if (c?.whatsapp) internal.push({ phone: c.whatsapp, label: `alerta ${c?.name ?? 'sem nome'} (${cfg.tenantId})` });
    }
    for (const [sector, sc] of Object.entries(cfg.sectorConfig ?? {})) {
      if (sc?.phone) internal.push({ phone: sc.phone, label: `alerta setor ${sector} (${cfg.tenantId})` });
      for (const r of sc?.recipients ?? []) {
        if (r?.channel === 'whatsapp' && r?.contact) {
          internal.push({ phone: r.contact, label: `alerta setor ${sector} recipient (${cfg.tenantId})` });
        }
      }
    }
  }

  console.log(`Números internos conhecidos: ${internal.length} (${sellers.length} vendedores + ${internal.length - sellers.length} de alerta)\n`);

  // 2) contacts polluted by those numbers
  const contacts = await prisma.contact.findMany({
    select: { id: true, tenantId: true, phone: true, name: true, status: true, source: true, createdAt: true },
  });

  const polluted = [];
  for (const c of contacts) {
    const hit = internal.find((i) => phonesMatch(c.phone, i.phone));
    if (hit) polluted.push({ contact: c, matchedAs: hit.label });
  }

  if (!polluted.length) {
    console.log('✅ Nenhum contato da base bate com número interno — base limpa, nada a fazer.');
    process.exit(0);
  }

  console.log(`⚠️  ${polluted.length} contato(s) da base são números INTERNOS:\n`);
  for (const { contact: c, matchedAs } of polluted) {
    const convs = await prisma.aiConversation.findMany({
      where: { tenantId: c.tenantId, phone: c.phone },
      select: { id: true, status: true, startedAt: true, _count: { select: { messages: true } } },
    });
    const convSummary = convs.length
      ? convs.map((v) => `${v.id.slice(0, 8)}(${v.status},${v._count.messages}msgs)`).join(' ')
      : 'nenhuma conversa';
    console.log(
      [
        `• ${c.phone} — ${c.name ?? 'sem nome'} [${c.status}]`,
        `  é: ${matchedAs}`,
        `  contato: id=${c.id} tenant=${c.tenantId} source=${c.source ?? '?'} criado=${c.createdAt.toISOString().slice(0, 10)}`,
        `  conversas: ${convSummary}`,
      ].join('\n'),
    );
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log('Relatório READ-ONLY — nada foi alterado.');
  console.log('Próximo passo: colar esta saída na conversa para decidir a limpeza');
  console.log('(excluir contato+conversas, ou só marcar/arquivar).');
} finally {
  await prisma.$disconnect();
}
