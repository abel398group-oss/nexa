import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScaleWatchService } from '@/application/monitor/scale-watch.service';
import { DevWatchService } from '@/application/monitor/dev-watch.service';

/**
 * GET /api/health/scale    — foto dos 3 gargalos de escala.
 * GET /api/health/ai-cost  — gasto/tokens da Anthropic (Lia) hoje e no mês.
 * (docs/infra/monitoramento-gargalos-2026-07.md). Só leitura; público como o
 * resto de /health (não expõe dado sensível — só contadores de infra/custo).
 */
@ApiTags('health')
@Controller('health')
export class ScaleHealthController {
  constructor(
    private readonly scale: ScaleWatchService,
    private readonly dev: DevWatchService,
  ) {}

  @Get('scale')
  async scaleSnapshot() {
    return this.scale.snapshot();
  }

  @Get('ai-cost')
  async aiCost() {
    return this.dev.aiCostSnapshot();
  }
}
