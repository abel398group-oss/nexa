// Aplica a persona institucional + CTAs (defaults do Playbook) no tenant, direto no banco.
// Equivale a clicar "Restaurar padrão" na tela Playbook, mas sem precisar reiniciar o backend.
//
// Uso (a partir de apps/backend):
//   node scripts/apply-playbook.mjs
//   node scripts/apply-playbook.mjs --tenant=default

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of envFile.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    /* sem .env — assume DATABASE_URL no ambiente */
  }
}

const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
const TENANT = tenantArg ? tenantArg.split('=')[1] : process.env.TEST_TENANT ?? 'default';

// === Defaults institucionais (espelham PLAYBOOK_DEFAULTS em playbook.service.ts) ===
const persona =
  'Adote postura institucional e profissional, adequada a uma negociação B2B entre empresas: a economia e o ganho são para a EMPRESA do cliente (a operação de transporte), não para a pessoa. ' +
  'Fundamente o valor na metodologia de precificação do HiperTMS — consumo de combustível (km/litro), manutenção preventiva, depreciação do veículo, custos com motorista, impostos do CT-e, margem-alvo e as demais variáveis que compõem o custo real do transporte de carga. ' +
  'Use o vocabulário técnico do setor (custo por km, margem, frota, CT-e) com naturalidade e fale como uma especialista em gestão de transporte. Seja objetiva, segura e consultiva; evite gírias e excesso de informalidade.';

const objections = [
  { objection: 'Tá caro', guidance: 'Reposicione o custo como investimento da operação: o HiperTMS evita multa fiscal, retrabalho e erro de precificação. Mostre que ao precificar pelo custo real (consumo, manutenção, depreciação, margem) o sistema se paga ao evitar poucos fretes mal cotados por mês. Compare com o prejuízo de um CT-e errado.' },
  { objection: 'Já uso outro sistema', guidance: 'Pergunte o que falta no atual; destaque o diferencial (tudo integrado: fiscal + frota + financeiro + precificação por custo real) e que a migração é acompanhada.' },
  { objection: 'Vou pensar', guidance: 'Não pressione; ofereça um próximo passo técnico de baixo compromisso (uma cotação demonstrando custos e margem de uma rota real) e pergunte qual a principal dúvida que ficou.' },
  { objection: 'É difícil de usar?', guidance: 'Tranquilize: é feito para a operação de transportadora; ofereça acompanhamento na implantação.' },
  { objection: 'Preciso falar com meu sócio/chefe', guidance: 'Ótimo sinal; ofereça material/uma call com os dois e pergunte o melhor momento.' },
];

const ctaCold =
  'Ainda explorando. Foque em entender a operação (porte da frota, principais dores de custo) e mostre 1 ganho concreto ligado a custo ou margem. CTA leve e técnico (ex.: "quer que eu te mostre como o sistema calcula o custo real de um frete?"). Não peça e-mail ainda.';
const ctaWarm =
  'Há interesse. Avance com proposta técnica: ofereça preparar uma cotação rápida demonstrando os custos e a margem de uma rota real do cliente, facilitando a tomada de decisão. Colete UM dado de qualificação que ainda falte (porte da frota, volume de docs/mês ou quem decide). CTA médio.';
const ctaHot =
  'O lead está pronto. Reforce o ganho em custo/margem e conduza ao cadastro: envie o LINK DE CADASTRO e oriente a criar a conta no site (lá ele finaliza). Ofereça preparar a cotação demonstrando custos e margem para embasar a decisão ou um eventual desconto. Se preferir falar com alguém, use ACTION=handoff_human.';
const signupUrl = 'https://www.hipertms.com.br/signup';

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const data = { persona, objections, ctaCold, ctaWarm, ctaHot, signupUrl };
  await prisma.salesPlaybook.upsert({
    where: { tenantId: TENANT },
    update: data,
    create: { tenantId: TENANT, ...data },
  });

  console.log(`Playbook institucional aplicado ao tenant "${TENANT}".`);
  console.log('Persona e CTAs atualizados (tom B2B, foco em custo/margem). Sem reiniciar o backend.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro:', e?.message ?? e);
  process.exit(1);
});
