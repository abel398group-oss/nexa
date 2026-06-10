/**
 * seed-support-playbooks.ts
 * Seed dos playbooks de diagnóstico de suporte na AiKnowledgeBase (ADR 017).
 * Idempotente — usa upsert por title.
 *
 * Executar:
 *   cd apps/backend && npx tsx prisma/seed-support-playbooks.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT = 'default';
const PRODUCT = 'hipertms';

interface PlaybookArticle {
  topic: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
}

const SUPPORT_PLAYBOOKS: PlaybookArticle[] = [

  // ── CT-e: fluxo de diagnóstico principal ────────────────────────────────
  {
    topic: 'cte-diagnostico',
    category: 'suporte',
    title: 'Playbook — CT-e não transmite / rejeição SEFAZ',
    content:
      'PLAYBOOK DE DIAGNÓSTICO — "Não consigo emitir CT-e" ou "CT-e rejeitado pela SEFAZ"\n\n' +
      'PASSO 1 — Identificar o erro\n' +
      'Perguntar: "Qual o código ou mensagem de rejeição que apareceu?"\n' +
      'Perguntar: "Qual o ambiente — homologação ou produção?"\n\n' +
      'PASSO 2 — Identificar o documento\n' +
      'Perguntar: "Qual o número do CT-e ou da chave de acesso?"\n' +
      'Perguntar: "Qual CNPJ emitente?"\n\n' +
      'PASSO 3 — Diagnóstico por código de rejeição\n' +
      '• Código 562 (CT-e já cancelado): orientar — emitir novo CT-e, o cancelado não tem retransmissão.\n' +
      '• Código 539 (CFOP inválido para UF): orientar — revisar CFOP em Configurações > Fiscal > CFOP.\n' +
      '• Código 204 (duplicidade): orientar — verificar se o CT-e já foi emitido com mesmo número; alterar numeração.\n' +
      '• Código 581 (certificado expirado/inválido): orientar — renovar o PFX em Configurações > Fiscal > Certificados.\n' +
      '• Ambiente homologação em vez de produção: orientar — mudar o ambiente em Configurações > Fiscal > Ambiente.\n' +
      '• Código desconhecido: escalar para suporte humano com XML do CT-e.\n\n' +
      'PASSO 4 — Resolução\n' +
      'Após identificar a causa: orientar a correção específica e pedir para o cliente tentar novamente.\n' +
      'Se não resolver após 2 tentativas: escalar com o XML e o código de erro.',
    tags: ['cte', 'rejeicao', 'sefaz', 'playbook', 'diagnostico', 'transmissao'],
  },

  {
    topic: 'cte-certificado',
    category: 'suporte',
    title: 'Playbook — Certificado digital expirado ou inválido (CT-e/MDF-e)',
    content:
      'PLAYBOOK — Certificado digital com problema\n\n' +
      'Sintomas: rejeição SEFAZ código 581, "certificado inválido", emissão bloqueada.\n\n' +
      'DIAGNÓSTICO:\n' +
      '1. Perguntar: "O certificado PFX foi renovado recentemente?"\n' +
      '2. Perguntar: "Qual a data de validade do certificado atual?"\n\n' +
      'ORIENTAÇÃO:\n' +
      '• Se vencido: o cliente precisa obter novo certificado A1 junto à Certisign, Serasa, Soluti ou similar.\n' +
      '• Após obter novo PFX: Configurações → Fiscal → Certificados → Upload do novo arquivo + senha.\n' +
      '• O sistema detecta automaticamente UF e validade.\n' +
      '• Após upload: tentar emissão novamente.\n\n' +
      'ATENÇÃO: nunca pedir a senha do certificado pelo chat — orientar o cliente a inseri-la diretamente no sistema.',
    tags: ['certificado', 'pfx', 'expirado', 'a1', 'cte', 'mdfe', 'playbook'],
  },

  // ── MDF-e ────────────────────────────────────────────────────────────────
  {
    topic: 'mdfe-diagnostico',
    category: 'suporte',
    title: 'Playbook — MDF-e não transmite / encerramento pendente',
    content:
      'PLAYBOOK — MDF-e com problema de transmissão ou encerramento\n\n' +
      'PASSO 1 — Identificar o problema\n' +
      'Perguntar: "O MDF-e não foi autorizado ou está com encerramento pendente?"\n' +
      'Perguntar: "Qual o código de rejeição, se aparecer?"\n\n' +
      'PASSO 2 — Diagnóstico\n' +
      '• Não autorizado: verificar certificado (mesma causa do CT-e) e ambiente (homologação/produção).\n' +
      '• Encerramento pendente: o MDF-e foi autorizado mas a viagem terminou sem encerrar.\n' +
      '  → Orientar: Viagens → selecionar a viagem → botão Encerrar MDF-e.\n' +
      '• MDF-e com CT-e cancelado vinculado: remover o CT-e cancelado e retransmitir.\n\n' +
      'PASSO 3 — Resolução\n' +
      'Se o erro persistir com código desconhecido: solicitar o XML do MDF-e e escalar.',
    tags: ['mdfe', 'encerramento', 'viagem', 'playbook', 'diagnostico'],
  },

  // ── Cadastro / Usuários ──────────────────────────────────────────────────
  {
    topic: 'acesso-usuario',
    category: 'suporte',
    title: 'Playbook — Usuário sem acesso / esqueceu senha',
    content:
      'PLAYBOOK — Problema de acesso de usuário\n\n' +
      'CASOS:\n\n' +
      '1. Esqueceu a senha:\n' +
      '   → Orientar: tela de login → "Esqueci minha senha" → e-mail de recuperação.\n' +
      '   → Se não receber o e-mail: verificar spam; confirmar o e-mail cadastrado.\n\n' +
      '2. Usuário bloqueado / inativo:\n' +
      '   → Apenas o administrador do tenant pode reativar.\n' +
      '   → Orientar o admin: Usuários → selecionar o usuário → Reativar.\n\n' +
      '3. Sem permissão para módulo específico:\n' +
      '   → Orientar o admin: Usuários → Perfis → adicionar permissão para o módulo.\n\n' +
      '4. Limite de usuários do plano atingido:\n' +
      '   → Informar que o plano atual tem limite de usuários.\n' +
      '   → Sugerir upgrade ou inativar usuário não utilizado.',
    tags: ['acesso', 'senha', 'usuario', 'login', 'permissao', 'playbook'],
  },

  // ── Frete / Precificação ─────────────────────────────────────────────────
  {
    topic: 'frete-calculo',
    category: 'suporte',
    title: 'Playbook — Cálculo de frete errado ou motor não retorna valor',
    content:
      'PLAYBOOK — Problema no cálculo de frete\n\n' +
      'PASSO 1 — Identificar o escopo\n' +
      'Perguntar: "O frete está calculando zero, um valor errado, ou não calcula nenhum resultado?"\n' +
      'Perguntar: "É FCL (carga completa) ou LCL (fracionado)?"\n' +
      'Perguntar: "Qual a rota (origem → destino)?"\n\n' +
      'DIAGNÓSTICO:\n' +
      '• Frete zero ou sem resultado: verificar se as tabelas de frete foram importadas/configuradas para essa rota.\n' +
      '  → Configurações → Precificação → Tabelas → verificar se a rota existe.\n' +
      '• Tabela existe mas não materializada: o motor precisa materializar antes de calcular.\n' +
      '  → Configurações → Precificação → Materializar.\n' +
      '• Valor errado: verificar se o markup (margem) está configurado e se o regime tributário está correto.\n' +
      '• Contrato de cliente ignorado: verificar se o contrato está ativo e vinculado ao cliente correto.\n\n' +
      'Se os passos acima não resolverem: escalar com os detalhes da rota e do embarque.',
    tags: ['frete', 'calculo', 'precificacao', 'tabela', 'motor', 'playbook'],
  },

];

async function main() {
  console.log('Seeding support playbooks...');
  let count = 0;

  for (const article of SUPPORT_PLAYBOOKS) {
    await prisma.aiKnowledgeBase.upsert({
      where: {
        // Não há unique por title, então usa tenantId+title via raw workaround:
        // Prisma não tem @@unique aqui — usamos findFirst + create/update
        // Workaround: criamos um índice virtual via id fixo por title hash
        id: Buffer.from(`${TENANT}:${article.title}`).toString('base64').slice(0, 36).replace(/[^a-zA-Z0-9-]/g, '0'),
      },
      update: {
        content: article.content,
        tags: article.tags,
      },
      create: {
        id: Buffer.from(`${TENANT}:${article.title}`).toString('base64').slice(0, 36).replace(/[^a-zA-Z0-9-]/g, '0'),
        tenantId: TENANT,
        productCode: PRODUCT,
        topic: article.topic,
        category: article.category,
        title: article.title,
        content: article.content,
        tags: article.tags,
      },
    });
    count++;
    console.log(`  ✓ ${article.title}`);
  }

  console.log(`\nPlaybooks de suporte inseridos/atualizados: ${count}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
