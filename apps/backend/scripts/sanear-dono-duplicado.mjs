/**
 * Saneamento pontual: contato com o MESMO lead na carteira de dois vendedores.
 *
 * Resíduo do bug corrigido em `lead-distribution.ts` (commit e05ffdf): a distribuição
 * de um lote novo sorteava dono olhando só a oportunidade, sem ver que o contato já
 * era de alguém, e sobrescrevia o `ownerSellerId` do contato. A oportunidade antiga
 * ficava com o dono antigo — dois SDRs no mesmo lead, os dois ligando.
 *
 * O que faz: alinha as oportunidades do contato ao dono da oportunidade MAIS ANTIGA
 * (quem começou a trabalhar o lead), e põe o `ownerSellerId` do contato no mesmo dono.
 *
 * O que NÃO faz, em nenhuma circunstância: DELETE, DROP, TRUNCATE, migration, alteração
 * de schema. São dois UPDATE de uma coluna cada. O total de oportunidades e de contatos
 * é contado antes e depois, e o script grita se qualquer um dos dois mudar.
 *
 * Modo padrão é CONFERÊNCIA — imprime o plano e sai sem escrever. Só grava com
 * `--aplicar`.
 *
 *   node scripts/sanear-dono-duplicado.mjs
 *   node scripts/sanear-dono-duplicado.mjs --aplicar
 */
import { PrismaClient } from '@prisma/client';

const APLICAR = process.argv.includes('--aplicar');
/// Teto de segurança: se o problema for maior do que se espera, é para alguém olhar
/// antes de um script escrever em massa.
const MAX_GRUPOS = 200;

const prisma = new PrismaClient();

function agrupar(ops) {
  const grupos = new Map();
  for (const o of ops) {
    if (!o.contactId) continue;
    const atual = grupos.get(o.contactId);
    if (atual) atual.push(o);
    else grupos.set(o.contactId, [o]);
  }
  return grupos;
}

async function main() {
  const opsAntes = await prisma.opportunity.count();
  const contatosAntes = await prisma.contact.count();
  console.log(`antes: ${opsAntes} oportunidades, ${contatosAntes} contatos`);

  const ops = await prisma.opportunity.findMany({
    where: { contactId: { not: null } },
    select: {
      id: true,
      tenantId: true,
      contactId: true,
      assignedSellerId: true,
      createdAt: true,
      company: true,
      name: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const conflitos = [];
  for (const [contactId, irmas] of agrupar(ops)) {
    const donos = new Set(irmas.map((o) => o.assignedSellerId).filter(Boolean));
    if (donos.size < 2) continue;
    // A mais antiga com dono manda. `orderBy asc` já garante a ordem.
    const dono = irmas.find((o) => o.assignedSellerId)?.assignedSellerId;
    conflitos.push({ contactId, dono, irmas });
  }

  if (!conflitos.length) {
    console.log('\nNenhum contato com dono duplicado. Nada a fazer.');
    return;
  }
  if (conflitos.length > MAX_GRUPOS) {
    console.log(`\nABORTADO: ${conflitos.length} grupos, acima do teto de ${MAX_GRUPOS}.`);
    console.log('Isso é grande demais para um script pontual — investigar antes.');
    process.exitCode = 1;
    return;
  }

  // Nomes dos vendedores só para o relatório ficar legível.
  const sellerIds = [...new Set(conflitos.flatMap((c) => c.irmas.map((o) => o.assignedSellerId)).filter(Boolean))];
  const sellers = await prisma.seller.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, name: true },
  });
  const nome = (id) => sellers.find((s) => s.id === id)?.name ?? id ?? '(sem dono)';

  console.log(`\n${conflitos.length} contato(s) com dono duplicado:\n`);
  const plano = [];
  for (const c of conflitos) {
    const rotulo = c.irmas[0].company ?? c.irmas[0].name ?? c.contactId;
    console.log(`  ${rotulo}`);
    console.log(`    fica com: ${nome(c.dono)} (dono da oportunidade mais antiga)`);
    for (const o of c.irmas) {
      const muda = o.assignedSellerId !== c.dono;
      console.log(
        `    op ${o.id.slice(0, 8)} de ${o.createdAt.toISOString().slice(0, 10)}: ` +
          `${nome(o.assignedSellerId)}${muda ? ` -> ${nome(c.dono)}` : ' (mantém)'}`,
      );
      if (muda) plano.push({ tipo: 'opportunity', id: o.id, dono: c.dono });
    }

    const contato = await prisma.contact.findUnique({
      where: { id: c.contactId },
      select: { ownerSellerId: true },
    });
    if (contato && contato.ownerSellerId !== c.dono) {
      console.log(`    contato: ${nome(contato.ownerSellerId)} -> ${nome(c.dono)}`);
      plano.push({ tipo: 'contact', id: c.contactId, dono: c.dono });
    }
    console.log('');
  }

  if (!APLICAR) {
    console.log(`CONFERÊNCIA: ${plano.length} atualização(ões) planejada(s). Nada foi escrito.`);
    console.log('Para aplicar: node scripts/sanear-dono-duplicado.mjs --aplicar');
    return;
  }

  let feitas = 0;
  for (const p of plano) {
    if (p.tipo === 'opportunity') {
      await prisma.opportunity.update({ where: { id: p.id }, data: { assignedSellerId: p.dono } });
    } else {
      await prisma.contact.update({ where: { id: p.id }, data: { ownerSellerId: p.dono } });
    }
    feitas += 1;
  }
  console.log(`${feitas} atualização(ões) aplicada(s).`);

  // Conferência de integridade: contagem tem que ser IDÊNTICA — o script não cria nem
  // remove linha nenhuma. Schema existir não é dado existir; contar é o que prova.
  const opsDepois = await prisma.opportunity.count();
  const contatosDepois = await prisma.contact.count();
  console.log(`depois: ${opsDepois} oportunidades, ${contatosDepois} contatos`);
  if (opsDepois !== opsAntes || contatosDepois !== contatosAntes) {
    console.log('ALERTA: a contagem mudou. Isto não deveria acontecer — investigar já.');
    process.exitCode = 1;
    return;
  }

  const restantes = [...agrupar(
    await prisma.opportunity.findMany({
      where: { contactId: { not: null } },
      select: { id: true, contactId: true, assignedSellerId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ).values()].filter((irmas) => new Set(irmas.map((o) => o.assignedSellerId).filter(Boolean)).size > 1);
  console.log(`conflitos restantes: ${restantes.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
