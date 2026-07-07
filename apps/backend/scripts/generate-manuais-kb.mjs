/**
 * generate-manuais-kb.mjs
 * Lê todos os hipertms-XX-*.md e gera hipertms-manuais.data.ts
 *
 * Uso: node generate-manuais-kb.mjs <pasta-manuais> <arquivo-saida>
 *
 * Estratégia de chunking:
 *   - H2 (##) = seção principal → cria chunk se não tiver H3 filhos
 *   - H3 (###) = subseção → sempre vira um chunk
 *   - Título do chunk: "MÓDULO › H2 › H3"
 *   - Topic: nome do arquivo sem extensão (ex: hipertms-03-operacao)
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const INPUT_DIR  = process.argv[2] ?? join(__dir, '../hipertms_v12/docs/manuais tecnicos');
const OUTPUT_FILE = process.argv[3] ?? join(__dir, 'hipertms-manuais.data.ts');

// --- helpers ---

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractTags(text) {
  // extrai palavras significativas para tags
  const stop = new Set(['como', 'para', 'uma', 'com', 'que', 'dos', 'das', 'por', 'seu', 'sua',
    'nao', 'esta', 'pelo', 'pela', 'num', 'numa', 'mais', 'nos', 'nas', 'aos', 'the', 'and', 'of']);
  return [...new Set(
    text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[\s\/\-\–\()\[\]]+/)
      .filter(w => w.length >= 3 && !stop.has(w) && /^[a-z0-9]+$/.test(w))
      .slice(0, 8)
  )];
}

function escapeTs(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

function parseManual(filePath) {
  const raw  = readFileSync(filePath, 'utf8');
  const name = basename(filePath, '.md'); // ex: hipertms-03-operacao
  // título legível do módulo (ex: "Operação")
  const moduleTitle = raw.match(/^#\s+(.+)/m)?.[1]?.replace(/Manual \d+\s*—\s*/, '').trim() ?? name;

  const chunks = [];
  const lines  = raw.split('\n');

  let h2Title = '';
  let h3Title = '';
  let body    = [];
  let inH3    = false;

  function flush(h2, h3, lines) {
    const content = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!content || content.length < 20) return;
    const label = h3 ? `${moduleTitle} › ${h2} › ${h3}` : `${moduleTitle} › ${h2}`;
    const rawTags = extractTags(`${h2} ${h3} ${content.slice(0, 200)}`);
    const tags = ['manual', ...slugify(name).split('-').filter(t => t.length > 2), ...rawTags];
    chunks.push({ topic: name, category: 'suporte', title: label, content, tags: [...new Set(tags)] });
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inH3 && body.length) flush(h2Title, h3Title, body);
      else if (!inH3 && h2Title && body.length) flush(h2Title, '', body);
      h2Title = line.replace(/^##\s+/, '').trim();
      h3Title = '';
      body    = [];
      inH3    = false;
    } else if (line.startsWith('### ')) {
      if (inH3 && body.length) flush(h2Title, h3Title, body);
      else if (!inH3 && h2Title && body.length) flush(h2Title, '', body);
      h3Title = line.replace(/^###\s+/, '').trim();
      body    = [];
      inH3    = true;
    } else if (!line.startsWith('#')) {
      body.push(line);
    }
  }
  // flush final
  if (inH3 && body.length) flush(h2Title, h3Title, body);
  else if (!inH3 && h2Title && body.length) flush(h2Title, '', body);

  return chunks;
}

// --- main ---

const files = readdirSync(INPUT_DIR)
  .filter(f => /^hipertms-\d+.*\.md$/.test(f))
  .sort()
  .map(f => join(INPUT_DIR, f));

console.error(`Lendo ${files.length} manuais de: ${INPUT_DIR}`);

const allChunks = [];
for (const f of files) {
  const chunks = parseManual(f);
  console.error(`  ${basename(f)} → ${chunks.length} chunks`);
  allChunks.push(...chunks);
}

console.error(`Total: ${allChunks.length} chunks`);

// --- gerar TypeScript ---

const now = new Date().toISOString().slice(0, 10);
const lines2 = [
  `import { KnowledgeItem } from './connector.interface';`,
  ``,
  `// AUTO-GERADO por scripts/generate-manuais-kb.mjs em ${now}.`,
  `// NAO editar a mao — regenerar quando os manuais mudarem:`,
  `//   node scripts/generate-manuais-kb.mjs <pasta-manuais> <este-arquivo>`,
  `// ${allChunks.length} chunks de ${files.length} manuais (módulo fica em topic + tags).`,
  ``,
  `export const MANUAIS_KB: KnowledgeItem[] = [`,
];

for (const c of allChunks) {
  const tagsStr = c.tags.map(t => JSON.stringify(t)).join(', ');
  lines2.push(`  {`);
  lines2.push(`    topic: ${JSON.stringify(c.topic)},`);
  lines2.push(`    category: "suporte",`);
  lines2.push(`    title: ${JSON.stringify(c.title)},`);
  lines2.push(`    content: ${JSON.stringify(c.content)},`);
  lines2.push(`    tags: [${tagsStr}],`);
  lines2.push(`  },`);
}

lines2.push(`];`);
lines2.push(``);

const output = lines2.join('\n');
writeFileSync(OUTPUT_FILE, output, 'utf8');
console.error(`Escrito: ${OUTPUT_FILE}`);
console.log(output);
