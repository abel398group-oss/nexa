import { Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { SenderService } from '@/application/sender/sender.service';
import { EmailCampaignSenderService } from '@/application/email/email-campaign-sender.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
// base que o container do WAHA consegue acessar p/ baixar o anexo
const PUBLIC_BASE = process.env.WAHA_REACHABLE_BASE ?? 'http://host.docker.internal:3001';

class CreateCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(3) template!: string;
  @IsOptional() @IsArray() phones?: { phone: string; name?: string }[];
  @IsOptional() @IsBoolean() fromContacts?: boolean;
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsString() mediaName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sendLimit?: number;
}

class CreateEmailCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(5) subject!: string;
  @IsString() @MinLength(10) template!: string;
  @IsOptional() @IsArray() emails?: { email: string; name?: string }[];
  @IsOptional() @IsBoolean() fromContacts?: boolean;
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsBoolean() sendLinkOnFirst?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sendLimit?: number;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('campaigns')
@Controller()
export class SenderController {
  constructor(
    private readonly sender: SenderService,
    private readonly emailCampaign: EmailCampaignSenderService,
  ) {}

  @Get('campaigns')
  list(@CurrentTenant() tenantId: string) {
    return this.sender.listCampaigns(tenantId ?? 'default');
  }

  @Post('campaigns')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCampaignDto) {
    return this.sender.createCampaign(tenantId ?? 'default', dto);
  }

  @Post('campaigns/email')
  createEmail(@CurrentTenant() tenantId: string, @Body() dto: CreateEmailCampaignDto) {
    return this.emailCampaign.createEmailCampaign(tenantId ?? 'default', dto);
  }

  // upload do anexo (PDF/Word) — retorna a URL pública p/ usar na campanha
  @Post('campaigns/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
          cb(null, UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${Date.now()}_${safe}`);
        },
      }),
      limits: { fileSize: 16 * 1024 * 1024 }, // 16MB (limite do WhatsApp)
    }),
  )
  upload(@UploadedFile() file: any) {
    if (!file) return { error: 'nenhum arquivo' };
    return { url: `${PUBLIC_BASE}/uploads/${file.filename}`, name: file.originalname, size: file.size };
  }

  @Post('campaigns/:id/start')
  start(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.setStatus(tenantId ?? 'default', id, 'running');
  }

  @Post('campaigns/:id/pause')
  pause(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.setStatus(tenantId ?? 'default', id, 'paused');
  }

  @Delete('campaigns/:id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.removeCampaign(tenantId ?? 'default', id);
  }

  @Get('sender/numbers')
  numbers(@CurrentTenant() tenantId: string) {
    return this.sender.listNumbers(tenantId ?? 'default');
  }
}
