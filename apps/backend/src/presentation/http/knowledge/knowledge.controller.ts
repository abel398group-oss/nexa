import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() q: PaginationQueryDto) {
    return this.knowledge.findAll(tenantId ?? 'default', q);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.knowledge.findOne(tenantId ?? 'default', id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateKnowledgeDto) {
    return this.knowledge.create(tenantId ?? 'default', dto);
  }

  // importa conhecimento de um produto conectado (ex.: hipertms)
  @Post('import/:productCode')
  importFromConnector(
    @CurrentTenant() tenantId: string,
    @Param('productCode') productCode: string,
  ) {
    return this.knowledge.importFromConnector(tenantId ?? 'default', productCode);
  }

  @Post(':id/versions')
  addVersion(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddVersionDto,
  ) {
    return this.knowledge.addVersion(tenantId ?? 'default', id, dto.content, dto.author);
  }

  @Post('versions/:versionId/approve')
  approve(
    @CurrentTenant() tenantId: string,
    @Param('versionId') versionId: string,
    @Body() dto: ApproveVersionDto,
  ) {
    return this.knowledge.approveVersion(tenantId ?? 'default', versionId, dto.reviewer);
  }
}
