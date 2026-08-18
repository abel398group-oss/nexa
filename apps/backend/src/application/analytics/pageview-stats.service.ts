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
import { Prisma } from '@prisma/client';
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
  /**
   * Recortes do período (18/08/2026). `visitas` acima conta TUDO, inclusive o time
   * entrando no painel — medido: 19 de 40 num período de 7 dias eram `/login`. Estes
   * quatro separam o que a tela precisa para responder "a campanha trouxe gente?".
   */
  visitasSite: number;
  /** Pessoas distintas no período — não a soma por dia. */
  pessoasSite: number;
  acessosApp: number;
  deCampanha: number;
  cadastros: number;
  serie: PontoDiario[];
  topPaginas: ItemContado[];
  topOrigens: ItemContado[];
  /** Por campanha do disparo — vem do utm_campaign que o link leva (ADR: campaign-link.ts). */
  topCampanhas: ItemContado[];
  topReferrers: ItemContado[];
  dispositivos: ItemContado[];
}

@Injectable()
export class PageviewStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async visaoGeral(tenantId: string, p: Periodo): Promise<VisaoGeral> {
    // Uma ida ao banco por recorte, todas em paralelo — são queries independentes
    // e serializá-las só somaria latência.
    const [serie, topPaginas, topOrigens, topCampanhas, topReferrers, dispositivos,
           site, app, campanha, cadastro] = await Promise.all([
      this.serieDiaria(tenantId, p),
      this.topPor(tenantId, p, 'path'),
      this.topPor(tenantId, p, 'utm_source'),
      // Por CAMPANHA: a pergunta que o disparo faz é 'qual campanha trouxe gente ao
      // site?'. O índice (tenant, utm_campaign, created_at) já existia esperando.
      this.topPor(tenantId, p, 'utm_campaign'),
      this.topPor(tenantId, p, 'referrer_domain'),
      this.topPor(tenantId, p, 'device'),
      this.contarIntervalo(tenantId, p.from, p.to, 'site'),
      this.contarIntervalo(tenantId, p.from, p.to, 'app'),
      this.contarIntervalo(tenantId, p.from, p.to, 'campanha'),
      this.contarIntervalo(tenantId, p.from, p.to, 'cadastro'),
    ]);

    return {
      visitas: serie.reduce((s, d) => s + d.visitas, 0),
      unicosPorDia: serie.reduce((s, d) => s + d.unicos, 0),
      visitasSite: site.visitas,
      pessoasSite: site.unicos,
      acessosApp: app.visitas,
      deCampanha: campanha.visitas,
      cadastros: cadastro.visitas,
      serie,
      topPaginas,
      topOrigens,
      topCampanhas,
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
  /**
   * QUEM clicou — a pergunta que gera ação.
   *
   * O painel de audiência responde "quantos vieram da campanha". Isso não serve para
   * ligar para ninguém. Aqui o `ref` que o link carregou (gravado em
   * `page_views.click_id`) é resolvido de volta no contato, e o vendedor recebe nome,
   * e-mail, telefone e a hora.
   *
   * O `ref` é um PREFIXO do id do contato (12 hex — ver refDoContato). Se o prefixo
   * casar com mais de um contato, aquele clique NÃO é atribuído a ninguém: fazer o
   * vendedor ligar para a pessoa errada é pior que não avisar.
   */
  async quemClicou(
    tenantId: string,
    opts: { desde?: Date; campanha?: string; limite?: number } = {},
  ): Promise<CliqueDeLead[]> {
    const desde = opts.desde ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const cliques = await this.prisma.pageView.findMany({
      where: {
        tenantId,
        createdAt: { gte: desde },
        clickId: { not: null },
        ...(opts.campanha ? { utmCampaign: opts.campanha } : {}),
      },
      select: { clickId: true, path: true, createdAt: true, utmCampaign: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limite ?? 200, 500),
    });
    if (cliques.length === 0) return [];

    // Um contato por ref, resolvido pelo PREFIXO do id. Buscar de uma vez em memória:
    // são no máximo algumas centenas de refs distintos, e uma query por clique seria
    // dezenas de idas ao banco para montar uma lista.
    const refs = [...new Set(cliques.map((c) => c.clickId!).filter(Boolean))];

    // `replace(id,'-','')` no SQL, e não `startsWith` do Prisma.
    //
    // O ref é o uuid SEM os traços (`bca3707d4445`), e o id no banco tem traços
    // (`bca3707d-4445-…`). Comparar prefixo direto nunca casa — o clique chegava
    // certo, a campanha era atribuída, e o nome do lead simplesmente não aparecia.
    // Visto em produção em 10/08/2026, com o ref presente na URL.
    //
    // Só hex minúsculo entra na consulta: o valor vem de query string, e query string
    // é entrada hostil mesmo indo por parâmetro.
    const refsLimpos = refs.filter((r) => /^[0-9a-f]{6,32}$/i.test(r)).map((r) => r.toLowerCase());
    const contatos = refsLimpos.length
      ? await this.prisma.$queryRawUnsafe<
          { id: string; name: string | null; email: string | null; phone: string | null }[]
        >(
          `SELECT id, name, email, phone
             FROM contacts
            WHERE tenant_id = $1
              AND replace(lower(id::text), '-', '') LIKE ANY ($2::text[])`,
          tenantId,
          refsLimpos.map((r) => `${r}%`),
        )
      : [];

    // Prefixo ambíguo (dois contatos) => descarta. Ver o comentário do método.
    const porRef = new Map<string, { nome: string | null; email: string | null; telefone: string | null } | null>();
    for (const r of refs) {
      // Mesma normalização dos dois lados: sem traços e minúsculo. Foi a divergência
      // entre as duas formas que fez o nome nunca aparecer.
      const alvo = r.toLowerCase();
      const casam = contatos.filter((c) => c.id.replace(/-/g, '').toLowerCase().startsWith(alvo));
      porRef.set(r, casam.length === 1 ? { nome: casam[0].name, email: casam[0].email, telefone: casam[0].phone } : null);
    }

    const vezes = new Map<string, number>();
    for (const c of cliques) vezes.set(c.clickId!, (vezes.get(c.clickId!) ?? 0) + 1);

    // Uma linha por PESSOA, no clique mais recente dela — o vendedor liga uma vez,
    // não uma por pageview.
    const vistos = new Set<string>();
    const saida: CliqueDeLead[] = [];
    for (const c of cliques) {
      const ref = c.clickId!;
      if (vistos.has(ref)) continue;
      const quem = porRef.get(ref);
      if (!quem) continue; // ref anônimo (gclid/fbclid) ou prefixo ambíguo
      vistos.add(ref);
      saida.push({
        ...quem,
        campanha: c.utmCampaign,
        pagina: c.path,
        quando: c.createdAt,
        visitas: vezes.get(ref) ?? 1,
      });
    }
    return saida;
  }

  private async topPor(
    tenantId: string,
    p: Periodo,
    coluna: 'path' | 'utm_source' | 'utm_campaign' | 'referrer_domain' | 'device',
    limite = 10,
  ): Promise<ItemContado[]> {
    const COLUNAS = ['path', 'utm_source', 'utm_campaign', 'referrer_domain', 'device'] as const;
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

    const [site, anterior, app, campanha, cadastros, paginas, origens, campanhas] = await Promise.all([
      this.contarIntervalo(tenantId, inicio, fim, 'site'),
      this.contarIntervalo(tenantId, inicioAnterior, inicio, 'site'),
      this.contarIntervalo(tenantId, inicio, fim, 'app'),
      this.contarIntervalo(tenantId, inicio, fim, 'campanha'),
      this.contarIntervalo(tenantId, inicio, fim, 'cadastro'),
      this.topPor(tenantId, { from: inicio, to: fim }, 'path', 1),
      this.topPor(tenantId, { from: inicio, to: fim }, 'utm_source', 1),
      this.topPor(tenantId, { from: inicio, to: fim }, 'utm_campaign', 1),
    ]);

    return {
      dia: inicio.toISOString().slice(0, 10),
      visitas: site.visitas,
      unicos: site.unicos,
      visitasDiaAnterior: anterior.visitas,
      acessosApp: app.visitas,
      deCampanha: campanha.visitas,
      topCampanha: campanhas[0] ?? null,
      cadastros: cadastros.visitas,
      topPagina: paginas[0] ?? null,
      topOrigem: origens[0] ?? null,
    };
  }

  /**
   * Conta visitas no intervalo, por RECORTE.
   *
   * - `site`: fora as rotas do painel — é a audiência de verdade
   * - `app`: o time entrando no sistema, que antes inflava o total
   * - `campanha`: só quem chegou com utm_campaign
   * - `cadastro`: /signup, o resultado que a campanha existe para produzir
   *
   * A régua das rotas do painel espelha `ehRotaDoApp` (pageview-sanitizer), e a
   * duplicação é deliberada: esta roda no Postgres sobre a tabela inteira, e trazer as
   * linhas para o Node só para reusar a função custaria mais do que a cópia. O teste do
   * sanitizer guarda a regra; se as duas divergirem, é lá que a decisão está escrita.
   */
  private async contarIntervalo(
    tenantId: string,
    de: Date,
    ate: Date,
    recorte: 'site' | 'app' | 'campanha' | 'cadastro' = 'site',
  ) {
    // `(/|\?|$)` é a fronteira do prefixo: sem ela `/site` casaria com um futuro
    // `/site-institucional`, e uma página pública nasceria contada como painel.
    const APP =
      "path ~ '^/(login|inbox|dashboard|support|campaigns|contacts|opportunities|sellers" +
      "|settings|users|markets|knowledge|playbook|sdr|closer|fila|partners|lead-batches" +
      "|messages|roteiro|site|vendas|admin-cockpit|sdr-cockpit|closer-cockpit|portal)(/|\\?|$)'";
    const SIGNUP = "path ~ '^/signup(/|\\?|$)'";

    const cond =
      recorte === 'app' ? APP
      : recorte === 'campanha' ? `NOT ${APP} AND utm_campaign IS NOT NULL AND utm_campaign <> ''`
      : recorte === 'cadastro' ? SIGNUP
      : `NOT ${APP}`;

    const rows = await this.prisma.$queryRaw<{ visitas: bigint; unicos: bigint }[]>`
      SELECT count(*) AS visitas, count(DISTINCT visitor_hash) AS unicos
        FROM page_views
       WHERE tenant_id = ${tenantId} AND created_at >= ${de} AND created_at < ${ate}
         AND ${Prisma.raw(cond)}`;
    return { visitas: Number(rows[0]?.visitas ?? 0), unicos: Number(rows[0]?.unicos ?? 0) };
  }
}

export interface ResumoDiario {
  dia: string;
  /** Visitas ao SITE — fora as rotas do painel. Ver `ehRotaDoApp` no sanitizer. */
  visitas: number;
  /** Pessoas distintas no dia. */
  unicos: number;
  visitasDiaAnterior: number;
  /** Acessos ao painel pelo time. Sai do total do site e aparece à parte. */
  acessosApp: number;
  /** Visitas com utm_campaign — a pergunta que o resumo existe para responder. */
  deCampanha: number;
  /** Campanha que mais trouxe, quando houve. */
  topCampanha: ItemContado | null;
  /** Visitas em /signup: o resultado, não o tráfego. */
  cadastros: number;
  topPagina: ItemContado | null;
  topOrigem: ItemContado | null;
}
/** Um clique com nome e telefone — é com isto que o vendedor liga. */
export interface CliqueDeLead {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  /** Slug da campanha que trouxe (utm_campaign). */
  campanha: string | null;
  /** Página onde caiu. */
  pagina: string;
  quando: Date;
  /** Quantas vezes essa pessoa voltou ao site. */
  visitas: number;
}
