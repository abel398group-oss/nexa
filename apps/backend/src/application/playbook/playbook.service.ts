import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface Objection {
  objection: string;
  guidance: string;
}
export interface PlaybookConfig {
  persona: string;
  supportPersona: string; // tom da Lia de SUPORTE (separado do de vendas)
  objections: Objection[];
  ctaCold: string;
  ctaWarm: string;
  ctaHot: string;
  signupUrl: string; // link de cadastro no site do TMS (fechamento)
}

// Defaults = o playbook que já estava no código. Servem de base e de fallback.
export const PLAYBOOK_DEFAULTS: PlaybookConfig = {
  persona:
    'Adote postura institucional e profissional, adequada a uma negociação B2B entre empresas: a economia e o ganho são para a EMPRESA do cliente (a operação de transporte), não para a pessoa. ' +
    'Fundamente o valor na metodologia de precificação do HiperTMS — consumo de combustível (km/litro), manutenção preventiva, depreciação do veículo, custos com motorista, impostos do CT-e, margem-alvo e as demais variáveis que compõem o custo real do transporte de carga. ' +
    'Use o vocabulário técnico do setor (custo por km, margem, frota, CT-e) com naturalidade e fale como uma especialista em gestão de transporte. Seja objetiva, segura e consultiva; evite gírias e excesso de informalidade.',
  supportPersona:
    'Você é a Lia, assistente de suporte técnico do HiperTMS. ' +
    'Seu único objetivo é resolver o problema do cliente de forma rápida e precisa. ' +
    'Tom: direto, técnico e empático — reconheça o problema antes de propor a solução, sem enrolação. ' +
    'Nunca tente vender, nunca mencione planos ou upgrades. ' +
    'Use o primeiro nome do cliente quando disponível, de forma natural (não repita a cada mensagem). ' +
    'Mensagens curtas e objetivas, adequadas ao WhatsApp: sem markdown (asteriscos, #, underline), sem listas com traços. ' +
    'Quando não tiver certeza da solução, seja transparente: diga que vai encaminhar para um especialista, sem inventar respostas. ' +
    'Quando a solução envolver passos, use numeração simples (1. 2. 3.) em linhas separadas, sem bullet points. ' +
    'Encerre sempre com uma pergunta de confirmação (ex.: "Isso resolveu o problema?") para garantir o fechamento do chamado.',
  objections: [
    { objection: 'Tá caro', guidance: 'Reposicione o custo como investimento da operação: o HiperTMS evita multa fiscal, retrabalho e erro de precificação. Mostre que ao precificar pelo custo real (consumo, manutenção, depreciação, margem) o sistema se paga ao evitar poucos fretes mal cotados por mês. Compare com o prejuízo de um CT-e errado.' },
    { objection: 'Já uso outro sistema', guidance: 'Pergunte o que falta no atual; destaque o diferencial (tudo integrado: fiscal + frota + financeiro + precificação por custo real) e que a migração é acompanhada.' },
    { objection: 'Vou pensar', guidance: 'Não pressione; ofereça um próximo passo técnico de baixo compromisso (uma cotação demonstrando custos e margem de uma rota real) e pergunte qual a principal dúvida que ficou.' },
    { objection: 'É difícil de usar?', guidance: 'Tranquilize: é feito para a operação de transportadora; ofereça acompanhamento na implantação.' },
    { objection: 'Preciso falar com meu sócio/chefe', guidance: 'Ótimo sinal; ofereça material/uma call com os dois e pergunte o melhor momento.' },
  ],
  ctaCold:
    'Ainda explorando. Foque em entender a operação (porte da frota, principais dores de custo) e mostre 1 ganho concreto ligado a custo ou margem. ' +
    // 2026-08-01: a calculadora PÚBLICA (piso ANTT / dedicado / fracionado) não
    // exige cadastro — é o convite de menor atrito que existe hoje e converte
    // melhor que oferecer demonstração para quem ainda nem sabe se tem interesse.
    'CTA leve e técnico: ofereça a CALCULADORA DE FRETE gratuita do HiperTMS (piso mínimo da ANTT, dedicado ou fracionado) — ' +
    'ele usa sozinho, sem cadastro e sem compromisso, e já sente o valor do cálculo por custo real. ' +
    'Alternativa: "quer que eu te mostre como o sistema calcula o custo real de um frete?". Não peça e-mail ainda.',
  ctaWarm:
    'Há interesse. Avance com proposta técnica: ofereça preparar uma cotação rápida demonstrando os custos e a margem de uma rota real do cliente, facilitando a tomada de decisão. Colete UM dado de qualificação que ainda falte (porte da frota, volume de docs/mês ou quem decide). CTA médio.',
  ctaHot:
    'O lead está pronto. Reforce o ganho em custo/margem e conduza ao cadastro: envie o LINK DE CADASTRO e oriente a criar a conta no site (lá ele finaliza). Ofereça preparar a cotação demonstrando custos e margem para embasar a decisão ou um eventual desconto. Se preferir falar com alguém, use ACTION=handoff_human.',
  signupUrl: 'https://www.hipertms.com.br/signup',
};

@Injectable()
export class PlaybookService {
  constructor(private readonly prisma: PrismaService) {}

  // Retorna a config do tenant, criando com defaults na primeira vez.
  async get(tenantId: string): Promise<PlaybookConfig> {
    let row = await this.prisma.salesPlaybook.findUnique({ where: { tenantId } });
    if (!row) {
      row = await this.prisma.salesPlaybook.create({
        data: {
          tenantId,
          persona: PLAYBOOK_DEFAULTS.persona,
          supportPersona: PLAYBOOK_DEFAULTS.supportPersona,
          objections: PLAYBOOK_DEFAULTS.objections as any,
          ctaCold: PLAYBOOK_DEFAULTS.ctaCold,
          ctaWarm: PLAYBOOK_DEFAULTS.ctaWarm,
          ctaHot: PLAYBOOK_DEFAULTS.ctaHot,
          signupUrl: PLAYBOOK_DEFAULTS.signupUrl,
        },
      });
    }
    return {
      persona: row.persona || '',
      supportPersona: (row as any).supportPersona || '',
      objections: (Array.isArray(row.objections) ? row.objections : []) as unknown as Objection[],
      ctaCold: row.ctaCold || PLAYBOOK_DEFAULTS.ctaCold,
      ctaWarm: row.ctaWarm || PLAYBOOK_DEFAULTS.ctaWarm,
      ctaHot: row.ctaHot || PLAYBOOK_DEFAULTS.ctaHot,
      signupUrl: (row as any).signupUrl || PLAYBOOK_DEFAULTS.signupUrl,
    };
  }

  async update(tenantId: string, dto: Partial<PlaybookConfig>): Promise<PlaybookConfig> {
    const clean = (dto.objections ?? [])
      .filter((o) => o && o.objection?.trim())
      .map((o) => ({ objection: String(o.objection).trim(), guidance: String(o.guidance ?? '').trim() }));
    await this.prisma.salesPlaybook.upsert({
      where: { tenantId },
      update: {
        ...(dto.persona !== undefined ? { persona: dto.persona } : {}),
        ...(dto.supportPersona !== undefined ? { supportPersona: dto.supportPersona } : {}),
        ...(dto.objections !== undefined ? { objections: clean as any } : {}),
        ...(dto.ctaCold !== undefined ? { ctaCold: dto.ctaCold } : {}),
        ...(dto.ctaWarm !== undefined ? { ctaWarm: dto.ctaWarm } : {}),
        ...(dto.ctaHot !== undefined ? { ctaHot: dto.ctaHot } : {}),
        ...(dto.signupUrl !== undefined ? { signupUrl: dto.signupUrl } : {}),
      },
      create: {
        tenantId,
        persona: dto.persona ?? PLAYBOOK_DEFAULTS.persona,
        supportPersona: dto.supportPersona ?? PLAYBOOK_DEFAULTS.supportPersona,
        objections: (dto.objections !== undefined ? clean : PLAYBOOK_DEFAULTS.objections) as any,
        ctaCold: dto.ctaCold ?? PLAYBOOK_DEFAULTS.ctaCold,
        ctaWarm: dto.ctaWarm ?? PLAYBOOK_DEFAULTS.ctaWarm,
        ctaHot: dto.ctaHot ?? PLAYBOOK_DEFAULTS.ctaHot,
        signupUrl: dto.signupUrl ?? PLAYBOOK_DEFAULTS.signupUrl,
      },
    });
    return this.get(tenantId);
  }

  // restaura os defaults de fábrica
  async reset(tenantId: string): Promise<PlaybookConfig> {
    return this.update(tenantId, PLAYBOOK_DEFAULTS);
  }
}
