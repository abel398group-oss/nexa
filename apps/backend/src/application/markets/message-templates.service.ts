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
  ) {}

  list(tenantId: string, productCode?: string, channel?: string) {
    return this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
        active: true,
        ...(productCode ? { productCode } : {}),
        ...(channel ? { channel } : {}),
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
    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject?.trim() || null } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.step !== undefined ? { step: dto.step } : {}),
      },
    });
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
    const ehEmail = entrada.channel === 'email';
    // No e-mail o descadastro é o link do rodapé; 'Responda SAIR' manda o lead
    // responder algo que ninguém lê.
    const corpo = SenderService.renderTemplate(entrada.body, nome, { optOutFooter: !ehEmail });
    const assunto = entrada.subject
      ? SenderService.renderTemplate(entrada.subject, nome, { optOutFooter: false })
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
