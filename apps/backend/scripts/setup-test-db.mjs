// Prepara o banco de TESTE: sobe o container e aplica as migrations nele.
//
// Script em Node e não uma linha de shell no package.json por dois motivos: `&&` não
// existe no PowerShell (shell padrão aqui), e passar variável de ambiente inline muda de
// sintaxe em cada shell. Assim roda igual no Windows, no CI e no Linux.
//
// O banco é o container `nexa_postgres` (5434), NUNCA o de produção — o `.env` do
// backend aponta para a DigitalOcean, e esta suíte cria e apaga linhas.
//
// Porta 5434, não 5433 (22/08/2026): outro projeto na mesma máquina (tiktok-shop) já
// tinha tomado a 5433 pra si.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(raiz, '../..');
const TEST_DATABASE_URL =
  'postgresql://nexa:nexa_local_dev@localhost:5434/nexa?schema=public';

// `shell` é opcional: `docker` precisa dele (resolução de PATH no Windows), mas o Node
// NÃO — o executável mora em "C:\Program Files\nodejs" e o shell quebraria o caminho no
// espaço, virando 'C:\Program' não reconhecido.
function rodar(cmd, args, { env, cwd, shell = false } = {}) {
  execFileSync(cmd, args, {
    stdio: 'inherit',
    cwd: cwd ?? raiz,
    env: { ...process.env, ...env },
    shell,
  });
}

console.log('→ subindo o container de teste…');
// Roda a partir da raiz em vez de passar `-f <caminho>`: o repositório fica numa pasta
// com espaço no nome ("Hipervias - Abel") e o caminho como argumento quebra em duas
// partes no shell. Sem argumento de caminho, o problema não existe.
rodar('docker', ['compose', 'up', '-d', 'postgres'], { cwd: repo, shell: true });

// O Postgres aceita conexão alguns segundos depois de o container existir.
console.log('→ esperando o banco aceitar conexão…');
for (let i = 1; i <= 15; i += 1) {
  try {
    execFileSync('docker', ['exec', 'nexa_postgres', 'pg_isready', '-U', 'nexa'], {
      stdio: 'ignore',
      shell: true,
    });
    break;
  } catch {
    if (i === 15) throw new Error('Postgres de teste não respondeu em 30s.');
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)'], { stdio: 'ignore' });
  }
}

console.log('→ aplicando migrations no banco de teste…');
rodar(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  DATABASE_URL: TEST_DATABASE_URL,
});

console.log('\nPronto. Agora: pnpm test:int');
