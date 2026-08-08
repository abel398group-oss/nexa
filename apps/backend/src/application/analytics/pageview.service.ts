/**
 * Ingest de pageview do site do produto — FASE 1.
 *
 * O contrato com o frontend do produto está no DTO (tracking.controller.ts) e as
 * regras de higienização em pageview-sanitizer.ts. Os dois princípios que mais
 * moldam este arquivo:
 *
 *   • NUNCA lançar para fora. O visitante não pode sentir a landing travar por causa
 *     de analytics, então todo caminho de erro aqui vira log e o controller devolve
 *     204 de qualquer forma.
 *   • Endpoint público e anônimo. Tudo que chega é entrada hostil até prova em
 *     contrário: chave, URL, referrer e user agent.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import {
  detectarCliente, dominioDoReferrer, ehBot, hashVisitante, higienizarUrl,
} from './pageview-sanitizer';

export interface PageviewInput {
  websiteKey: string;
  url: string;
  referrer?: string;
  title?: string;
  screen?: string;
  language?: string;
}

/** Contexto que o SERVIDOR observa — nunca vem do corpo da requisição. */
export interface PageviewContexto {
  ip: string;
  userAgent: string;
  /** Header Origin; na ausência, host derivado do Referer. */
  origin: string | null;
}

export type ResultadoIngest =
  | 'gravado'
  | 'chave_invalida'
  | 'origem_nao_autorizada'
  | 'bot'
  | 'erro';

const CACHE_TTL_MS = 60_000;

@Injectable()
export class PageviewService {
  private readonly logger = new Logger('Pageview');

  /**
   * Cache de chave → site. O endpoint é o mais chamado do sistema e a resolução da
   * chave não muda de segundo em segundo.
   *
   * Resultado NEGATIVO também é cacheado (valor `null`): sem isso, um flood com
   * chave inexistente viraria uma query ao banco por requisição — exatamente o que
   * um atacante faria de graça.
   */
  private readonly cacheSite = new Map<string, { site: SiteCache | null; expiraEm: number }>();

  /** Rejeições agrupadas por motivo — evita uma linha de log por requisição num flood. */
  private readonly rejeicoes = new Map<ResultadoIngest, number>();
  private ultimoResumo = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Segredo do hash de visitante.
   *
   * Sem `ANALYTICS_HASH_SECRET`, cai no `JWT_SECRET` para o ambiente funcionar sem
   * configuração extra. Sem nenhum dos dois, gera um por processo e AVISA: as
   * métricas continuam saindo, mas o hash deixa de ser estável entre réplicas e a
   * contagem de visitante único fica inflada. Falhar aqui derrubaria a landing por
   * causa de analytics, o que é troca pior.
   */
  private segredoDoHash(): string {
    const s = process.env.ANALYTICS_HASH_SECRET ?? process.env.JWT_SECRET;
    if (s) return s;
    if (!this.segredoImprovisado) {
      this.segredoImprovisado = Math.random().toString(36).slice(2);
      this.logger.error(
        'ANALYTICS_HASH_SECRET e JWT_SECRET ausentes — usando segredo por processo. ' +
        'A contagem de visitante único fica INFLADA (cada réplica conta o mesmo visitante). Configure a env.',
      );
    }
    return this.segredoImprovisado;
  }
  private segredoImprovisado: string | null = null;

  private async resolverSite(key: string): Promise<SiteCache | null> {
    const agora = Date.now();
    const emCache = this.cacheSite.get(key);
    if (emCache && emCache.expiraEm > agora) return emCache.site;

    const site = await this.prisma.website
      .findUnique({ where: { key }, select: { tenantId: true, domain: true, isActive: true } })
      .catch((e: any) => {
        this.logger.warn(`Falha ao resolver websiteKey: ${e?.message}`);
        return null;
      });

    const valor: SiteCache | null = site && site.isActive
      ? { tenantId: site.tenantId, domain: site.domain.toLowerCase().replace(/^www\./, '') }
      : null;

    this.cacheSite.set(key, { site: valor, expiraEm: agora + CACHE_TTL_MS });
    return valor;
  }

  /**
   * A requisição vem do domínio autorizado?
   *
   * CORS não serve como controle aqui: ele impede o NAVEGADOR de ler a resposta, e
   * não impede um `curl` de postar. Conferir o Origin no servidor é o que de fato
   * dificulta poluir a estatística de fora.
   *
   * Subdomínio do domínio autorizado passa (staging, www). Origin ausente NÃO passa:
   * o site e a API estão em domínios diferentes, então o navegador sempre manda.
   */
  private origemAutorizada(origin: string | null, domain: string): boolean {
    if (!origin) return false;
    let host: string;
    try {
      host = new URL(origin.includes('://') ? origin : `https://${origin}`).hostname.toLowerCase();
    } catch {
      return false;
    }
    host = host.replace(/^www\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  }

  /** Agrupa rejeições e resume uma vez por minuto (REGRA 3 sem inundar o log). */
  private registrarRejeicao(motivo: ResultadoIngest) {
    this.rejeicoes.set(motivo, (this.rejeicoes.get(motivo) ?? 0) + 1);
    const agora = Date.now();
    if (agora - this.ultimoResumo < 60_000) return;
    this.ultimoResumo = agora;
    const resumo = [...this.rejeicoes.entries()].map(([m, n]) => `${m}=${n}`).join(' ');
    this.rejeicoes.clear();
    this.logger.warn(`Pageviews descartados no último minuto: ${resumo}`);
  }

  async ingest(input: PageviewInput, ctx: PageviewContexto): Promise<ResultadoIngest> {
    try {
      // Bot primeiro: é o descarte mais barato e o mais frequente.
      if (ehBot(ctx.userAgent)) {
        this.registrarRejeicao('bot');
        return 'bot';
      }

      const site = await this.resolverSite(input.websiteKey);
      if (!site) {
        this.registrarRejeicao('chave_invalida');
        return 'chave_invalida';
      }

      if (!this.origemAutorizada(ctx.origin, site.domain)) {
        this.registrarRejeicao('origem_nao_autorizada');
        return 'origem_nao_autorizada';
      }

      const u = higienizarUrl(input.url);
      const cliente = detectarCliente(ctx.userAgent);

      await this.prisma.pageView.create({
        data: {
          tenantId: site.tenantId,
          websiteKey: input.websiteKey,
          path: u.path,
          query: u.query,
          title: input.title?.trim().slice(0, 300) || null,
          referrerDomain: dominioDoReferrer(input.referrer),
          utmSource: u.utmSource,
          utmMedium: u.utmMedium,
          utmCampaign: u.utmCampaign,
          utmTerm: u.utmTerm,
          utmContent: u.utmContent,
          clickId: u.clickId,
          visitorHash: hashVisitante(ctx.ip, ctx.userAgent, this.segredoDoHash()),
          browser: cliente.browser,
          os: cliente.os,
          device: cliente.device,
          language: input.language?.trim().slice(0, 20) || null,
          screen: /^\d{2,5}x\d{2,5}$/.test(input.screen ?? '') ? input.screen! : null,
          // country/region ficam nulos na Fase 1 — derivar país exige base GeoIP e a
          // dependência não foi decidida. As colunas já existem.
        },
      });

      return 'gravado';
    } catch (e: any) {
      // Sem rethrow: o controller responde 204 de qualquer jeito. Analytics não
      // pode ser o motivo de a landing parecer lenta ou quebrada.
      this.logger.warn(`Falha ao gravar pageview: ${e?.message}`);
      this.registrarRejeicao('erro');
      return 'erro';
    }
  }
}

interface SiteCache {
  tenantId: string;
  /** Sem `www.`, minúsculo — comparado com o host do Origin. */
  domain: string;
}
