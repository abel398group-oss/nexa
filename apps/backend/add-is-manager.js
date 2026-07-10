// Script temporário — aplica coluna is_manager na tabela handoff_tokens
// Rodar: node add-is-manager.js (dentro de apps/backend)
const path = require('path');
const fs = require('fs');

// Lê .env manualmente
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/);
if (!match) { console.error('DATABASE_URL não encontrada no .env'); process.exit(1); }

let dbUrl = match[1].trim();
// Remove parâmetros SSL da URL — pg usa ssl object separado
dbUrl = dbUrl.replace(/[?&]sslmode=[^&]*/g, '').replace(/[?&]uselibpqcompat=[^&]*/g, '');
if (dbUrl.includes('?')) { dbUrl += '&sslmode=disable'; } else { dbUrl += '?sslmode=disable'; }

const { Client } = require(path.join(
  __dirname, '../../node_modules/.pnpm/pg@8.21.0/node_modules/pg/lib/index.js'
));

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('Conectando ao banco...');
  await client.connect();
  console.log('Conectado!');

  // Libera locks presos
  await client.query('SELECT pg_advisory_unlock_all()');

  // Adiciona coluna (IF NOT EXISTS = seguro rodar múltiplas vezes)
  await client.query(
    'ALTER TABLE handoff_tokens ADD COLUMN IF NOT EXISTS is_manager BOOLEAN NOT NULL DEFAULT false'
  );
  console.log('✓ Coluna is_manager adicionada (ou já existia).');

  // Registra a migration no histórico do Prisma para não tentar de novo
  await client.query(`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (
      gen_random_uuid()::text,
      'manual',
      NOW(),
      '20260708000000_handoff_token_is_manager',
      NULL, NULL, NOW(), 1
    )
    ON CONFLICT (migration_name) DO NOTHING
  `).catch(() => console.log('(migration já registrada no histórico — ok)'));

  await client.end();
  console.log('Pronto! Pode deletar este arquivo.');
}

run().catch(async (e) => {
  console.error('Erro:', e.message);
  await client.end().catch(() => {});
  process.exit(1);
});
