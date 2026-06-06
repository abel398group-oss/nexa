import { Injectable, Logger } from '@nestjs/common';

// Kill switch da autonomia da IA (ADR 012).
// Default vem do .env; pode ser ligado/desligado em runtime (botão de pânico).
@Injectable()
export class AutonomyService {
  private readonly logger = new Logger('Autonomy');
  private enabled: boolean;
  private lastChangedBy = 'boot';

  constructor() {
    this.enabled = String(process.env.AI_AUTONOMY_ENABLED).toLowerCase() === 'true';
    this.logger.log(`Autonomia inicial: ${this.enabled ? 'LIGADA' : 'DESLIGADA'}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean, changedBy = 'admin') {
    this.enabled = value;
    this.lastChangedBy = changedBy;
    this.logger.warn(`KILL SWITCH: autonomia ${value ? 'LIGADA' : 'DESLIGADA'} por ${changedBy}`);
    return this.status();
  }

  status() {
    return { autonomyEnabled: this.enabled, lastChangedBy: this.lastChangedBy };
  }
}
