// Backfill dos vetores semânticos da KB (RAG) — standalone, sem precisar de login.
// Gera o embedding de cada item da base e grava na coluna `embedding` (pgvector).
//
// Pré-requisitos: pnpm install + pnpm prisma:migrate já rodados, e o Postgres no ar.
// Uso (a partir de apps/backend):
//   node scripts/reindex.mjs
//   node scripts/reindex.mjs --force        (reindexa TUDO, não só o que falta)
//
// O 1º run baixa o modelo (~120MB) do HuggingFace — precisa de internet.

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
    /* sem .env — assume DATABASE_URL já no ambiente */
  }
}

const TENANT = process.env.TEST_TENANT ?? 'default';
const FORCE = process.argv.includes('--force');
const MODEL = process.env.EMBEDDING_MODEL ?? 'Xenova/multilingual-e5-small';

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log('Carregando modelo de embeddings (1ª vez baixa ~120MB)...');
  const dynamicImport = new Function('m', 'return import(m)');
  const { pipeline, env } = await dynamicImport('@xenova/transformers');
  env.allowLocalModels = true;
  const extractor = await pipeline('feature-extraction', MODEL);

  const where = FORCE ? `tenant_id = $1` : `tenant_id = $1 AND embedding IS NULL`;
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, title, content FROM ai_knowledge_base WHERE ${where}`,
    TENANT,
  );

  console.log(`Itens a vetorizar: ${rows.length} (force=${FORCE})\n`);
  let done = 0;
  for (const r of rows) {
    const text = `${r.title}\n${r.content}`.replace(/\s+/g, ' ').trim().slice(0, 4000);
    const out = await extractor(`passage: ${text}`, { pooling: 'mean', normalize: true });
    const lit = `[${Array.from(out.data).join(',')}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE ai_knowledge_base SET embedding = $1::vector, embedding_model = $2 WHERE id = $3`,
      lit,
      MODEL,
      r.id,
    );
    done++;
    console.log(`  ✓ ${done}/${rows.length}  ${r.title}`);
  }

  console.log(`\nPronto: ${done} itens vetorizados.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro:', e?.message ?? e);
  process.exit(1);
});
