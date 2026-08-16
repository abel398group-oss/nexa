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
import { createHash } from 'node:crypto';
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

/**
 * UMA conexão para tudo, em vez de 68 `prisma migrate resolve`.
 *
 * A versão anterior chamava o CLI uma vez por migration. Cada chamada abre uma conexão
 * nova, e o Postgres gerenciado da DO corta em 22 — na 48ª o script morreu com P1001
 * ("não alcança o banco"), que parece queda de rede e é esgotamento de conexão.
 *
 * O `checksum` é SHA-256 do próprio `migration.sql` — conferido contra uma linha que o
 * CLI já tinha gravado. Se estivesse errado, o `migrate deploy` seguinte acusaria
 * "migration modificada depois de aplicada", que seria trocar um problema por outro.
 */
const escrita = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await escrita.connect();

// `_prisma_migrations` NÃO tem unique em `migration_name` — o Prisma permite várias
// linhas para a mesma migration (tentativas que falharam e foram refeitas). Então
// `ON CONFLICT` não serve de proteção: a checagem de duplicata é esta leitura.
const { rows: existentes } = await escrita.query(
  'SELECT migration_name FROM _prisma_migrations',
);
const jaGravadas = new Set(existentes.map((r) => r.migration_name));

let gravadas = 0;
let jaEstavam = 0;

for (const nome of migrations) {
  if (jaGravadas.has(nome)) {
    jaEstavam += 1;
    continue;
  }
  const sql = readFileSync(resolve(raiz, 'prisma/migrations', nome, 'migration.sql'));
  const checksum = createHash('sha256').update(sql).digest('hex');

  await escrita.query(
    `INSERT INTO _prisma_migrations
       (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, $1, $2, now(), now(), 1)`,
    [checksum, nome],
  );
  gravadas += 1;
  console.log(`  + ${nome}`);
}

console.log(`\n${gravadas} gravadas agora, ${jaEstavam} já estavam.`);
await escrita.end();

console.log('\nPronto. Confirme com: npx prisma migrate deploy (deve dizer "No pending migrations").');
