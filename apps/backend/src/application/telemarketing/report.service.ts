import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import {
  aproveitamento,
  calcularSlaPrimeiroContato,
  compararRoteiros,
  conversaoDaCampanha,
  conversaoDoLote,
  respostaDaCampanha,
  type LinhaDeCampanha,
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
 *  4. qual CAMPANHA rendeu     → por disparo (21/08/2026, só possível com o campaignId)
 *
 * Nenhuma das quatro existia antes, e nenhuma se reconstrói depois: dado de esforço e de
 * origem só existe se alguém gravar no momento.
 *
 * A quarta fecha a corrente. Lote responde de qual LISTA a pessoa veio; campanha
 * responde qual DISPARO a fez responder — e a mesma lista rende várias campanhas, das
 * quais só uma converteu.
 */
@Injectable()
export class TelemarketingReportService {
  constructor(private readonly prisma: PrismaService) {}

  async relatorio(tenantId: string, productCode?: string) {
    const [lotes, vendedores, roteiros, campanhas, slaBruto] = await Promise.all([
      this.porLote(tenantId, productCode),
      this.porVendedor(tenantId),
      this.porRoteiro(tenantId, productCode),
      this.porCampanha(tenantId, productCode),
      this.slaPrimeiroContatoBruto(tenantId, productCode),
    ]);

    return {
      lotes: lotes.map((l) => ({ ...l, conversao: conversaoDoLote(l) })),
      vendedores: vendedores.map((v) => ({ ...v, aproveitamento: aproveitamento(v) })),
      roteiros: compararRoteiros(roteiros),
      campanhas: campanhas.map((c) => ({
        ...c,
        conversao: conversaoDaCampanha(c),
        resposta: respostaDaCampanha(c),
      })),
      slaPrimeiroContato: calcularSlaPrimeiroContato(
        slaBruto.amostras,
        slaBruto.mediaHorasBruta,
      ),
    };
  }

  /**
   * Por campanha. O denominador é o que foi ENTREGUE (`campaign_targets` com
   * `status = 'sent'`), não o que entrou na fila: alvo pulado por opt-out ou que
   * falhou no envio nunca teve chance de responder, e contá-lo afunda a taxa de uma
   * campanha que funcionou.
   *
   * `LEFT JOIN` na oportunidade porque campanha sem nenhuma resposta é justamente a
   * que precisa aparecer no relatório — sumir com ela deixaria a lista só com as
   * campanhas boas, que é como se conclui que tudo vai bem.
   */
  private async porCampanha(tenantId: string, productCode?: string): Promise<LinhaDeCampanha[]> {
    const filtro = productCode ? 'AND c.product_code = $2' : '';
    const args = productCode ? [tenantId, productCode] : [tenantId];

    return this.prisma.$queryRawUnsafe<LinhaDeCampanha[]>(
      `SELECT c.name                                                         AS "nome",
              c.channel                                                      AS "canal",
              (SELECT count(*)::int FROM campaign_targets t
                WHERE t.campaign_id = c.id AND t.status = 'sent')            AS "enviados",
              count(o.id)::int                                               AS "oportunidades",
              count(*) FILTER (WHERE o.stage = 'won')::int                    AS "ganhos",
              count(*) FILTER (WHERE o.stage IN ('lost','discarded'))::int    AS "perdidos",
              count(*) FILTER (WHERE o.stage IN ('new','qualified','proposal','paused'))::int AS "emAndamento"
         FROM campaigns c
         LEFT JOIN opportunities o ON o.campaign_id = c.id
        WHERE c.tenant_id = $1 ${filtro}
        GROUP BY c.id, c.name, c.channel, c.created_at
        ORDER BY c.created_at DESC
        LIMIT 50`,
      ...args,
    );
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

  /**
   * Por versão de roteiro.
   *
   * `script_version IS NOT NULL` de propósito: atividade sem carimbo é de antes do
   * carimbo existir, e entrar como "versão nula" criaria uma linha fantasma competindo
   * com as reais.
   *
   * ATENÇÃO ao filtro de mercado: ele passa pela oportunidade, então atividade SEM
   * oportunidade fica de fora quando se filtra por mercado — e isso é correto, porque
   * sem oportunidade não existe mercado a que ela pertença. Na prática toda atividade
   * tem oportunidade (`registrarAtividade` exige), mas a assimetria é real: com filtro é
   * `INNER JOIN` na prática, sem filtro é `LEFT`. Um teste pina os dois casos.
   */
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

  /**
   * Média bruta, sem o corte de amostra mínima — quem decide se o número aparece é
   * `calcularSlaPrimeiroContato` (pura, testada). Aqui só a consulta.
   *
   * `JOIN` (não `LEFT JOIN`) em `seller_activities` de propósito: oportunidade sem
   * nenhuma atividade ainda não teve "primeiro contato" para medir — entrar aqui com
   * NULL contaminaria a média com um tempo que não existe.
   */
  private async slaPrimeiroContatoBruto(
    tenantId: string,
    productCode?: string,
  ): Promise<{ amostras: number; mediaHorasBruta: number | null }> {
    const filtro = productCode ? 'AND o.product_code = $2' : '';
    const args = productCode ? [tenantId, productCode] : [tenantId];

    const [linha] = await this.prisma.$queryRawUnsafe<
      { amostras: number; mediaHorasBruta: number | null }[]
    >(
      `WITH primeiro AS (
         SELECT o.id, o.created_at AS entrada, MIN(a.created_at) AS primeiro_contato
           FROM opportunities o
           JOIN seller_activities a ON a.opportunity_id = o.id
          WHERE o.tenant_id = $1 ${filtro}
          GROUP BY o.id, o.created_at
       )
       SELECT count(*)::int                                                       AS "amostras",
              avg(EXTRACT(EPOCH FROM (primeiro_contato - entrada)) / 3600)::float  AS "mediaHorasBruta"
         FROM primeiro`,
      ...args,
    );

    return linha ?? { amostras: 0, mediaHorasBruta: null };
  }
}
