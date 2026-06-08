import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface Objection {
  objection: string;
  guidance: string;
}
export interface PlaybookConfig {
  persona: string;
  objections: Objection[];
  ctaCold: string;
  ctaWarm: string;
  ctaHot: string;
  signupUrl: string; // link de cadastro no site do TMS (fechamento)
}

// Defaults = o playbook que já estava no código. Servem de base e de fallback.
export const PLAYBOOK_DEFAULTS: PlaybookConfig = {
  persona: '',
  objections: [
    { objection: 'Tá caro', guidance: 'Reforce ROI: o HiperTMS evita multa fiscal, retrabalho e erro de precificação; o plano se paga com 1 frete bem cotado. Compare com o custo de errar um CT-e.' },
    { objection: 'Já uso outro sistema', guidance: 'Pergunte o que falta no atual; destaque o diferencial (tudo integrado: fiscal + frota + financeiro + precificação) e que a migração é simples.' },
    { objection: 'Vou pensar', guidance: 'Não pressione; ofereça um próximo passo de baixo compromisso (demo de 15 min ou teste) e pergunte qual a principal dúvida que ficou.' },
    { objection: 'É difícil de usar?', guidance: 'Tranquilize: é feito para a operação de transportadora; ofereça acompanhamento na implantação.' },
    { objection: 'Preciso falar com meu sócio/chefe', guidance: 'Ótimo sinal; ofereça material/uma call com os dois e pergunte o melhor momento.' },
  ],
  ctaCold:
    'Ainda explorando. Foque em entender a dor e mostrar valor com 1 benefício concreto. CTA leve (ex.: "quer que eu te mostre como isso funciona na prática?"). Não peça e-mail ainda.',
  ctaWarm:
    'Há interesse. Avance: ofereça uma demonstração rápida ou um teste, e colete UM dado de qualificação que ainda falte (porte da frota, volume de docs ou quem decide). CTA médio.',
  ctaHot:
    'O lead está pronto. Conduza pro cadastro: envie o LINK DE CADASTRO e oriente a criar a conta no site (lá ele finaliza). Ofereça ajuda se travar. Se preferir falar com alguém, use ACTION=handoff_human.',
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
        ...(dto.objections !== undefined ? { objections: clean as any } : {}),
        ...(dto.ctaCold !== undefined ? { ctaCold: dto.ctaCold } : {}),
        ...(dto.ctaWarm !== undefined ? { ctaWarm: dto.ctaWarm } : {}),
        ...(dto.ctaHot !== undefined ? { ctaHot: dto.ctaHot } : {}),
        ...(dto.signupUrl !== undefined ? { signupUrl: dto.signupUrl } : {}),
      },
      create: {
        tenantId,
        persona: dto.persona ?? PLAYBOOK_DEFAULTS.persona,
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
