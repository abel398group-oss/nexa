// Run raw SQL against the DO managed Postgres, bypassing Prisma's advisory lock.
// Usage (from apps/backend):  node scripts/run-sql.mjs
//
// Why raw pg instead of `prisma migrate deploy`:
//  - P1002 = Prisma's global advisory lock is stuck (a previous run died mid-migration).
//    Raw SQL never takes that lock, so it sidesteps the timeout.
//  - SSL hang: newer `pg` treats sslmode=require as verify-full (needs the CA). DO uses a
//    self-signed CA, so we pass ssl.rejectUnauthorized=false + uselibpqcompat for compat.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg'; // pg is CommonJS — import default, then destructure

const { Client } = pg;

// --- resolve DATABASE_URL (env first, then apps/backend/.env) ---------------
let url = process.env.DATABASE_URL;
if (!url) {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const raw = readFileSync(envPath, 'utf8');
  url = raw.match(/^DATABASE_URL\s*=\s*"?(.+?)"?\s*$/m)?.[1];
}
if (!url) {
  console.error('DATABASE_URL nao encontrada (nem no ambiente nem em apps/backend/.env)');
  process.exit(1);
}

// libpq-compat so sslmode=require doesn't demand full CA verification
if (url.includes('sslmode=require') && !url.includes('uselibpqcompat')) {
  url = url.replace('sslmode=require', 'sslmode=require&uselibpqcompat=true');
}

// --- the SQL to run (additive, idempotent) ---------------------------------
const SQL = `ALTER TABLE handoff_tokens ADD COLUMN IF NOT EXISTS is_manager BOOLEAN NOT NULL DEFAULT false;`;

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false }, // DO self-signed CA
  connectionTimeoutMillis: 15000, // fail fast instead of hanging
  statement_timeout: 30000,
});

try {
  await client.connect();
  console.log('conectado ao DO Postgres');

  await client.query(SQL);
  console.log('OK -> coluna is_manager garantida em handoff_tokens');

  // confirma o resultado
  const { rows } = await client.query(
    `select column_name, data_type, column_default, is_nullable
       from information_schema.columns
      where table_name = 'handoff_tokens' and column_name = 'is_manager'`,
  );
  console.table(rows);
} catch (err) {
  console.error('ERRO:', err.message);
  if (err.message.includes('timeout') || err.code === 'ETIMEDOUT') {
    console.error(
      '\n> Timeout de conexao: seu IP provavelmente nao esta nas "Trusted Sources"',
      '\n> do database no painel DigitalOcean. Adicione seu IP e rode de novo.',
    );
  }
  process.exit(1);
} finally {
  await client.end();
}
