import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface Objecao {
  situacao: string;
  resposta: string;
}

export interface RoteiroInput {
  aberturaCall?: string | null;
  aberturaWhatsapp?: string | null;
  aberturaEmail?: string | null;
  assuntoEmail?: string | null;
  objecoes?: Objecao[];
}

/**
 * Roteiro do SDR por mercado (módulo 1, itens 3-6).
 *
 * O SDR só lê. Quem escreve é quem monta a operação — a divisão existe porque preço e
 * promessa não podem mudar por iniciativa de quem está no telefone.
 */
@Injectable()
export class SalesScriptService {
  private readonly logger = new Logger('SalesScript');

  constructor(private readonly prisma: PrismaService) {}

  /// Versão vigente do mercado. `null` quando ninguém escreveu ainda — a tela do SDR
  /// precisa saber a diferença entre "não tem roteiro" e "roteiro vazio".
  async vigente(tenantId: string, productCode: string) {
    return this.prisma.salesScript.findFirst({
      where: { tenantId, productCode, active: true },
      orderBy: { version: 'desc' },
    });
  }

  /// Histórico completo, do mais novo pro mais velho. É o que permite comparar "o texto
  /// novo converteu melhor?" — sem ele o versionamento é enfeite.
  async historico(tenantId: string, productCode: string) {
    return this.prisma.salesScript.findMany({
      where: { tenantId, productCode },
      orderBy: { version: 'desc' },
      take: 50,
    });
  }

  /**
   * Salva uma VERSÃO NOVA e aposenta a anterior.
   *
   * Não sobrescreve de propósito: a ligação registrada ontem aponta para a versão que
   * estava na tela ontem, e reescrever a linha faria o histórico mentir sobre o que o
   * SDR realmente leu.
   *
   * A matriz vai inteira em cada versão. Guardar só o campo alterado exigiria remontar o
   * roteiro de N linhas para saber o que estava no ar numa data — caro para responder
   * uma pergunta que ninguém faz.
   */
  async salvar(
    tenantId: string,
    productCode: string,
    dados: RoteiroInput,
    userId?: string,
  ) {
    this.validarObjecoes(dados.objecoes);

    const atual = await this.vigente(tenantId, productCode);
    const proxima = (atual?.version ?? 0) + 1;

    // Herda o que não veio no payload: a tela edita um item por vez (o popup do duplo
    // clique), então um PATCH parcial não pode zerar os outros seis.
    const base = atual ?? ({} as any);
    const novo = {
      aberturaCall: dados.aberturaCall ?? base.aberturaCall ?? null,
      aberturaWhatsapp: dados.aberturaWhatsapp ?? base.aberturaWhatsapp ?? null,
      aberturaEmail: dados.aberturaEmail ?? base.aberturaEmail ?? null,
      assuntoEmail: dados.assuntoEmail ?? base.assuntoEmail ?? null,
      objecoes: (dados.objecoes ?? base.objecoes ?? []) as any,
    };

    const criado = await this.prisma.$transaction(async (tx) => {
      if (atual) {
        await tx.salesScript.update({
          where: { id: atual.id },
          data: { active: false },
        });
      }
      return tx.salesScript.create({
        data: {
          tenantId,
          productCode,
          version: proxima,
          active: true,
          createdByUserId: userId ?? null,
          ...novo,
        },
      });
    });

    this.logger.log(`roteiro ${productCode}: versão ${proxima} publicada`);
    return criado;
  }

  /// Objeção sem resposta é pior que objeção ausente: o SDR abre, não acha o que dizer, e
  /// improvisa justamente no momento em que o roteiro deveria segurá-lo.
  private validarObjecoes(objecoes?: Objecao[]) {
    if (!objecoes) return;
    for (const o of objecoes) {
      if (!o?.situacao?.trim() || !o?.resposta?.trim()) {
        throw new BadRequestException(
          'Toda situação precisa de uma resposta — e vice-versa.',
        );
      }
    }
  }
}
