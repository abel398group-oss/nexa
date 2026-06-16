import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { PlaybookService } from '@/application/playbook/playbook.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

class UpdatePlaybookDto {
  @IsOptional() @IsString() persona?: string;
  @IsOptional() @IsString() supportPersona?: string;
  @IsOptional() @IsArray() objections?: { objection: string; guidance: string }[];
  @IsOptional() @IsString() ctaCold?: string;
  @IsOptional() @IsString() ctaWarm?: string;
  @IsOptional() @IsString() ctaHot?: string;
  @IsOptional() @IsString() signupUrl?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('ai_control') // quem controla a IA edita o playbook
@Controller('playbook')
export class PlaybookController {
  constructor(private readonly playbook: PlaybookService) {}

  @Get()
  get(@CurrentTenant() tenantId: string) {
    return this.playbook.get(tenantId);
  }

  @Put()
  update(@CurrentTenant() tenantId: string, @Body() dto: UpdatePlaybookDto) {
    return this.playbook.update(tenantId, dto);
  }

  @Post('reset')
  reset(@CurrentTenant() tenantId: string) {
    return this.playbook.reset(tenantId);
  }
}
