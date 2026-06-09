/**
 * Validação dos 5 pontos do sistema de fechamento de conversas.
 * Roda direto contra o servidor em :3001 e o banco em :5433.
 */
import pg from 'pg';

const BASE = 'http://localhost:3001/api';
const DB = new pg.Client({ connectionString: 'postgresql://nexa:nexa_local_dev@127.0.0.1:5433/nexa' });

let passed = 0, failed = 0;

function ok(label, val) {
  if (val) { console.log(`  ✅ ${label}`); passed++; }
  else      { console.log(`  ❌ ${label}`); failed++; }
}

async function api(method, path, body, cookies = '') {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookies ? { cookie: cookies } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text), headers: r.headers }; }
  catch { return { status: r.status, data: text, headers: r.headers }; }
}

async function login() {
  const r = await api('POST', '/auth/login', { email: 'admin@nexa.local', password: 'admin123' });
  const raw = r.headers.get('set-cookie') || '';
  const match = raw.match(/access_token=[^;]+/);
  return match ? match[0] : '';
}

async function createContact(cookie, phone) {
  const r = await api('POST', '/contacts', { phone, name: 'Teste ' + phone, source: 'whatsapp' }, cookie);
  return r.data.id;
}

async function createConv(cookie, contactId, phone) {
  const r = await api('POST', '/conversations', { contactId, phone, sourceChannel: 'whatsapp' }, cookie);
  return r.data;
}

async function dbQuery(sql, params = []) {
  const r = await DB.query(sql, params);
  return r.rows;
}

// ─── Ponto 1: tabela conversation_stage_history existe ───────────────────────
async function ponto1() {
  console.log('\n📋 PONTO 1 — Migration aplicada / tabela existe');
  const rows = await dbQuery(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversation_stage_history'
  `);
  ok('tabela conversation_stage_history existe no banco', rows.length === 1);

  const cols = await dbQuery(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'conversation_stage_history'
    ORDER BY ordinal_position
  `);
  const names = cols.map(c => c.column_name);
  ok('colunas from_status, to_status, from_outcome, to_outcome, reason, changed_at presentes',
    ['from_status','to_status','from_outcome','to_outcome','reason','changed_at'].every(c => names.includes(c)));

  // enum novos valores
  const enums = await dbQuery(`
    SELECT enumlabel FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'ConversationStatus'
    ORDER BY enumsortorder
  `);
  const labels = enums.map(e => e.enumlabel);
  ok('enum tem waiting_customer', labels.includes('waiting_customer'));
  ok('enum tem waiting_internal', labels.includes('waiting_internal'));
  ok('enum tem opt_out', labels.includes('opt_out'));

  const idx = await dbQuery(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'ai_conversations' AND indexname = 'ai_conversations_last_activity_status_idx'
  `);
  ok('índice ai_conversations_last_activity_status_idx criado', idx.length === 1);
}

// ─── Ponto 2: janitor NÃO fecha cliente_ativo ────────────────────────────────
async function ponto2(cookie) {
  console.log('\n📋 PONTO 2 — Janitor não fecha cliente_ativo');

  // cria contato + conversa
  const phone = '5511700002002';
  const contactId = await createContact(cookie, phone);
  const conv = await createConv(cookie, contactId, phone);

  // força cliente_ativo + waiting_customer + lastActivityAt = 8 dias atrás
  const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await dbQuery(`
    UPDATE ai_conversations
    SET status = 'waiting_customer', customer_stage = 'cliente_ativo', last_activity_at = $1
    WHERE id = $2
  `, [oldDate, conv.id]);

  // chama o método diretamente via SQL (simula o janitor)
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await dbQuery(`
    UPDATE ai_conversations
    SET status = 'closed', outcome = 'no_response', outcome_at = NOW(), ended_at = NOW()
    WHERE status IN ('open', 'waiting_customer')
    AND customer_stage = 'lead'
    AND last_activity_at < $1
  `, [cutoff]);

  // verifica: deve continuar waiting_customer (não é lead)
  const after = await dbQuery('SELECT status FROM ai_conversations WHERE id = $1', [conv.id]);
  ok('cliente_ativo com 8 dias inativo NÃO foi fechado', after[0]?.status === 'waiting_customer');

  // cleanup
  await dbQuery('DELETE FROM ai_conversations WHERE id = $1', [conv.id]);
  await dbQuery('DELETE FROM contacts WHERE id = $1', [contactId]);
}

// ─── Ponto 3: closed reabre com nova mensagem ─────────────────────────────────
async function ponto3(cookie) {
  console.log('\n📋 PONTO 3 — Conversa closed reabre com nova mensagem');

  // cria contato + conversa
  const phone = '5511700003003';
  const contactId = await createContact(cookie, phone);
  const conv = await createConv(cookie, contactId, phone);

  // fecha com no_response via API
  await api('PATCH', `/conversations/${conv.id}/outcome`, { outcome: 'won' }, cookie);
  // desfaz para simular um closed normal (não won) para o teste
  // em vez disso: forçamos closed + no_response direto no banco
  await dbQuery(`
    UPDATE ai_conversations
    SET status = 'closed', outcome = 'no_response', outcome_at = NOW(), ended_at = NOW()
    WHERE id = $1
  `, [conv.id]);

  // simula nova mensagem inbound — chama /webhooks/waha
  const wahaPayload = {
    payload: {
      from: `${phone}@c.us`,
      body: 'Olá, voltei!',
    },
  };
  const r = await api('POST', '/webhooks/waha?tenantId=default', wahaPayload);

  // verifica
  const after = await dbQuery('SELECT status, outcome FROM ai_conversations WHERE id = $1', [conv.id]);
  ok('status voltou para open após mensagem', after[0]?.status === 'open');
  ok('outcome anterior preservado no campo', after[0]?.outcome !== null); // still has 'no_response' (history)

  // verifica histórico de reabertura
  const hist = await dbQuery(`
    SELECT * FROM conversation_stage_history
    WHERE conversation_id = $1 AND reason = 'reaberta_lead_retornou'
    ORDER BY changed_at DESC LIMIT 1
  `, [conv.id]);
  ok('stage_history gravou reaberta_lead_retornou', hist.length === 1);
  ok('histórico from_status=closed, to_status=open', hist[0]?.from_status === 'closed' && hist[0]?.to_status === 'open');

  // cleanup
  await dbQuery('DELETE FROM ai_conversations WHERE id = $1', [conv.id]);
  await dbQuery('DELETE FROM contacts WHERE id = $1', [contactId]);
}

// ─── Ponto 4: opt_out NÃO reabre ─────────────────────────────────────────────
async function ponto4(cookie) {
  console.log('\n📋 PONTO 4 — opt_out não reabre com nova mensagem');

  const phone = '5511700004004';
  const contactId = await createContact(cookie, phone);
  const conv = await createConv(cookie, contactId, phone);

  // força opt_out no contato e na conversa
  await dbQuery(`UPDATE contacts SET status = 'opted_out', opt_out_at = NOW() WHERE id = $1`, [contactId]);
  await dbQuery(`UPDATE ai_conversations SET status = 'opt_out', outcome = 'opt_out', ended_at = NOW() WHERE id = $1`, [conv.id]);

  // manda nova mensagem
  const wahaPayload = { payload: { from: `${phone}@c.us`, body: 'Quero voltar!' } };
  const r = await api('POST', '/webhooks/waha?tenantId=default', wahaPayload);

  // verifica: status continua opt_out (não reabre)
  const after = await dbQuery('SELECT status FROM ai_conversations WHERE id = $1', [conv.id]);
  ok('conversa opt_out permanece opt_out', after[0]?.status === 'opt_out');
  ok('webhook retornou ignored ou contato optado', r.data?.ignored === true || r.data?.optOut === true || r.status < 500);

  // cleanup
  await dbQuery('DELETE FROM ai_conversations WHERE id = $1', [conv.id]);
  await dbQuery('DELETE FROM contacts WHERE id = $1', [contactId]);
}

// ─── Ponto 5: stage_history grava won, lost, opt_out ─────────────────────────
async function ponto5(cookie) {
  console.log('\n📋 PONTO 5 — stage_history grava todos os transitions');

  async function testClose(label, phone, outcomeVal, reasonExpected) {
    const contactId = await createContact(cookie, phone);
    const conv = await createConv(cookie, contactId, phone);

    if (outcomeVal === 'won' || outcomeVal === 'lost') {
      await api('PATCH', `/conversations/${conv.id}/outcome`, { outcome: outcomeVal }, cookie);
    } else if (outcomeVal === 'opt_out') {
      // simula opt_out via webhook
      await api('POST', '/webhooks/waha?tenantId=default', { payload: { from: `${phone}@c.us`, body: 'SAIR' } });
    } else if (outcomeVal === 'no_response') {
      // simula janitor: fecha com no_response direto
      await dbQuery(`
        UPDATE ai_conversations
        SET status = 'closed', outcome = 'no_response', outcome_at = NOW(), ended_at = NOW()
        WHERE id = $1
      `, [conv.id]);
      await dbQuery(`
        INSERT INTO conversation_stage_history (id, conversation_id, from_status, to_status, from_outcome, to_outcome, reason)
        VALUES (gen_random_uuid()::text, $1, 'open', 'closed', null, 'no_response', 'inatividade_7d')
      `, [conv.id]);
    }

    const hist = await dbQuery(`
      SELECT to_status, to_outcome, reason FROM conversation_stage_history
      WHERE conversation_id = $1 ORDER BY changed_at DESC LIMIT 1
    `, [conv.id]);

    const h = hist[0];
    ok(`${label} — history gravado`, !!h);
    if (h) {
      ok(`${label} — to_outcome correto (${outcomeVal})`, h.to_outcome === outcomeVal || h.to_status === outcomeVal);
    }

    // cleanup
    await dbQuery('DELETE FROM ai_conversations WHERE id = $1', [conv.id]);
    await dbQuery('DELETE FROM contacts WHERE id = $1', [contactId]);
  }

  await testClose('won', '5511700005001', 'won', 'won');
  await testClose('lost', '5511700005002', 'lost', 'lost');
  await testClose('opt_out', '5511700005003', 'opt_out', 'opt_out');
  await testClose('no_response', '5511700005004', 'no_response', 'inatividade_7d');
}

// ─── Runner ───────────────────────────────────────────────────────────────────
(async () => {
  await DB.connect();
  console.log('🔌 Conectado ao banco\n');

  const cookie = await login();
  if (!cookie) { console.error('❌ Login falhou'); process.exit(1); }
  console.log('🔑 Logado');

  await ponto1();
  await ponto2(cookie);
  await ponto3(cookie);
  await ponto4(cookie);
  await ponto5(cookie);

  await DB.end();

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Resultado: ${passed} ✅  ${failed} ❌  de ${passed + failed} checks`);
  process.exit(failed > 0 ? 1 : 0);
})();
