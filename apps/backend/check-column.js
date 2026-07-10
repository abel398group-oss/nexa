const path = require('path');
const fs = require('fs');
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const match = envContent.match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/);
let dbUrl = match[1].trim().split('?')[0]; // remove query string
const { Client } = require(path.join(__dirname, '../../node_modules/.pnpm/pg@8.21.0/node_modules/pg/lib/index.js'));
const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query("SELECT column_name FROM information_schema.columns WHERE table_name='handoff_tokens' AND column_name='is_manager'"))
  .then(r => { console.log(r.rowCount > 0 ? 'COLUNA JA EXISTE' : 'COLUNA NAO EXISTE'); c.end(); })
  .catch(e => { console.error('Erro:', e.message); c.end(); });
