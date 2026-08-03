/**
 * Troca a senha de um login do Nexa.
 *
 * Existe porque o platform admin (tenantId = NULL) não aparece na tela de
 * Usuários — ela lista por tenant — e não há rota de "trocar minha senha".
 * Enquanto essa lacuna não é fechada, este script é o caminho.
 *
 * Uso (a senha vem por argumento, então NUNCA passa por chat/log de terceiros):
 *   node scripts/trocar-senha-admin.js admin@nexa.local "MinhaSenhaForte123"
 */
const path = require('path');
const bcrypt = require(path.join(__dirname, '..', 'node_modules', 'bcrypt'));
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));

const [, , email, senha] = process.argv;

if (!email || !senha) {
  console.error('uso: node scripts/trocar-senha-admin.js <email> "<nova senha>"');
  process.exit(1);
}
if (senha.length < 8) {
  console.error('senha muito curta — use pelo menos 8 caracteres.');
  process.exit(1);
}
if (/^(admin123|123456|senha|password)$/i.test(senha)) {
  console.error('essa senha é trivial demais — escolha outra.');
  process.exit(1);
}

const prisma = new PrismaClient();

(async () => {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true } });
  if (!u) {
    console.error(`login "${email}" não existe.`);
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await bcrypt.hash(senha, 10) },
  });
  console.log(`senha trocada: ${u.email} (role=${u.role})`);
  console.log('teste o login antes de fechar o terminal.');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
