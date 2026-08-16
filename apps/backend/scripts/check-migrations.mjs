#!/usr/bin/env node
/**
 * Recusa migration NOVA com DDL destrutivo sem aprovação explícita.
 *
 * A regra já está escrita no CLAUDE.md ("se uma coluna ou tabela precisar ser removida,
 * escreva uma migration dedicada e obtenha aprovação"), e até hoje dependia de alguém
 * lembrar dela na revisão.
 *
 * O caso concreto que motivou isto: o `schema.prisma` tem drift herdado, incluindo um
 * `DROP CONSTRAINT opportunities_batch_id_fkey`. Quem rodar `prisma migrate dev` sem ler
 * a saída empacota esse DROP numa migration e manda para produção — e o banco é o de
 * produção. Note que um gate de `migrate diff` NÃO pegaria isso: depois da migration
 * gerada, as migrations passam a produzir o schema e o diff fica vazio. O que pega é
 * olhar o conteúdo do arquivo, que é o que este script faz.
 *
 * Só olha migrations ADICIONADAS no push/PR: as antigas já estão aplicadas, e reprovar
 * o histórico deixaria o CI vermelho para sempre — gate que vive vermelho é gate que o
 * time aprende a ignorar.
 *
 * Para aprovar conscientemente, inclua no .sql uma linha:
 *   -- destrutivo-aprovado: <quem> — <por quê>
 *
 * Uso: node scripts/check-migrations.mjs [baseRef]
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || process.env.BASE_REF || 'origin/master';

/** DDL que não tem desfazer. `DROP INDEX` fica de fora: recriar índice é barato. */
const DESTRUTIVO = [
  { re: /\bDROP\s+TABLE\b/i, oq: 'DROP TABLE' },
  { re: /\bDROP\s+COLUMN\b/i, oq: 'DROP COLUMN' },
  { re: /\bDROP\s+CONSTRAINT\b/i, oq: 'DROP CONSTRAINT' },
  { re: /\bTRUNCATE\b/i, oq: 'TRUNCATE' },
  { re: /\bDROP\s+SCHEMA\b/i, oq: 'DROP SCHEMA' },
];
const APROVACAO = /--\s*destrutivo-aprovado:/i;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

let novas = [];
try {
  const saida = sh(`git diff --name-only --diff-filter=AM ${BASE}...HEAD -- "*/migrations/*.sql"`);
  novas = saida ? saida.split('\n').filter(Boolean) : [];
} catch {
  // Base inexistente (clone raso, branch nova, force-push). Não dá para saber o que é
  // novo, e reprovar por isso puniria o caso legítimo — segue sem checar, avisando.
  console.log(`aviso: não consegui comparar com "${BASE}" — nenhuma migration verificada`);
  process.exit(0);
}

if (!novas.length) {
  console.log('nenhuma migration nova neste push');
  process.exit(0);
}

const problemas = [];
for (const arq of novas) {
  let txt;
  try { txt = readFileSync(arq, 'utf8'); } catch { continue; }
  if (APROVACAO.test(txt)) {
    console.log(`~ ${arq} — destrutivo APROVADO explicitamente`);
    continue;
  }
  const achados = DESTRUTIVO.filter((d) => d.re.test(txt)).map((d) => d.oq);
  if (achados.length) problemas.push({ arq, achados });
  else console.log(`+ ${arq} — aditiva`);
}

if (!problemas.length) {
  console.log(`\n${novas.length} migration(s) verificada(s), nenhuma destrutiva.`);
  process.exit(0);
}

console.error('\nMigration destrutiva sem aprovação explícita:\n');
for (const p of problemas) console.error(`  ${p.arq}\n    contém: ${p.achados.join(', ')}`);
console.error(
  '\nO banco é o de PRODUÇÃO. Se a remoção é intencional, declare no próprio .sql:\n' +
  '  -- destrutivo-aprovado: <quem> — <por quê>\n' +
  '\nSe NÃO é intencional, o mais provável é `prisma migrate dev` ter empacotado o drift\n' +
  'herdado do schema. Apague a migration e trate o drift antes.',
);
process.exit(1);
