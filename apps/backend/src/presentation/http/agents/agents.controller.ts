import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { SupportAgentService } from '@/application/agents/support-agent.service';
import { ConversationAgentService } from '@/application/agents/conversation-agent.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class AskDto {
  @IsString() @MinLength(2) question!: string;
  @IsOptional() @IsString() conversationId?: string;
}

class HandleDto {
  @IsString() @MinLength(2) message!: string;
  @IsOptional() @IsString() conversationId?: string;
  @IsOptional() @IsString() productCode?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentsController {
  constructor(
    private readonly support: SupportAgentService,
    private readonly conversation: ConversationAgentService,
  ) {}

  // Suporte direto (rascunho por padrão; auto-envia só com autonomia ligada)
  @Post('ask')
  ask(@CurrentTenant() tenantId: string, @Body() dto: AskDto) {
    return this.support.ask(tenantId ?? 'default', dto);
  }

  // Pipeline completo: classifica intenção → roteia (sales/support/human/optout) → responde
  @Post('handle')
  handle(@CurrentTenant() tenantId: string, @Body() dto: HandleDto) {
    return this.conversation.handle(tenantId ?? 'default', dto);
  }
}
