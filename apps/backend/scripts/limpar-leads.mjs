/**
 * limpar-leads.mjs — apaga os dados de LEADS de teste (2026-08-01, pré go-live).
 *
 * PRESERVA de propósito: vendedores (Seller), usuários, tenants, produtos,
 * playbook, base de conhecimento, configurações de monitor/alerta, canais de
 * e-mail, números de disparo (SenderNumber) e o histórico de aquecimento.
 *
 * APAGA: contatos, conversas e mensagens da IA, campanhas e seus alvos,
 * follow-ups, oportunidades, notificações do sino, reclamações e tokens.
 *
 * ⚠️ RODA CONTRA O BANCO DE PRODUÇÃO (DigitalOcean). Irreversível.
 *
 * Uso:
 *   node scripts/limpar-leads.mjs            → SÓ MOSTRA o que seria apagado
 *   node scripts/limpar-leads.mjs --apagar   → apaga de verdade
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APAGAR = process.argv.includes('--apagar');

// Ordem importa: filhos antes dos pais (evita erro de foreign key).
const ALVOS = [
  ['Mensagens da IA',            () => prisma.aiMessage,             (m) => m.deleteMany({})],
  ['Ações da IA',                () => prisma.aiAction,              (m) => m.deleteMany({})],
  ['Histórico de estágio',       () => prisma.conversationStageHistory, (m) => m.deleteMany({})],
  ['Perfis de cliente (IA)',     () => prisma.aiCustomerProfile,     (m) => m.deleteMany({})],
  ['Eventos pendentes',          () => prisma.pendingConversationEvent, (m) => m.deleteMany({})],
  ['Conversas',                  () => prisma.aiConversation,        (m) => m.deleteMany({})],
  ['Alvos de campanha',          () => prisma.campaignTarget,        (m) => m.deleteMany({})],
  ['Campanhas',                  () => prisma.campaign,              (m) => m.deleteMany({})],
  ['Follow-ups',                 () => prisma.followUp,              (m) => m.deleteMany({})],
  ['Histórico de oportunidade',  () => prisma.opportunityStageHistory, (m) => m.deleteMany({})],
  ['Oportunidades',              () => prisma.opportunity,           (m) => m.deleteMany({})],
  ['Notificações (sino)',        () => prisma.notification,          (m) => m.deleteMany({})],
  ['Avisos p/ vendedor',         () => prisma.sellerNotification,    (m) => m.deleteMany({})],
  ['Reclamações',                () => prisma.complaint,             (m) => m.deleteMany({})],
  ['Tokens de handoff',          () => prisma.handoffToken,          (m) => m.deleteMany({})],
  ['Tokens de descadastro',      () => prisma.emailOptOutToken,      (m) => m.deleteMany({})],
  ['Mensagens já processadas',   () => prisma.processedMessage,      (m) => m.deleteMany({})],
  ['Contatos',                   () => prisma.contact,               (m) => m.deleteMany({})],
];

async function main() {
  console.log(APAGAR ? '\n🔴 MODO APAGAR — isto é irreversível\n' : '\n🔎 SIMULAÇÃO (nada será apagado)\n');

  let total = 0;
  for (const [nome, model] of ALVOS) {
    const m = model();
    if (!m) { console.log(`  ?  ${nome.padEnd(28)} tabela não encontrada — pulada`); continue; }
    const n = await m.count();
    total += n;
    console.log(`  ${String(n).padStart(6)}  ${nome}`);
  }
  console.log(`  ${'-'.repeat(6)}`);
  console.log(`  ${String(total).padStart(6)}  TOTAL\n`);

  // Sempre mostra o que fica de pé — é o ponto da revisão.
  const vendedores = await prisma.seller.count();
  const usuarios = await prisma.user.count();
  const numeros = await prisma.senderNumber.count();
  console.log(`PRESERVADO: ${vendedores} vendedor(es), ${usuarios} usuário(s), ${numeros} número(s) de disparo.`);
  console.log('PRESERVADO: base de conhecimento, playbook, configurações de monitor/alerta, canais de e-mail.\n');

  if (!APAGAR) {
    console.log('Nada foi alterado. Para apagar de verdade:');
    console.log('  node scripts/limpar-leads.mjs --apagar\n');
    return;
  }

  for (const [nome, model, del] of ALVOS) {
    const m = model();
    if (!m) continue;
    const r = await del(m);
    console.log(`  apagado: ${String(r.count).padStart(6)}  ${nome}`);
  }
  console.log('\n✅ Limpeza concluída. Vendedores e configurações intactos.\n');
}

main()
  .catch((e) => { console.error('\n❌ ERRO:', e.message, '\nNada mais foi apagado.\n'); process.exit(1); })
  .finally(() => prisma.$disconnect());
