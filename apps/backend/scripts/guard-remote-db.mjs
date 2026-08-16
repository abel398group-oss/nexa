/**
 * Recusa comandos destrutivos do Prisma quando o banco não é local.
 *
 * Este projeto tem uma particularidade que torna a trava obrigatória: o
 * `apps/backend/.env` aponta para o banco de PRODUÇÃO, de propósito e sempre
 * (ver "Database rule" no CLAUDE.md). Não existe banco de desenvolvimento.
 *
 * `prisma migrate dev` num banco divergente não falha — ele OFERECE resetar, e
 * resetar é dropar o schema e recriar do zero. Em 16/08/2026 foi o que aconteceu:
 * as 53 tabelas foram recriadas num bloco contínuo de OIDs, com zero linhas, e o
 * shadow database ficou largado no cluster. Toda a base de produção evaporou.
 *
 * O gatilho tinha sido armado no dia anterior, pelo commit a311226, que declarou
 * no schema dois índices criados na mão — exatamente a divergência que faz o
 * `migrate dev` propor o reset.
 *
 * Para criar migration nova aqui: escreva o `migration.sql` na mão e aplique com
 * `prisma migrate deploy`. É o fluxo que o projeto já usa.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// O Prisma CLI lê o `.env` sozinho, então a trava precisa ler também — senão ela
// julgaria pelo `process.env` vazio e liberaria justamente o caso perigoso.
let url = process.env.DATABASE_URL ?? '';
if (!url) {
  try {
    for (const linha of readFileSync(resolve(raiz, '.env'), 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*DATABASE_URL\s*=\s*(.*)$/);
      if (m) url = m[1].replace(/^["']|["']$/g, '');
    }
  } catch {
    // Sem .env não dá para afirmar que é local. Recusar é a atitude padrão.
  }
}

const LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);
let host = '';
try {
  host = new URL(url).hostname;
} catch {
  host = '';
}

if (!host) {
  console.error('\n  RECUSADO: não consegui ler o host do DATABASE_URL.');
  console.error('  Sem saber para onde aponta, este comando não roda.\n');
  process.exit(1);
}

if (!LOCAIS.has(host)) {
  console.error(`\n  RECUSADO: o DATABASE_URL aponta para ${host} — não é um banco local.`);
  console.error('');
  console.error('  `prisma migrate dev` oferece RESETAR o banco quando acha divergência,');
  console.error('  e resetar aqui apaga a produção inteira. Já aconteceu em 16/08/2026.');
  console.error('');
  console.error('  Para aplicar migrations:      npx prisma migrate deploy');
  console.error('  Para criar uma migration:     escreva o migration.sql na mão e use deploy');
  console.error('');
  process.exit(1);
}

console.log(`banco local (${host}) — liberado.`);
