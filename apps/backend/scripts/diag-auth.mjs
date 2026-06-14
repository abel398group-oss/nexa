// Diagnóstico do login: reproduz as consultas do AuthService direto no banco
// e imprime o erro REAL (que no navegador aparece só como "500").
// Uso (a partir de apps/backend):  node scripts/diag-auth.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}

const EMAIL = process.argv.slice(2).join(' ') || 'admin@nexa.local';

async function step(label, fn) {
  try {
    const r = await fn();
    console.log(`✓ ${label}:`, r);
  } catch (e) {
    console.error(`✗ ${label} — ERRO:\n   ${e?.message ?? e}`);
  }
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log(`\nDATABASE_URL: ${process.env.DATABASE_URL ? 'carregado' : 'AUSENTE'}`);
  console.log(`Testando login para: ${EMAIL}\n`);

  await step('conexão (SELECT 1)', async () => {
    await prisma.$queryRawUnsafe('SELECT 1');
    return 'ok';
  });

  await step('user.count()', () => prisma.user.count());

  await step('user.findUnique(email)  [passo 1 do login]', async () => {
    const u = await prisma.user.findUnique({ where: { email: EMAIL } });
    return u ? `encontrado (id=${u.id.slice(0, 8)}, ativo=${u.isActive}, role=${u.role})` : 'NÃO encontrado';
  });

  await step('session.findMany(take 1)  [tabela usada no issueTokens]', async () => {
    const s = await prisma.session.findMany({ take: 1 });
    return `ok (${s.length} linha lida)`;
  });

  await step('colunas reais da tabela users', async () => {
    const cols = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`,
    );
    return cols.map((c) => c.column_name).join(', ');
  });

  await prisma.$disconnect();
  console.log('\n>> Se algum passo acima deu ✗, a mensagem do erro é a causa do 500 do login.');
}

main().catch((e) => {
  console.error('Falha geral:', e?.message ?? e);
  process.exit(1);
});
