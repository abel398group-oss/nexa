/**
 * TrackingController — ingest público de pageview (FASE 1).
 *
 * POST /api/tracking/pageview
 *
 * PÚBLICO de propósito: quem chama é o navegador de um visitante anônimo no site do
 * produto. Não pode usar `TMS_SERVICE_TOKEN` — qualquer token embutido no bundle do
 * frontend é legível por quem abrir o DevTools, então "autenticar" aqui daria uma
 * falsa sensação de segurança e vazaria um segredo de verdade.
 *
 * A `websiteKey` do corpo IDENTIFICA o site, não autentica. Se vazar, o pior cenário
 * possível é alguém poluir estatística de visita — ela não dá acesso a nada.
 */
import { Body, Controller, Headers, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageviewService } from '@/application/analytics/pageview.service';

/**
 * Contrato com o frontend do produto. Campo novo aqui exige mudança combinada dos
 * dois lados: o ValidationPipe global roda com `forbidNonWhitelisted`, então uma
 * propriedade não declarada faz a requisição inteira voltar 400 — e o TMS não
 * saberia por quê. Ver REGRA 1 em REGRAS-SQUAD.md.
 */
class PageviewDto {
  @IsString() @MinLength(8) @MaxLength(64) websiteKey!: string;
  /** Path + query, já higienizada no cliente. O servidor higieniza de novo. */
  @IsString() @MinLength(1) @MaxLength(2000) url!: string;
  @IsOptional() @IsString() @MaxLength(2000) referrer?: string;
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(20) screen?: string;
  @IsOptional() @IsString() @MaxLength(20) language?: string;
}

@Controller('tracking')
export class TrackingController {
  constructor(private readonly pageviews: PageviewService) {}

  /**
   * 204 SEMPRE, inclusive quando o registro é descartado (bot, chave inválida,
   * origem não autorizada, erro interno).
   *
   * Dois motivos. O visitante não pode sentir a landing travar por causa de
   * analytics — é a razão declarada na spec. E responder diferente por motivo
   * transformaria o endpoint num oráculo: quem quisesse descobrir uma `websiteKey`
   * válida por tentativa saberia exatamente quando acertou.
   *
   * Rate limit próprio, mais alto que o global (100/min): um visitante navegando
   * rápido gera vários pageviews em sequência, e cortá-lo faria a métrica mentir por
   * baixo justamente nas visitas mais engajadas.
   *
   * ATENÇÃO — o limite é por IP e depende de `trust proxy` no main.ts. Sem ele, em
   * produção todos os visitantes compartilham o IP do reverse proxy e este limite
   * passaria a valer para o site inteiro somado.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('pageview')
  @HttpCode(204)
  async pageview(
    @Body() dto: PageviewDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('origin') origin: string,
    @Headers('referer') referer: string,
    // Headers inteiros: país/região vêm do CDN (cf-ipcountry e afins) quando existe
    // um na frente. Ver localizacaoDoHeader.
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    await this.pageviews.ingest(
      {
        websiteKey: dto.websiteKey,
        url: dto.url,
        referrer: dto.referrer,
        title: dto.title,
        screen: dto.screen,
        language: dto.language,
      },
      {
        ip: ip ?? '0.0.0.0',
        userAgent: userAgent ?? '',
        // Origin é o header certo; o Referer entra como reserva para o caso de um
        // navegador antigo omitir Origin num POST same-site.
        origin: origin ?? referer ?? null,
        headers,
      },
    );
    // Sem corpo. O cliente não recebe (e não precisa de) o resultado.
  }
}
