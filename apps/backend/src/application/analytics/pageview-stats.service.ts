/**
 * Agregação das visitas do site — o que alimenta o painel e o resumo diário.
 *
 * Tudo em SQL agregado, nunca carregando linhas para somar em memória: o volume é
 * baixo hoje, mas `SELECT *` + `reduce` é o tipo de coisa que funciona por um ano e
 * derruba a tela no dia que a campanha der certo.
 *
 * SOBRE "VISITANTES ÚNICOS": é `COUNT(DISTINCT visitor_hash)`, e o hash muda toda
 * meia-noite por decisão de privacidade (ver PageView no schema). Então:
 *
 *   • em UM dia, o número é gente distinta;
 *   • em um PERÍODO, é a soma dos únicos de cada dia — quem visitou terça e quinta
 *     conta duas vezes.
 *
 * Por isso `uniqueVisitors` do período vem da soma da série diária, e não de um
 * DISTINCT sobre o intervalo inteiro: o DISTINCT daria um número menor, aparentando
 * precisão que o dado não tem. O painel precisa rotular isso como "únicos/dia".
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

export interface Periodo {
  from: Date;
  to: Date;
}

export interface PontoDiario {
  dia: string;          // YYYY-MM-DD
  visitas: number;
  unicos: number;
}

export interface ItemContado {
  rotulo: string;
  visitas: number;
}

export interface VisaoGeral {
  visitas: number;
  /** Soma dos únicos diários — ver nota no topo do arquivo. */
  unicosPorDia: number;
  serie: PontoDiario[];
  topPaginas: ItemContado[];
  topOrigens: ItemContado[];
  topReferrers: ItemContado[];
  dispositivos: ItemContado[];
}

@Injectable()
export class PageviewStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async visaoGeral(tenantId: string, p: Periodo): Promise<VisaoGeral> {
    // Uma ida ao banco por recorte, todas em paralelo — são queries independentes
    // e serializá-las só somaria latência.
    const [serie, topPaginas, topOrigens, topReferrers, dispositivos] = await Promise.all([
      this.serieDiaria(tenantId, p),
      this.topPor(tenantId, p, 'path'),
      this.topPor(tenantId, p, 'utm_source'),
      this.topPor(tenantId, p, 'referrer_domain'),
      this.topPor(tenantId, p, 'device'),
    ]);

    return {
      visitas: serie.reduce((s, d) => s + d.visitas, 0),
      unicosPorDia: serie.reduce((s, d) => s + d.unicos, 0),
      serie,
      topPaginas,
      topOrigens,
      topReferrers,
      dispositivos,
    };
  }

  /**
   * Série diária de visitas e únicos.
   *
   * `generate_series` preenche os dias SEM visita com zero. Sem isso, um gráfico de
   * 30 dias com 4 dias de tráfego desenharia 4 pontos colados e daria a impressão de
   * movimento contínuo — o vazio é informação.
   */
  private async serieDiaria(tenantId: string, p: Periodo): Promise<PontoDiario[]> {
    const rows = await this.prisma.$queryRaw<{ dia: Date; visitas: bigint; unicos: bigint }[]>`
      SELECT d.dia::date AS dia,
             count(pv.id)                    AS visitas,
             count(DISTINCT pv.visitor_hash) AS unicos
        FROM generate_series(${p.from}::date, ${p.to}::date, interval '1 day') AS d(dia)
        LEFT JOIN page_views pv
               ON pv.tenant_id = ${tenantId}
              AND pv.created_at >= d.dia
              AND pv.created_at <  d.dia + interval '1 day'
       GROUP BY d.dia
       ORDER BY d.dia`;

    return rows.map((r) => ({
      dia: new Date(r.dia).toISOString().slice(0, 10),
      visitas: Number(r.visitas),
      unicos: Number(r.unicos),
    }));
  }

  /**
   * Top valores de uma coluna no período.
   *
   * A coluna vem de uma lista FECHADA, nunca do cliente: é interpolada direto no SQL
   * (o Postgres não aceita identificador parametrizado), então aceitar string de fora
   * aqui seria injeção de SQL.
   */
  private async topPor(
    tenantId: string,
    p: Periodo,
    coluna: 'path' | 'utm_source' | 'referrer_domain' | 'device',
    limite = 10,
  ): Promise<ItemContado[]> {
    const COLUNAS = ['path', 'utm_source', 'referrer_domain', 'device'] as const;
    if (!COLUNAS.includes(coluna)) throw new Error(`coluna não permitida: ${coluna}`);

    const rows = await this.prisma.$queryRawUnsafe<{ rotulo: string | null; visitas: bigint }[]>(
      `SELECT ${coluna} AS rotulo, count(*) AS visitas
         FROM page_views
        WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3 AND ${coluna} IS NOT NULL
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT $4`,
      tenantId, p.from, p.to, limite,
    );

    return rows.map((r) => ({ rotulo: r.rotulo ?? '(não informado)', visitas: Number(r.visitas) }));
  }

  /**
   * Números de um único dia, para o resumo diário no WhatsApp.
   *
   * Devolve também o dia anterior: o resumo compara os dois, e "143 visitas" sem
   * referência não diz se foi um bom dia.
   */
  async resumoDoDia(tenantId: string, dia: Date): Promise<ResumoDiario> {
    const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate()));
    const fim = new Date(inicio.getTime() + 24 * 3600 * 1000);
    const inicioAnterior = new Date(inicio.getTime() - 24 * 3600 * 1000);

    const [hoje, anterior, paginas, origens] = await Promise.all([
      this.contarIntervalo(tenantId, inicio, fim),
      this.contarIntervalo(tenantId, inicioAnterior, inicio),
      this.topPor(tenantId, { from: inicio, to: fim }, 'path', 1),
      this.topPor(tenantId, { from: inicio, to: fim }, 'utm_source', 1),
    ]);

    return {
      dia: inicio.toISOString().slice(0, 10),
      visitas: hoje.visitas,
      unicos: hoje.unicos,
      visitasDiaAnterior: anterior.visitas,
      topPagina: paginas[0] ?? null,
      topOrigem: origens[0] ?? null,
    };
  }

  private async contarIntervalo(tenantId: string, de: Date, ate: Date) {
    const rows = await this.prisma.$queryRaw<{ visitas: bigint; unicos: bigint }[]>`
      SELECT count(*) AS visitas, count(DISTINCT visitor_hash) AS unicos
        FROM page_views
       WHERE tenant_id = ${tenantId} AND created_at >= ${de} AND created_at < ${ate}`;
    return { visitas: Number(rows[0]?.visitas ?? 0), unicos: Number(rows[0]?.unicos ?? 0) };
  }
}

export interface ResumoDiario {
  dia: string;
  visitas: number;
  unicos: number;
  visitasDiaAnterior: number;
  topPagina: ItemContado | null;
  topOrigem: ItemContado | null;
}
