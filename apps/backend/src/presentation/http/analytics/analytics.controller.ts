/**
 * AnalyticsController — leitura das visitas do site, para o painel.
 *
 * Autenticado e escopado por tenant, ao contrário do ingest (`TrackingController`),
 * que é público de propósito. São coisas diferentes no mesmo domínio: um recebe de
 * visitante anônimo, o outro entrega número para quem toma decisão.
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PageviewStatsService, VisaoGeral } from '@/application/analytics/pageview-stats.service';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

class PeriodoDto {
  /** YYYY-MM-DD. Ausente → 7 dias atrás. */
  @IsOptional() @IsString() @Matches(DIA, { message: 'from deve ser YYYY-MM-DD' }) from?: string;
  /** YYYY-MM-DD, inclusive. Ausente → hoje. */
  @IsOptional() @IsString() @Matches(DIA, { message: 'to deve ser YYYY-MM-DD' }) to?: string;
}

/** Teto de 366 dias: período aberto viraria varredura da tabela inteira. */
const MAX_DIAS = 366;

// REGRA 2: query param não declarado aqui é derrubado com 400 pelo
// `forbidNonWhitelisted` global.
class CliquesDto {
  /** Janela em dias. Ausente → 30. */
  @IsOptional() @IsString() @Matches(/^\d{1,3}$/, { message: 'dias deve ser número' }) dias?: string;
  /** Filtra por uma campanha (o slug de utm_campaign). Ausente → todas. */
  @IsOptional() @IsString() campanha?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly stats: PageviewStatsService) {}

  @Get('site')
  async site(@CurrentTenant() tenantId: string, @Query() q: PeriodoDto): Promise<VisaoGeral> {
    const hoje = new Date();
    const to = q.to ? new Date(`${q.to}T00:00:00Z`) : hoje;
    const from = q.from
      ? new Date(`${q.from}T00:00:00Z`)
      : new Date(to.getTime() - 6 * 24 * 3600 * 1000); // 7 dias contando hoje

    // `to` é inclusivo para quem pede, exclusivo na query: pedir 08/08 tem de
    // incluir o que aconteceu às 23h de 08/08.
    const fimExclusivo = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) + 24 * 3600 * 1000,
    );

    const dias = Math.ceil((fimExclusivo.getTime() - from.getTime()) / (24 * 3600 * 1000));
    const inicio = dias > MAX_DIAS
      ? new Date(fimExclusivo.getTime() - MAX_DIAS * 24 * 3600 * 1000)
      : from;

    return this.stats.visaoGeral(tenantId, { from: inicio, to: fimExclusivo });
  }

  /**
   * QUEM clicou no link da campanha — nome, e-mail, telefone e hora.
   *
   * Separado de `/site` de propósito: aquele devolve contagem agregada e anônima;
   * este devolve pessoa identificada, que é dado pessoal e serve para o vendedor
   * ligar. Coisas diferentes merecem rotas diferentes.
   */
  @Get('site/cliques')
  cliques(@CurrentTenant() tenantId: string, @Query() q: CliquesDto) {
    const dias = Math.min(Number(q.dias ?? 30) || 30, MAX_DIAS);
    return this.stats.quemClicou(tenantId, {
      desde: new Date(Date.now() - dias * 24 * 3600 * 1000),
      campanha: q.campanha,
    });
  }
}
