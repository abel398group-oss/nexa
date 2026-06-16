import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { KnowledgeService } from '@/application/knowledge/knowledge.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';
import {
  CreateKnowledgeDto,
  AddVersionDto,
  ApproveVersionDto,
} from '@/application/knowledge/dto/create-knowledge.dto';

class BulkDeleteDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() q: PaginationQueryDto,
    @Query('category') category?: string,
  ) {
    return this.knowledge.findAll(tenantId, q, category);
  }

  // exclusão em lote (definir ANTES de :id)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string, @Body() body: BulkDeleteDto) {
    return this.knowledge.deleteItems(tenantId, body.ids ?? []);
  }

  // (re)gera os vetores semânticos da KB (RAG). Rodar após a migração do pgvector.
  // ?force=true reindexa tudo; senão só os itens sem vetor.
  @Post('reindex')
  reindex(@CurrentTenant() tenantId: string, @Query('force') force?: string) {
    return this.knowledge.reindex(tenantId, force === 'true');
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.knowledge.findOne(tenantId, id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateKnowledgeDto) {
    return this.knowledge.create(tenantId, dto);
  }

  // importa conhecimento de um produto conectado (ex.: hipertms)
  @Post('import/:productCode')
  importFromConnector(
    @CurrentTenant() tenantId: string,
    @Param('productCode') productCode: string,
  ) {
    return this.knowledge.importFromConnector(tenantId, productCode);
  }

  @Patch(':id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    return this.knowledge.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.knowledge.remove(tenantId, id);
  }

  @Post(':id/versions')
  addVersion(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddVersionDto,
  ) {
    return this.knowledge.addVersion(tenantId, id, dto.content, dto.author);
  }

  @Post('versions/:versionId/approve')
  approve(
    @CurrentTenant() tenantId: string,
    @Param('versionId') versionId: string,
    @Body() dto: ApproveVersionDto,
  ) {
    return this.knowledge.approveVersion(tenantId, versionId, dto.reviewer);
  }
}
