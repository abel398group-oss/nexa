import { Global, Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { EmbeddingsService } from './embeddings.service';

// Cliente Anthropic + embeddings, compartilhados por todos os agentes (Router, Support, Sales...).
@Global()
@Module({
  providers: [AnthropicService, EmbeddingsService],
  exports: [AnthropicService, EmbeddingsService],
})
export class AiModule {}
