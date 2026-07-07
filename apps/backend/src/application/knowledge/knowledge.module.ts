import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeBootstrapService } from './knowledge-bootstrap.service';
import { KnowledgeController } from '@/presentation/http/knowledge/knowledge.controller';

@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeBootstrapService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
