/**
 * Refaz `_prisma_migrations` marcando TODAS as migrations como aplicadas (baseline).
 *
 * Quando usar: erro `P3005 — The database schema is not empty` no boot, com o schema
 * íntegro. Foi o que aconteceu em 16/08/2026 — a tabela de controle foi apagada do banco
 * de produção e as 54 tabelas continuaram lá. Sem ela o Prisma se recusa a subir, e o
 * backend fica em loop de restart até alguém baselinar.
 *
 * Por que é seguro AQUI: toda migration deste projeto é escrita com `IF NOT EXISTS` /
 * `DO $$ ... EXCEPTION`. Ainda assim este script NÃO executa SQL de migration nenhuma —
 * ele só registra que já foram aplicadas.
 *
 * Antes de rodar, ele CONFERE que o schema está mesmo populado. Num banco vazio, marcar
 * tudo como aplicado criaria um sistema sem tabela nenhuma que se acha em dia — o pior
 * desfecho possível. Por isso a recusa é a atitude padrão.
 *
 *   node scripts/baseline-prisma.mjs           # mostra o que faria
 *   node scripts/baseline-prisma.mjs --aplicar # grava
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const aplicar = process.argv.includes('--aplicar');

for (const linha of readFileSync(resolve(raiz, '.env'), 'utf8').split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

// `createRequire` e não `import()` de caminho: no Windows o caminho absoluto vira
// `C:\...`, que o ESM recusa como esquema de URL inválido.
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const url = (process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL).replace(
  'sslmode=require',
  'sslmode=require&uselibpqcompat=true',
);
const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows } = await db.query(`
  SELECT (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') AS tabelas,
         to_regclass('public._prisma_migrations') AS controle`);
const { tabelas, controle } = rows[0];

console.log(`banco: ${tabelas} tabelas | _prisma_migrations: ${controle ?? 'NÃO EXISTE'}`);

// A trava que importa: baseline num banco vazio é catástrofe silenciosa.
if (tabelas < 20) {
  console.error(`\nRECUSADO: só ${tabelas} tabelas. Isso não parece um banco já migrado.`);
  console.error('Baseline aqui marcaria migrations como aplicadas sem que as tabelas existam.');
  await db.end();
  process.exit(1);
}
// A tabela existir NÃO impede mais: um baseline interrompido no meio (ou outra pessoa
// rodando o mesmo conserto ao mesmo tempo) deixa a tabela criada e incompleta, e é
// justamente aí que este script precisa poder rodar de novo. O que ele nunca faz é
// re-executar SQL — só registra o que falta, e pula o que já está.
if (controle) {
  const { rows: r } = await db.query('SELECT count(*)::int AS n FROM _prisma_migrations');
  console.log(`_prisma_migrations já tem ${r[0].n} registro(s) — completando o que falta.`);
}
await db.end();

const migrations = readdirSync(resolve(raiz, 'prisma/migrations'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

console.log(`\n${migrations.length} migrations serão marcadas como aplicadas.`);
if (!aplicar) {
  console.log('\nEnsaio — nada foi gravado. Para valer: node scripts/baseline-prisma.mjs --aplicar');
  process.exit(0);
}

let gravadas = 0;
let jaEstavam = 0;

for (const [i, nome] of migrations.entries()) {
  process.stdout.write(`[${i + 1}/${migrations.length}] ${nome} … `);
  try {
    execFileSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'resolve', '--applied', nome],
      { cwd: raiz, stdio: 'pipe' },
    );
    gravadas += 1;
    console.log('ok');
  } catch (e) {
    // P3008 = "já registrada como aplicada". NÃO é falha: é o resultado que queremos,
    // só que alguém chegou antes — outra pessoa rodando o mesmo conserto, ou este
    // script sendo repetido depois de parar no meio. Abortar aqui deixaria o baseline
    // pela metade, que é pior que qualquer um dos dois casos.
    const saida = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (saida.includes('P3008')) {
      jaEstavam += 1;
      console.log('já estava');
      continue;
    }
    console.log('FALHOU');
    console.error(saida || e.message);
    throw e;
  }
}

console.log(`\n${gravadas} gravadas agora, ${jaEstavam} já estavam.`);

console.log('\nPronto. Confirme com: npx prisma migrate deploy (deve dizer "No pending migrations").');
