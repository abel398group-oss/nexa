import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { DISCARD_REASONS, OpportunitiesService, OPP_STAGES } from '@/application/opportunities/opportunities.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
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
  // F6+ seller-leads: dono real (FK Seller)
  @IsOptional() @IsString() assignedSellerId?: string;
}

class UpdateOpportunityDto extends CreateOpportunityDto {}

class FromConversationDto {
  @IsString() conversationId!: string;
}

class MoveStageDto {
  @IsIn(OPP_STAGES as any) stage!: string;
  @IsOptional() @IsString() reason?: string;
  // F6+: stage=paused → quando retomar; stage=discarded → motivo (analise de perdas)
  @IsOptional() @IsISO8601() pausedUntil?: string;
  @IsOptional() @IsIn(DISCARD_REASONS as any) discardReason?: string;
}

// F7 (RevOps): compartilhar lead com parceiro externo.
class SharePartnerDto {
  @IsString() partnerId!: string;
}

/**
 * F6+ seller-leads: role `vendedor` opera SOMENTE os proprios leads — o escopo
 * vem do JWT (user.sellerId), nunca de query/body. Vendedor sem sellerId vira
 * '__none__' (nao casa com nada). Demais roles: sem escopo (visao completa).
 */
function sellerScopeOf(user: { role?: string; sellerId?: string | null } | undefined): string | undefined {
  if (user?.role !== 'vendedor') return undefined;
  return user.sellerId ?? '__none__';
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opps: OpportunitiesService) {}

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query() q: PaginationQueryDto,
    @Query('stage') stage?: string,
  ) {
    return this.opps.findAll(tenantId, q, stage, sellerScopeOf(user));
  }

  // antes de :id para nao casar 'summary' como id
  @Get('summary')
  summary(@CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    return this.opps.summary(tenantId, sellerScopeOf(user));
  }

  // F7 (RevOps): promove uma conversa a oportunidade (decisao manual do
  // vendedor, para o que a regra automatica de score >= 70 deixa passar).
  @Post('from-conversation')
  fromConversation(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: FromConversationDto,
  ) {
    return this.opps.createFromConversation(tenantId, dto.conversationId, sellerScopeOf(user));
  }

  // F7 (RevOps): fila de trabalho do vendedor, ja priorizada. Antes de :id.
  @Get('queue')
  queue(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Query('take') take?: string) {
    const n = take ? parseInt(take, 10) : 30;
    return this.opps.queue(tenantId, sellerScopeOf(user), Number.isFinite(n) ? Math.min(n, 100) : 30);
  }

  // F6+: grafico de evolucao semanal (recebidos × fechados). Antes de :id.
  @Get('evolution')
  evolution(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query('weeks') weeks?: string,
  ) {
    const w = weeks ? parseInt(weeks, 10) : 8;
    return this.opps.evolution(tenantId, Number.isFinite(w) ? w : 8, sellerScopeOf(user));
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string) {
    return this.opps.findOne(tenantId, id, sellerScopeOf(user));
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Body() dto: CreateOpportunityDto) {
    // vendedor criando manualmente → lead nasce dele (nunca de outro, nem mesmo
    // quando ele nao tem sellerId — nesse caso o campo enviado pelo cliente e
    // descartado em vez de passar direto, senao um vendedor sem perfil poderia
    // plantar o lead na conta de outro vendedor)
    const scope = sellerScopeOf(user);
    if (scope) dto.assignedSellerId = scope === '__none__' ? undefined : scope;
    return this.opps.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityDto,
  ) {
    // vendedor nao reatribui lead (nem para si, nem para outro) — admin/gestor sim
    const scope = sellerScopeOf(user);
    if (scope) delete dto.assignedSellerId;
    return this.opps.update(tenantId, id, dto, scope);
  }

  @Patch(':id/stage')
  moveStage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: MoveStageDto,
  ) {
    return this.opps.moveStage(
      tenantId,
      id,
      dto.stage,
      dto.reason,
      { pausedUntil: dto.pausedUntil, discardReason: dto.discardReason },
      sellerScopeOf(user),
    );
  }

  // F7 (RevOps): registra o consentimento do lead pra compartilhar com parceiro externo (LGPD).
  @Patch(':id/partner-consent')
  recordPartnerConsent(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string) {
    return this.opps.recordPartnerConsent(tenantId, id, sellerScopeOf(user));
  }

  // F7 (RevOps): compartilha o lead com o parceiro (bloqueia sem consentimento prévio).
  @Post(':id/share-partner')
  shareWithPartner(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: SharePartnerDto,
  ) {
    return this.opps.shareWithPartner(tenantId, id, dto.partnerId, sellerScopeOf(user));
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @CurrentUser() user: any, @Param('id') id: string) {
    return this.opps.remove(tenantId, id, sellerScopeOf(user));
  }
}
