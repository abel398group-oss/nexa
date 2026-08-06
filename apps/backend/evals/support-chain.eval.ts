/**
 * Golden set — cadeia de suporte (classify → diagnose → resolve).
 *
 * F11 (auditoria KB 2026-08-06, Passo 4): mede se a Lia resolve sozinha e se
 * não alucina, contra casos representativos de cada categoria do
 * classificador — incluindo as duas que ganharam KB/playbook nesta rodada
 * (integracoes, api) e a que ganhou playbook próprio (cadastro).
 *
 * Roda a cadeia REAL — Anthropic de verdade, banco real via PrismaService
 * (o .env do backend aponta pro Postgres gerenciado, ver CLAUDE.md) — por
 * isso vive em evals/ e não em src/**\/*.spec.ts (ver vitest.eval.config.ts).
 *
 * Rodar: pnpm --filter backend eval
 * (ou: cd apps/backend && npx vitest run --config vitest.eval.config.ts)
 */
import { PrismaService } from '@/infra/prisma/prisma.service';
import { AnthropicService } from '@/shared/ai/anthropic.service';
import { EmbeddingsService } from '@/shared/ai/embeddings.service';
import { HiperTmsConnector } from '@/application/connectors/hipertms.connector';
import { ConnectorsService } from '@/application/connectors/connectors.service';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { PlaybookService } from '@/application/playbook/playbook.service';
import { CaseClassifierAgentService } from '@/application/agents/case-classifier-agent.service';
import { DiagnosticAgentService } from '@/application/agents/diagnostic-agent.service';
import { ResolutionAgentService } from '@/application/agents/resolution-agent.service';
import { EscalationAgentService } from '@/application/agents/escalation-agent.service';

const TENANT_ID = process.env.EVAL_TENANT_ID ?? 'default';

interface EvalCase {
  id: string;
  message: string;
  /** Categorias aceitáveis — o classificador pode variar a categoria exata (ex.: fiscal vs cte); listar as plausíveis evita falso-negativo por rigidez. */
  expectedCategories: string[];
}

const CASES: EvalCase[] = [
  { id: 'cte-rejeicao-539', message: 'meu CT-e foi rejeitado com o código 539, o que eu faço?', expectedCategories: ['cte', 'fiscal'] },
  { id: 'mdfe-nao-encerra', message: 'não consigo encerrar o MDF-e da viagem, o que pode ser?', expectedCategories: ['mdfe'] },
  { id: 'financeiro-abastecimento', message: 'lancei um abastecimento mas não gerou a conta a pagar', expectedCategories: ['financeiro', 'frota'] },
  { id: 'frota-cnh-vencida', message: 'apareceu um alerta de CNH vencida do motorista, onde eu vejo isso?', expectedCategories: ['frota'] },
  { id: 'cadastro-cnpj-duplicado', message: 'estou tentando cadastrar uma empresa mas diz que o CNPJ já existe', expectedCategories: ['cadastro'] },
  { id: 'integracoes-token', message: 'como eu gero o token pra integrar a API de vocês com o nosso sistema?', expectedCategories: ['integracoes', 'api'] },
  { id: 'api-401', message: 'estou recebendo erro 401 ao chamar a API de vocês, o que pode ser?', expectedCategories: ['api', 'integracoes'] },
  { id: 'acesso-senha', message: 'esqueci minha senha e não consigo entrar no sistema', expectedCategories: ['usuarios'] },
  { id: 'precificacao-frete-errado', message: 'o sistema não está calculando o valor do frete, aparece tabela não encontrada', expectedCategories: ['frete'] },
  { id: 'treinamento-cte-mdfe', message: 'qual a diferença entre CT-e e MDF-e, quando eu emito cada um?', expectedCategories: ['treinamento'] },
];

// Frases que a Lia NUNCA deveria usar — pedir identificação de quem já veio
// autenticado é o achado S-05 da auditoria de suporte (2026-08-05), regra
// reforçada tanto no DiagnosticAgent quanto no ResolutionAgent.
const PII_REQUEST_PATTERNS = [
  /qual (é |eh )?(o )?(seu )?cnpj/i,
  /informe (o )?(seu )?cpf/i,
  /(me )?(envie|passe|informe) (a )?senha/i,
  /qual (é |eh )?o número do seu contrato/i,
];

function buildChain() {
  const prisma = new PrismaService();
  const anthropic = new AnthropicService();
  const embeddings = new EmbeddingsService();
  const connector = new HiperTmsConnector();
  const connectors = new ConnectorsService(prisma, connector);
  const knowledge = new KnowledgeService(prisma, connectors, embeddings);
  const playbook = new PlaybookService(prisma);
  const classifier = new CaseClassifierAgentService(anthropic);
  const diagnostic = new DiagnosticAgentService(anthropic, connector);
  const resolution = new ResolutionAgentService(anthropic, knowledge, playbook);
  const escalation = new EscalationAgentService();
  return { prisma, anthropic, classifier, diagnostic, resolution, escalation };
}

describe('Golden set — cadeia de suporte real (classify → diagnose → resolve)', () => {
  const chain = buildChain();

  if (!chain.anthropic.configured) {
    it.skip('ANTHROPIC_API_KEY não configurada — golden set pulado', () => {});
    return;
  }

  afterAll(async () => {
    await chain.prisma.$disconnect();
  });

  it.each(CASES)('$id — classifica, diagnostica e responde sem alucinar', async (c) => {
    const classification = await chain.classifier.classify(c.message, '');
    const diag = await chain.diagnostic.diagnose({
      message: c.message,
      category: classification.category,
      history: '',
      tmsCustomer: null, // sem cliente identificado — pior caso, mais difícil de resolver
    });
    const resol = await chain.resolution.resolve({
      tenantId: TENANT_ID,
      message: c.message,
      category: classification.category,
      priority: classification.priority,
      diagnostic: diag,
      history: '',
      tmsCustomer: null,
    });
    const escalationDecision = chain.escalation.decide({
      message: c.message,
      category: classification.category,
      priority: classification.priority,
      diagnostic: diag,
      resolution: resol,
      requiresHumanFromClassifier: classification.requiresHuman,
    });

    // Relatório sempre impresso — é o que sustenta a revisão humana pedida no
    // Passo 4 (não dá pra automatizar 100% se "faz sentido", só sinalizar).
    // eslint-disable-next-line no-console
    console.log(
      `\n[${c.id}] categoria=${classification.category} prioridade=${classification.priority} ` +
      `resolved=${resol.resolved} confidence=${resol.confidence} escalate=${escalationDecision.escalate}\n` +
      `  KB usado: ${resol.usedKnowledge.map((k) => k.title).join(' | ') || '(nenhum)'}\n` +
      `  draft: ${resol.draft.slice(0, 300)}${resol.draft.length > 300 ? '…' : ''}\n`,
    );

    // 1) Categoria plausível — evita falso-negativo por rigidez, mas pega
    //    classificação claramente fora do baralho esperado.
    expect(c.expectedCategories).toContain(classification.category);

    // 2) Anti-PII: nunca pedir identificação de quem já veio autenticado (S-05).
    for (const re of PII_REQUEST_PATTERNS) {
      expect(resol.draft).not.toMatch(re);
    }

    // 3) Heurística de alucinação: se o draft cita um caminho de menu no
    //    formato "A → B" (ou "A > B"), o trecho deve aparecer em alguma
    //    fonte KB usada — não é prova formal, mas pega o caso mais comum de
    //    invenção (caminho de sistema que não existe em nenhuma fonte).
    const allowedFactsLower = resol.allowedFacts.toLowerCase();
    const menuPaths = resol.draft.match(/[A-ZÀ-Ú][\wÀ-ú ]{2,40}(?:→|>)[\wÀ-ú ]{2,40}/g) ?? [];
    for (const path of menuPaths) {
      const normalized = path.toLowerCase().replace(/[→>]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
      const anyWordGrounded = normalized.some((w) => allowedFactsLower.includes(w));
      if (!anyWordGrounded) {
        // eslint-disable-next-line no-console
        console.warn(`  ⚠️  [${c.id}] caminho de menu "${path}" não encontrado nas fontes KB usadas — possível alucinação`);
      }
      expect(anyWordGrounded).toBe(true);
    }

    // 4) needsHuman consistente: se a IA não resolveu, tem que ter decidido escalar.
    if (!resol.resolved) {
      expect(escalationDecision.escalate).toBe(true);
    }
  }, 60_000);
});
