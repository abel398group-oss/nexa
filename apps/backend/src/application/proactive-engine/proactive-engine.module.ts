import { Module } from '@nestjs/common';
import { ProactiveDetectorService } from './proactive-detector.service';
import { ProactiveExecutorService } from './proactive-executor.service';
import { ProactiveEngineCron } from './proactive-engine.cron';
import { ProactiveRuleConfigService } from './proactive-rule-config.service';
import { NotificationsModule } from '@/application/notifications/notifications.module';
// SLA estourado avisa o CLIENTE, não só o time interno (ver handleSlaBreach).
import { ConversationsModule } from '@/application/conversations/conversations.module';

// GovernanceModule is @Global() — AutonomyService injected without explicit import.
@Module({
  imports: [NotificationsModule, ConversationsModule],
  providers: [
    ProactiveRuleConfigService,
    ProactiveDetectorService,
    ProactiveExecutorService,
    ProactiveEngineCron,
  ],
  exports: [ProactiveRuleConfigService], // allows onboarding to call seedDefaults()
})
export class ProactiveEngineModule {}
