/**
 * ScraperAlertService — recebe do TMS o resultado da análise do log do nginx e avisa
 * o admin da plataforma no WhatsApp + e-mail.
 *
 * POR QUE O DESENHO É INVERTIDO (19/08/2026)
 *
 * O diretório público de transportadoras (~332 mil páginas estáticas em
 * `hipertms.com.br/transportadoras/`) não embarca JavaScript — e scraper não executa
 * JavaScript de qualquer forma. O beacon do Nexa (`POST /api/tracking/pageview`) é
 * client-side: ele mede humano e é CEGO para raspagem. Instrumentar as páginas daria
 * um número tranquilizador e falso.
 *
 * A única fonte de verdade é `/var/log/nginx/access.log` do droplet, que este backend
 * NÃO alcança: roda em container montando apenas `nexa-models` e `nexa-uploads`, e não
 * existe uma linha no código que leia arquivo de log. Então quem analisa é um cron do
 * lado do TMS, no host; o Nexa é o canal que fala. Mesma divisão do resto do Monitor —
 * o TMS detecta, o Nexa avisa.
 *
 * POR QUE NÃO REUSAR `POST /monitor/ingest`
 *
 * Aquele fluxo é por sub-cliente (mapeia `tmsTenantId` → `adminPhone` do cliente) e sua
 * `category` é um `@IsIn` de cinco setores do TMS. Um valor novo ali toma 400 e derruba
 * o LOTE INTEIRO (REGRA 2 — `forbidNonWhitelisted`), que é exatamente a classe do
 * incidente `sendWindowStart`. Raspagem no diretório público é assunto do admin da
 * plataforma, não de um sub-cliente.
 */
import { Injectable, Logger } from '@nestjs/common';
import { RedisLockService } from '@/shared/lock/redis-lock.service';
import { AdminAlertService } from './admin-alert.service';

/** Um IP suspeito, com a evidência que o script do TMS apurou no log. */
export interface ScraperSuspect {
  ip: string;
  hits: number;
  /** Pico de requisições por minuto — o sinal de cadência de robô. */
  peakRpm?: number;
  userAgent?: string;
  /**
   * Baixou os assets da página (`directory.css`)?
   *
   * É o sinal mais forte que existe aqui: navegador real sempre puxa o CSS, e isto
   * pega scraper que falsifica user-agent — o caso que heurística de UA sozinha deixa
   * passar. `undefined` significa NÃO APURADO, e é impresso assim: tratar ausência
   * como `false` inventaria evidência, e evidência inventada vira bloqueio errado.
   */
  fetchedCss?: boolean;
  /** ISO 8601. Janela em que os hits deste IP aconteceram. */
  windowStart?: string;
  windowEnd?: string;
  /** Amostra de páginas alvo. */
  paths?: string[];
}

export interface ScraperReport {
  /** Caminho monitorado, ex. "hipertms.com.br/transportadoras". Compõe a chave do ritmo. */
  site: string;
  /**
   * `critical` FURA o ritmo — é o "me avise fora da cadência" combinado com o squad do
   * TMS (IP novo com mais de 1.000 hits em menos de 1 hora, padrão de quem está
   * clonando a base). Quem decide a severidade é o script, que tem o log; o Nexa não
   * reclassifica o que não pode conferir.
   */
  severity?: 'info' | 'warn' | 'critical';
  /** Janela analisada, em horas. Só para o texto da mensagem. */
  windowHours?: number;
  totalHits?: number;
  uniqueIps?: number;
  suspects: ScraperSuspect[];
  /** Valida e formata sem enviar nada — para o squad testar sem acordar o admin. */
  dryRun?: boolean;
}

export interface ScraperAlertResult {
  received: number;
  /** Quantos entraram na mensagem. */
  alerted: number;
  /** Quantos foram calados pelo ritmo por IP. */
  throttled: number;
  dryRun: boolean;
  /** `null` quando nada foi enviado (dryRun, ou todos calados). */
  channels: { whatsapp: boolean; email: boolean } | null;
  /** Só no dryRun, para o autor do script conferir o texto que sairia. */
  preview?: string;
}

/** Teto do que entra na mensagem. Ver `formatar`. */
const NA_MENSAGEM = 10;
const PATHS_POR_SUSPEITO = 3;
const THROTTLE_H_PADRAO = 6;

@Injectable()
export class ScraperAlertService {
  private readonly logger = new Logger('ScraperAlert');

  constructor(
    private readonly alerta: AdminAlertService,
    private readonly lock: RedisLockService,
  ) {}

  async report(r: ScraperReport): Promise<ScraperAlertResult> {
    const critical = r.severity === 'critical';
    const dryRun = r.dryRun === true;

    // Maior primeiro: se o teto da mensagem cortar alguém, que corte o menos grave.
    const suspeitos = [...r.suspects].sort((a, b) => b.hits - a.hits);

    const novos: ScraperSuspect[] = [];
    let throttled = 0;
    for (const s of suspeitos) {
      // `critical` fura o ritmo; `dryRun` não pode CONSUMIR o ritmo, senão um teste
      // do squad silenciaria o alerta real das próximas horas.
      if (critical || dryRun || (await this.marcarAvisado(r.site, s.ip))) novos.push(s);
      else throttled++;
    }

    if (novos.length === 0) {
      this.logger.log(
        `${r.site}: ${suspeitos.length} suspeito(s), todos dentro do ritmo — nada enviado`,
      );
      return { received: suspeitos.length, alerted: 0, throttled, dryRun, channels: null };
    }

    const assunto = critical
      ? `Raspagem em curso — ${r.site}`
      : `Suspeita de raspagem — ${r.site}`;
    const corpo = this.formatar(r, novos, throttled);

    if (dryRun) {
      return {
        received: suspeitos.length,
        alerted: novos.length,
        throttled,
        dryRun: true,
        channels: null,
        preview: `${assunto}\n\n${corpo}`,
      };
    }

    const channels = await this.alerta.notifyAdmin(assunto, corpo, {
      icon: critical ? '🚨' : '⚠️',
    });
    // REGRA 3: o resultado de cada canal vai para o log — alerta que não saiu nem por
    // WhatsApp nem por e-mail é um incidente silencioso, o pior tipo.
    this.logger.log(
      `${r.site}: avisado sobre ${novos.length} IP(s) — whatsapp=${channels.whatsapp} email=${channels.email}`,
    );
    if (!channels.whatsapp && !channels.email) {
      this.logger.error(
        `${r.site}: NENHUM canal de admin entregou o alerta de raspagem (confira ALERT_ADMIN_PHONE / ALERT_ADMIN_EMAIL)`,
      );
    }

    return { received: suspeitos.length, alerted: novos.length, throttled, dryRun: false, channels };
  }

  /**
   * Ritmo por IP: um mesmo suspeito só volta a gerar mensagem depois de
   * `SCRAPER_ALERT_THROTTLE_H` horas (padrão 6). O cron do TMS roda diariamente, mas
   * nada impede o script de rodar de hora em hora — e o mesmo scraper varrendo a base
   * a semana toda apareceria em todo relatório. Alerta que chega demais deixa de ser
   * lido, e aí o IP NOVO passa batido no meio dos conhecidos.
   *
   * Usa o lock do Redis como marca de "já avisei", com o TTL fazendo o papel da
   * janela — POR ISSO O RELEASE NUNCA É CHAMADO. Soltar a chave no fim reabriria o
   * aviso na chamada seguinte e o ritmo não existiria.
   *
   * Sem `REDIS_URL` o lock é no-op e sempre "adquire": fail-open, ou seja, avisa duas
   * vezes em vez de calar. Para caminho de alerta é a falha certa.
   */
  private async marcarAvisado(site: string, ip: string): Promise<boolean> {
    const horas = Number(process.env.SCRAPER_ALERT_THROTTLE_H ?? THROTTLE_H_PADRAO);
    const validas = Number.isFinite(horas) && horas > 0 ? horas : THROTTLE_H_PADRAO;
    const ttl = Math.max(60, Math.round(validas * 3600));
    const marca = await this.lock.acquire(`nexa:scraper-alert:${site}:${ip}`, ttl);
    return marca !== null;
  }

  /**
   * Texto puro — o mesmo serve para WhatsApp e e-mail (`notifyAdmin`).
   *
   * O IP vai INTEIRO, sem mascarar. IP é dado pessoal (LGPD) e no relatório de tráfego
   * do TMS o último octeto é mascarado; aqui não pode ser, porque o destinatário é o
   * admin da plataforma e o número existe para uma coisa só: decidir bloqueio. IP
   * mascarado não bloqueia ninguém.
   */
  private formatar(r: ScraperReport, novos: ScraperSuspect[], throttled: number): string {
    const linhas: string[] = [];

    const cabecalho = [
      r.windowHours ? `janela ${r.windowHours}h` : null,
      r.totalHits != null ? `${r.totalHits.toLocaleString('pt-BR')} hits` : null,
      r.uniqueIps != null ? `${r.uniqueIps.toLocaleString('pt-BR')} IPs distintos` : null,
    ].filter(Boolean);
    if (cabecalho.length) linhas.push(cabecalho.join(' · '), '');

    linhas.push(`${novos.length} suspeito(s) de raspagem:`, '');

    for (const [i, s] of novos.slice(0, NA_MENSAGEM).entries()) {
      const volume = [
        `${s.hits.toLocaleString('pt-BR')} hits`,
        s.peakRpm != null ? `pico ${s.peakRpm} req/min` : null,
      ]
        .filter(Boolean)
        .join(', ');
      linhas.push(`${i + 1}. ${s.ip} — ${volume}`);

      if (s.userAgent) linhas.push(`   UA: ${s.userAgent}`);
      linhas.push(`   CSS: ${cssLegivel(s.fetchedCss)}`);
      if (s.windowStart || s.windowEnd) {
        linhas.push(`   Janela: ${s.windowStart ?? '?'} → ${s.windowEnd ?? '?'}`);
      }
      if (s.paths?.length) {
        const amostra = s.paths.slice(0, PATHS_POR_SUSPEITO).join(', ');
        const resto = s.paths.length - PATHS_POR_SUSPEITO;
        linhas.push(`   Alvos: ${amostra}${resto > 0 ? ` (+${resto})` : ''}`);
      }
      linhas.push('');
    }

    // O que ficou de fora é dito, nunca omitido: lista truncada em silêncio lê-se como
    // "eram só esses".
    const cortados = novos.length - NA_MENSAGEM;
    if (cortados > 0) {
      linhas.push(`+${cortados} suspeito(s) não listados aqui — ver o relatório do TMS.`);
    }
    if (throttled > 0) {
      linhas.push(`${throttled} IP(s) já avisados recentemente foram omitidos.`);
    }

    return linhas.join('\n').trim();
  }
}

/** `undefined` = não apurado. Ver o comentário de `fetchedCss`. */
function cssLegivel(fetched: boolean | undefined): string {
  if (fetched === false) return 'NÃO baixou o CSS — sinal forte de robô';
  if (fetched === true) return 'baixou o CSS (compatível com navegador real)';
  return 'não apurado';
}
