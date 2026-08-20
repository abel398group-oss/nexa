/**
 * message-templates.service.ts — biblioteca de mensagens do mercado (ADR 037).
 *
 * Antes não existia: cada campanha era texto digitado do zero, e a única forma de
 * reaproveitar era clonar — foi assim que a base de produção virou "Cópia de Cópia de
 * teste". O modelo é o que o vendedor escolhe no disparo, e vive dentro de um mercado
 * para que copy de um parceiro nunca chegue à lista de outro.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { SenderService } from '@/application/sender/sender.service';
import { renderEmailHtml, type EmailBrand } from '@/application/email/email-template';
import { EmailReplyService } from '@/application/email/email-reply.service';
import { identidadeDoMercado } from '@/application/email/email-market-identity';
import { AnthropicService } from '@/shared/ai/anthropic.service';
import {
  SISTEMA_RASCUNHO,
  promptDoRascunho,
  peneirarRascunhos,
  type RascunhoDeModelo,
} from './template-draft';

export interface TemplateInput {
  productCode: string;
  name: string;
  channel: string;
  subject?: string | null;
  body: string;
  step?: number;
}

/** Um alerta do teste — o que costuma sair errado e só aparece renderizado. */
export interface AvisoDeTeste {
  gravidade: 'erro' | 'aviso';
  texto: string;
}

@Injectable()
export class MessageTemplatesService {
  private readonly logger = new Logger('MessageTemplates');

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailReply: EmailReplyService,
    private readonly ai: AnthropicService,
  ) {}

  /**
   * Rascunha modelos a partir do ROTEIRO APROVADO do mercado (19/08/2026).
   *
   * Fecha o elo que faltava na esteira: `market_assets` e `message_templates` eram
   * tabelas sem referência uma à outra, e nenhum código lia a primeira para escrever a
   * segunda. Quem aprovava um plano de 11 KB abria esta tela e via zero modelos — o
   * documento ficava do lado, para ser relido e redigitado à mão.
   *
   * Devolve PROPOSTA, não grava nada. Quem salva é a pessoa, depois de ler e de rodar
   * o "Gerar teste" para ver como a mensagem chega. Afrouxar isso justamente no passo
   * em que quem escreveu foi a máquina seria trocar a revisão pelo palpite dela.
   */
  async rascunhar(
    tenantId: string,
    productCode: string,
    canal: 'email' | 'whatsapp',
    quantos: number,
  ): Promise<RascunhoDeModelo[]> {
    const roteiros = await this.prisma.marketAsset.findMany({
      // `approved` e `plan`: portfólio é PDF (não tem texto para ler) e pendente é,
      // por definição, texto que ninguém revisou — a fonte do rascunho não pode ser
      // menos confiável que o que a aprovação garante.
      where: { tenantId, productCode, kind: 'plan', status: 'approved' },
      select: { name: true, content: true },
      orderBy: { name: 'asc' },
    });

    const comTexto = roteiros.filter((r): r is { name: string; content: string } => !!r.content);
    if (!comTexto.length) {
      throw new BadRequestException(
        'Este mercado ainda não tem roteiro aprovado. Suba e aprove o plano em Validação de campanha.',
      );
    }

    let bruto: unknown;
    try {
      bruto = await this.ai.completeJson(
        SISTEMA_RASCUNHO,
        promptDoRascunho(canal, quantos, comTexto),
        // Teto alto: são `quantos` mensagens inteiras, e cortar no meio devolve um
        // JSON truncado que a peneira descarta por inteiro.
        { maxTokens: 1200 + quantos * 500 },
      );
    } catch (e) {
      // REGRA 3: o motivo original vai para o log antes de virar 4xx genérico.
      this.logger.warn(
        `Rascunho de modelos falhou (mercado=${productCode} canal=${canal}): ${(e as Error).message}`,
      );
      throw new BadRequestException(
        'Não consegui rascunhar as mensagens agora. Tente de novo em alguns instantes.',
      );
    }

    const rascunhos = peneirarRascunhos(bruto, canal, quantos);
    if (!rascunhos.length) {
      this.logger.warn(`Rascunho de modelos veio vazio ou fora de formato (mercado=${productCode})`);
      throw new BadRequestException(
        'A resposta veio fora do formato esperado. Tente de novo.',
      );
    }

    this.logger.log(
      `Rascunhou ${rascunhos.length} modelo(s) de ${canal} a partir de ` +
        `${comTexto.length} roteiro(s) aprovado(s) em ${productCode}`,
    );
    return rascunhos;
  }

  /**
   * `somenteAprovados` é o que o seletor do Disparo pede: rascunho não pode ser
   * oferecido a quem monta campanha — é a trava toda. A tela de Mensagens lista
   * tudo, porque rascunho enterrado é rascunho que ninguém revisa.
   */
  list(tenantId: string, productCode?: string, channel?: string, somenteAprovados = false) {
    return (this.prisma as any).messageTemplate.findMany({
      where: {
        tenantId,
        active: true,
        ...(productCode ? { productCode } : {}),
        ...(channel ? { channel } : {}),
        ...(somenteAprovados ? { status: 'approved' } : {}),
      },
      orderBy: [{ productCode: 'asc' }, { step: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: TemplateInput) {
    this.validar(dto);
    // O mercado precisa existir: um typo no productCode criaria um modelo órfão —
    // não aparece no seletor do Disparo (que filtra por mercado), não conta na
    // trava de liberação do mercado certo, e some em silêncio. Mesma regra da
    // trava de mercado no disparo (market-gate).
    const mercado = await this.prisma.product.findUnique({
      where: { code: dto.productCode },
      select: { code: true },
    });
    if (!mercado) {
      throw new BadRequestException(
        `Mercado "${dto.productCode}" não existe. Confira o código na tela de Mercados.`,
      );
    }
    return this.prisma.messageTemplate.create({
      data: {
        tenantId,
        productCode: dto.productCode,
        name: dto.name.trim(),
        channel: dto.channel,
        subject: dto.channel === 'email' ? (dto.subject?.trim() || null) : null,
        body: dto.body,
        step: dto.step ?? 1,
      },
    });
  }

  async update(tenantId: string, id: string, dto: Partial<TemplateInput>) {
    const atual = await this.prisma.messageTemplate.findFirst({ where: { id, tenantId } });
    if (!atual) throw new NotFoundException('Modelo não encontrado');
    if (dto.body !== undefined || dto.channel !== undefined) {
      this.validar({ ...atual, ...dto } as TemplateInput);
    }
    // Mexer no TEXTO derruba a aprovação — mesma regra do material de campanha:
    // aprovar o texto de ontem e deixar o de hoje entrar por baixo dá a garantia
    // sem cumpri-la. Renomear e reordenar (step) não derrubam: não mudam o que o
    // lead recebe.
    const mudouTexto = dto.body !== undefined || dto.subject !== undefined;
    return (this.prisma as any).messageTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject?.trim() || null } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.step !== undefined ? { step: dto.step } : {}),
        ...(mudouTexto ? { status: 'draft' } : {}),
      },
    });
  }

  /** Aprova: o modelo passa a aparecer no seletor do Disparo. */
  async approve(tenantId: string, id: string) {
    const r = await (this.prisma as any).messageTemplate.updateMany({
      where: { id, tenantId },
      data: { status: 'approved' },
    });
    if (r.count === 0) throw new NotFoundException('Modelo não encontrado');
    this.logger.log(`Modelo ${id} aprovado — visível no Disparo`);
    return { ok: true };
  }

  /**
   * Exclui de verdade — a linha some da tabela.
   *
   * Conviver com `archive` é de propósito: arquivar é para o modelo que JÁ RODOU e
   * cujo texto explica um resultado; excluir é para o que nunca deveria estar ali —
   * rascunho de IA descartado, teste, nome digitado errado. Antes só havia
   * arquivar, e a lista acumulava lixo que ninguém conseguia tirar.
   *
   * Apagar não fere histórico: `campaigns` guarda o TEXTO enviado na própria linha
   * (`campaign.template`) e não tem chave estrangeira para cá — conferido no schema.
   * O que já saiu continua explicável depois que o modelo some.
   */
  async remove(tenantId: string, id: string) {
    const r = await this.prisma.messageTemplate.deleteMany({ where: { id, tenantId } });
    if (r.count === 0) throw new NotFoundException('Modelo não encontrado');
    this.logger.warn(`Modelo ${id} EXCLUÍDO (definitivo)`);
    return { ok: true, deleted: r.count };
  }

  /**
   * Exclui todos os modelos de um mercado de uma vez.
   *
   * `productCode` é obrigatório e vai no `where` junto do tenant: sem ele, um
   * deleteMany aqui apagaria a biblioteca de mensagens do cliente inteiro — e essa
   * é a diferença entre limpar um mercado de teste e perder a operação.
   */
  async removeAll(tenantId: string, productCode: string) {
    if (!productCode?.trim()) {
      throw new BadRequestException('Informe o mercado. Excluir sem mercado apagaria a biblioteca inteira.');
    }
    const r = await this.prisma.messageTemplate.deleteMany({
      where: { tenantId, productCode: productCode.trim() },
    });
    this.logger.warn(`${r.count} modelo(s) EXCLUÍDO(S) do mercado ${productCode}`);
    return { ok: true, deleted: r.count };
  }

  /** Volta para rascunho — some do seletor sem perder o texto. */
  async unapprove(tenantId: string, id: string) {
    const r = await (this.prisma as any).messageTemplate.updateMany({
      where: { id, tenantId },
      data: { status: 'draft' },
    });
    if (r.count === 0) throw new NotFoundException('Modelo não encontrado');
    return { ok: true };
  }

  /**
   * Arquiva em vez de apagar. Campanhas antigas apontam para o modelo que as
   * originou; apagar perderia a resposta de "qual texto gerou este resultado".
   */
  async archive(tenantId: string, id: string) {
    const r = await this.prisma.messageTemplate.updateMany({
      where: { id, tenantId },
      data: { active: false },
    });
    if (r.count === 0) throw new NotFoundException('Modelo não encontrado');
    return { ok: true };
  }

  private validar(dto: TemplateInput) {
    if (!dto.body?.trim()) throw new BadRequestException('O modelo precisa de um corpo.');
    if (!['email', 'whatsapp'].includes(dto.channel)) {
      throw new BadRequestException('Canal deve ser email ou whatsapp.');
    }
    if (dto.channel === 'email' && !dto.subject?.trim()) {
      // Assunto vazio já produziu campanha com assunto "hipertms" e "sss" em
      // produção. É o campo que decide se o e-mail é aberto.
      throw new BadRequestException('Campanha de e-mail precisa de assunto.');
    }
  }

  /**
   * Gera o teste: como a mensagem CHEGA, nos dois canais.
   *
   * O HTML sai do mesmo `renderEmailHtml` do envio real. Uma prévia que só se parece
   * com o resultado é pior que prévia nenhuma — dá confiança errada, e foi a regra que
   * a gente já aplicou na lista de destinatários do disparo.
   *
   * Renderiza com um nome de verdade no lugar de `{{nome}}`: mostrar o placeholder cru
   * esconde exatamente o que se quer julgar (a frase encaixa? a saudação ficou torta?).
   */
  async preview(
    tenantId: string,
    entrada: { productCode?: string; channel: string; subject?: string | null; body: string; nomeTeste?: string },
  ) {
    const mercado = entrada.productCode
      ? await this.prisma.product.findUnique({ where: { code: entrada.productCode } })
      : null;

    const nome = entrada.nomeTeste?.trim() || 'Carlos';
    // Empresa de exemplo pelo mesmo motivo do nome: mostrar `{{empresa}}` cru
    // esconde o que se quer julgar — a frase encaixa com um nome real no lugar?
    const empresa = 'Transportes Silva';
    const ehEmail = entrada.channel === 'email';
    // No e-mail o descadastro é o link do rodapé; 'Responda SAIR' manda o lead
    // responder algo que ninguém lê.
    const corpo = SenderService.renderTemplate(entrada.body, nome, { optOutFooter: !ehEmail, empresa });
    const assunto = entrada.subject
      ? SenderService.renderTemplate(entrada.subject, nome, { optOutFooter: false, empresa })
      : null;

    const brand: EmailBrand | undefined = mercado
      ? {
          name: (mercado as any).displayName || mercado.name,
          color: (mercado as any).brandColor,
          tagline: (mercado as any).brandTagline,
        }
      : undefined;

    const html =
      ehEmail
        ? renderEmailHtml({
            body: corpo,
            brand,
            // URL de exemplo: o token real só existe no envio, e gerar um aqui
            // criaria descadastro válido a partir de uma pré-visualização.
            optOutUrl: 'https://exemplo/optout?token=previa',
          })
        : null;

    return { assunto, corpo, html, avisos: avisosDoTeste(entrada.channel, corpo, assunto) };
  }

  /**
   * Manda o teste para um endereço nosso.
   *
   * A prévia mostra a estrutura; só o e-mail de verdade mostra se caiu em Promoções,
   * como o Gmail cortou o assunto e se a cor sobreviveu ao cliente. Foi mandando para
   * o próprio time que descobrimos o HELO quebrado.
   */
  async sendTest(tenantId: string, para: string, entrada: { productCode?: string; subject?: string | null; body: string }) {
    if (!para?.includes('@')) throw new BadRequestException('Informe um e-mail válido para o teste.');
    const p = await this.preview(tenantId, { ...entrada, channel: 'email' });

    // O From do teste é o From do disparo real (nome do mercado): é uma das coisas
    // que quem manda o teste está julgando. Ver email-market-identity.ts.
    const mercado = entrada.productCode
      ? await this.prisma.product.findUnique({ where: { code: entrada.productCode } })
      : null;
    const { fromName } = identidadeDoMercado(mercado as any);

    const r = await this.emailReply.sendAlertEmail(
      para,
      `[TESTE] ${p.assunto ?? '(sem assunto)'}`,
      p.corpo,
      tenantId,
      p.html ?? undefined,
      fromName,
    );
    this.logger.log(`Teste de modelo enviado para ${para}: ${r.sent ? 'ok' : r.reason}`);
    return r;
  }
}

/**
 * Os três erros que a IA mais comete ao escrever copy, e que só aparecem quando a
 * mensagem é vista renderizada.
 */
export function avisosDoTeste(channel: string, corpo: string, assunto?: string | null): AvisoDeTeste[] {
  const avisos: AvisoDeTeste[] = [];

  if (channel === 'whatsapp' && /\*\*|__|^#/m.test(corpo)) {
    avisos.push({
      gravidade: 'erro',
      texto: 'O WhatsApp não renderiza markdown — os asteriscos vão aparecer literais.',
    });
  }

  const linkLongo = corpo.match(/https?:\/\/\S{40,}/);
  if (linkLongo) {
    avisos.push({
      gravidade: 'aviso',
      texto: 'Link longo no corpo aumenta o risco de spam e de bloqueio no primeiro toque.',
    });
  }

  // A regra do próprio material de prospecção: assunto pela dor, nunca pelo produto.
  if (assunto && /^(sobre o |conheça|apresent)/i.test(assunto.trim())) {
    avisos.push({
      gravidade: 'aviso',
      texto: 'O assunto fala do produto. Assunto que fala da dor do cliente abre mais.',
    });
  }

  if (assunto && assunto.length > 60) {
    avisos.push({
      gravidade: 'aviso',
      texto: `Assunto com ${assunto.length} caracteres — o Gmail corta perto de 60 no celular.`,
    });
  }

  return avisos;
}
