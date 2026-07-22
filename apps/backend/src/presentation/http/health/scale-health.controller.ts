import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScaleWatchService } from '@/application/monitor/scale-watch.service';

/**
 * GET /api/health/scale — foto sob demanda dos 3 gargalos de escala
 * (docs/infra/monitoramento-gargalos-2026-07.md). Só leitura; público como o
 * resto de /health (não expõe dado sensível — só contadores de infra).
 */
@ApiTags('health')
@Controller('health')
export class ScaleHealthController {
  constructor(private readonly scale: ScaleWatchService) {}

  @Get('scale')
  async scaleSnapshot() {
    return this.scale.snapshot();
  }
}
