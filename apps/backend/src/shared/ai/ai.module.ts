import { Global, Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { EmbeddingsService } from './embeddings.service';
import { TranscriptionService } from './transcription.service';

// Cliente Anthropic + embeddings + transcrição, compartilhados por todos os agentes.
@Global()
@Module({
  providers: [AnthropicService, EmbeddingsService, TranscriptionService],
  exports: [AnthropicService, EmbeddingsService, TranscriptionService],
})
export class AiModule {}
