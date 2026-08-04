/**
 * Custo de IA por cliente — visão do ADMIN DA PLATAFORMA.
 *
 * Fica atrás do `PlatformAdminGuard` porque o relatório atravessa tenants por
 * natureza: mostra quanto cada cliente consumiu. Um admin de tenant não pode ver
 * o gasto dos outros — seria vazamento de informação comercial entre concorrentes.
 *
 * Só leitura. O corte automático continua sendo do teto diário
 * (`AI_DAILY_COST_CAP_USD`, no ConversationAgent); aqui ninguém bloqueia nada.
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PlatformAdminGuard } from '@/shared/auth/platform-admin.guard';
import { AiCostService } from '@/application/metrics/ai-cost.service';

@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('admin/ai-cost')
export class AiCostController {
  constructor(private readonly cost: AiCostService) {}

  /**
   * GET /admin/ai-cost?days=7
   *
   * `days` ausente = hoje. O padrão é o dia porque é a pergunta que se faz na
   * prática ("quem está caro AGORA?"); a janela maior serve para tendência.
   */
  @Get()
  async report(@Query('days') days?: string) {
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) return this.cost.today();

    const desde = new Date(Date.now() - Math.min(n, 90) * 24 * 60 * 60 * 1000);
    return this.cost.report(desde);
  }

  /** GET /admin/ai-cost/month — fechamento do mês corrente. */
  @Get('month')
  month() {
    return this.cost.thisMonth();
  }
}
