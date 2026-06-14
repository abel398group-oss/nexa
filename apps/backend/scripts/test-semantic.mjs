// Valida a busca semântica da KB vs. a textual, lado a lado.
//
// Pré-requisitos (rodar uma vez, na ordem):
//   1) pnpm install                         (instala @xenova/transformers)
//   2) pnpm db:migrate && pnpm db:generate  (cria pgvector + coluna embedding)
//   3) backend no ar e POST /api/knowledge/reindex?force=true  (gera os vetores)
//
// Uso (a partir de apps/backend):
//   node scripts/test-semantic.mjs
//   node scripts/test-semantic.mjs "quanto gasto de diesel por caminhão?"
//
// O 1º run baixa o modelo (~120MB) do HuggingFace — precisa de internet.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carrega o DATABASE_URL do .env do backend, se não estiver no ambiente.
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
const query = process.argv.slice(2).join(' ') || 'vocês fazem nota fiscal de transporte?';

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

function textualTop(all, q, topN = 3) {
  const terms = norm(q)
    .split(/\W+/)
    .filter((t) => t.length >= 3);
  return all
    .map((kb) => {
      const title = norm(kb.title);
      const content = norm(kb.content);
      const topic = norm(`${kb.topic} ${kb.category}`);
      const tags = norm((kb.tags ?? []).join(' '));
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        if (tags.includes(t)) score += 2;
        if (topic.includes(t)) score += 2;
        if (content.includes(t)) score += 1;
      }
      return { title: kb.title, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  console.log(`\nPergunta: "${query}"  (tenant: ${TENANT})\n`);

  // ── SEMÂNTICA ──
  const dynamicImport = new Function('m', 'return import(m)');
  const { pipeline, env } = await dynamicImport('@xenova/transformers');
  env.allowLocalModels = true;
  console.log('Carregando modelo de embeddings (1ª vez baixa ~120MB)...');
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
  const out = await extractor(`query: ${query}`, { pooling: 'mean', normalize: true });
  const lit = `[${Array.from(out.data).join(',')}]`;

  const semantic = await prisma.$queryRawUnsafe(
    `SELECT title, 1 - (embedding <=> $1::vector) AS score
       FROM ai_knowledge_base
      WHERE tenant_id = $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 3`,
    lit,
    TENANT,
  );

  console.log('\n🔎 SEMÂNTICA (significado):');
  if (semantic.length === 0) {
    console.log('  (nenhum vetor encontrado — rodou o reindex?)');
  } else {
    semantic.forEach((r, i) => console.log(`  ${i + 1}. [${Number(r.score).toFixed(3)}] ${r.title}`));
  }

  // ── TEXTUAL (para comparar) ──
  const all = await prisma.$queryRawUnsafe(
    `SELECT title, content, topic, category, tags FROM ai_knowledge_base WHERE tenant_id = $1`,
    TENANT,
  );
  const textual = textualTop(all, query);
  console.log('\n📝 TEXTUAL (palavras iguais):');
  if (textual.length === 0) {
    console.log('  (nenhum termo casou — é exatamente onde a semântica ganha)');
  } else {
    textual.forEach((r, i) => console.log(`  ${i + 1}. [${r.score}] ${r.title}`));
  }

  console.log('');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro:', e?.message ?? e);
  process.exit(1);
});
