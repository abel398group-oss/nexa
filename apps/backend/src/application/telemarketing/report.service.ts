import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import {
  aproveitamento,
  compararRoteiros,
  conversaoDoLote,
  type LinhaDeLote,
  type LinhaDeRoteiro,
  type LinhaDeVendedor,
} from './report';

/**
 * Relatório comercial: as três perguntas que a esteira foi instrumentada para responder.
 *
 *  1. qual lista prestou       → por lote
 *  2. quem está produzindo     → por vendedor
 *  3. qual roteiro converte    → por versão (só possível por causa do carimbo na atividade)
 *
 * Nenhuma das três existia antes de hoje, e nenhuma se reconstrói depois: dado de esforço
 * e de origem só existe se alguém gravar no momento.
 */
@Injectable()
export class TelemarketingReportService {
  constructor(private readonly prisma: PrismaService) {}

  async relatorio(tenantId: string, productCode?: string) {
    const [lotes, vendedores, roteiros] = await Promise.all([
      this.porLote(tenantId, productCode),
      this.porVendedor(tenantId),
      this.porRoteiro(tenantId, productCode),
    ]);

    return {
      lotes: lotes.map((l) => ({ ...l, conversao: conversaoDoLote(l) })),
      vendedores: vendedores.map((v) => ({ ...v, aproveitamento: aproveitamento(v) })),
      roteiros: compararRoteiros(roteiros),
    };
  }

  /**
   * Por lote. Conta oportunidades por `batch_id` DA OPORTUNIDADE, não do contato: a mesma
   * pessoa pode ter vindo por duas listas, e cada tentativa conta para a sua.
   */
  private async porLote(tenantId: string, productCode?: string): Promise<LinhaDeLote[]> {
    const filtro = productCode ? 'AND b.product_code = $2' : '';
    const args = productCode ? [tenantId, productCode] : [tenantId];

    return this.prisma.$queryRawUnsafe<LinhaDeLote[]>(
      `SELECT b.name                                                        AS "nome",
              b.product_code                                                AS "productCode",
              b.received_count::int                                         AS "recebidos",
              b.valid_count::int                                            AS "validos",
              count(o.id)::int                                              AS "oportunidades",
              count(*) FILTER (WHERE o.stage = 'won')::int                   AS "ganhos",
              count(*) FILTER (WHERE o.stage IN ('lost','discarded'))::int   AS "perdidos",
              count(*) FILTER (WHERE o.stage IN ('new','qualified','proposal','paused'))::int AS "emAndamento"
         FROM lead_batches b
         LEFT JOIN opportunities o ON o.batch_id = b.id
        WHERE b.tenant_id = $1 ${filtro}
        GROUP BY b.id, b.name, b.product_code, b.received_count, b.valid_count, b.created_at
        ORDER BY b.created_at DESC
        LIMIT 50`,
      ...args,
    );
  }

  /// Por vendedor. Só ativos: quem saiu da empresa não deve aparecer no relatório do mês
  /// como se estivesse produzindo zero — some, e quem ficou é comparado entre si.
  private async porVendedor(tenantId: string): Promise<LinhaDeVendedor[]> {
    return this.prisma.$queryRaw<LinhaDeVendedor[]>`
      SELECT s.name                                                          AS "nome",
             count(a.id)::int                                                AS "atividades",
             count(*) FILTER (WHERE a.result = 'atendeu')::int               AS "atendeu",
             count(*) FILTER (WHERE a.result = 'passou_closer')::int         AS "passouCloser",
             (SELECT count(*)::int FROM opportunities o
               WHERE o.assigned_seller_id = s.id AND o.stage = 'won')        AS "ganhos"
        FROM sellers s
        LEFT JOIN seller_activities a ON a.seller_id = s.id
       WHERE s.tenant_id = ${tenantId} AND s.active = true
       GROUP BY s.id, s.name
       ORDER BY count(a.id) DESC`;
  }

  /// Por versão de roteiro. `script_version IS NOT NULL` de propósito: atividade sem
  /// carimbo é de antes do carimbo existir, e entrar como "versão nula" criaria uma linha
  /// fantasma competindo com as reais.
  private async porRoteiro(
    tenantId: string,
    productCode?: string,
  ): Promise<LinhaDeRoteiro[]> {
    const filtro = productCode ? 'AND o.product_code = $2' : '';
    const args = productCode ? [tenantId, productCode] : [tenantId];

    return this.prisma.$queryRawUnsafe<LinhaDeRoteiro[]>(
      `SELECT a.script_version::int                                AS "versao",
              count(*)::int                                        AS "acoes",
              count(*) FILTER (WHERE a.result = 'atendeu')::int     AS "atendeu"
         FROM seller_activities a
         LEFT JOIN opportunities o ON o.id = a.opportunity_id
        WHERE a.tenant_id = $1 AND a.script_version IS NOT NULL ${filtro}
        GROUP BY a.script_version
        ORDER BY a.script_version DESC`,
      ...args,
    );
  }
}
