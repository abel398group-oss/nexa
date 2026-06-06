import { Global, Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';

// Cliente Anthropic compartilhado por todos os agentes (Router, Support, Sales...).
@Global()
@Module({
  providers: [AnthropicService],
  exports: [AnthropicService],
})
export class AiModule {}
