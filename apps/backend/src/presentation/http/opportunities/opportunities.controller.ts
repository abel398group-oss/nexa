import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { OpportunitiesService, OPP_STAGES } from '@/application/opportunities/opportunities.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';

class CreateOpportunityDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() conversationId?: string;
  @IsOptional() @IsIn(OPP_STAGES as any) stage?: string;
  @IsOptional() @IsNumber() interestScore?: number;
  @IsOptional() @IsString() intent?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() assignedTo?: string;
}

class UpdateOpportunityDto extends CreateOpportunityDto {}

class MoveStageDto {
  @IsIn(OPP_STAGES as any) stage!: string;
  @IsOptional() @IsString() reason?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opps: OpportunitiesService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() q: PaginationQueryDto, @Query('stage') stage?: string) {
    return this.opps.findAll(tenantId ?? 'default', q, stage);
  }

  // antes de :id para nao casar 'summary' como id
  @Get('summary')
  summary(@CurrentTenant() tenantId: string) {
    return this.opps.summary(tenantId ?? 'default');
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.opps.findOne(tenantId ?? 'default', id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateOpportunityDto) {
    return this.opps.create(tenantId ?? 'default', dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opps.update(tenantId ?? 'default', id, dto);
  }

  @Patch(':id/stage')
  moveStage(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: MoveStageDto) {
    return this.opps.moveStage(tenantId ?? 'default', id, dto.stage, dto.reason);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.opps.remove(tenantId ?? 'default', id);
  }
}
