import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SenderService } from '@/application/sender/sender.service';
import { EmailCampaignSenderService } from '@/application/email/email-campaign-sender.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
// A base pública do anexo é montada no SERVICE, na hora do envio (MEDIA_PUBLIC_BASE).
// A constante que existia aqui ficou órfã quando o upload passou a gravar só o
// caminho relativo.

class CreateCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(3) template!: string;
  @IsOptional() @IsString() type?: string; // "message" (padrão) | "status" (ADR-026)
  // F8: de qual produto/parceiro esta campanha fala. O lead herda na conversa e
  // a Lia busca só o conhecimento desse produto. Vazio = produto principal.
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsArray() phones?: { phone: string; name?: string }[];
  @IsOptional() @IsBoolean() fromContacts?: boolean;
  @IsOptional() @IsString() link?: string;
  // DISP-015: a tela envia `sendLinkOnFirst` junto com o link no WhatsApp (o
  // service já aceitava), mas o campo só existia no DTO de e-mail — e o
  // `forbidNonWhitelisted` global derrubava a criação com 400 sempre que o
  // operador preenchia o link. Mesmo padrão do incidente da REGRA 1/2.
  @IsOptional() @IsBoolean() sendLinkOnFirst?: boolean;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsString() mediaName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sendLimit?: number;
  @IsOptional() @IsString() scheduledAt?: string;
}

class CampaignIdsDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

/**
 * DISP-003: filtros/paginação do detalhe da campanha. Todos opcionais e SEM
 * default para `limit` — ausente significa "traz tudo", que é o comportamento
 * que a tela atual espera. (REGRA 2: query param não declarado aqui derrubaria
 * a request com 400 por causa do `forbidNonWhitelisted` global.)
 */
class CampaignDetailQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsIn(['queued', 'sending', 'sent', 'failed', 'skipped']) status?: string;
  @IsOptional() @IsString() search?: string;
}

// edição de campanha (draft ou paused com 0 envios)
class UpdateCampaignDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(3) template?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsString() mediaName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sendLimit?: number;
  // DISP-019: reagendar. O campo existia na criação mas não na edição, então
  // uma campanha agendada ficava presa no horário original. Aceita null para
  // remover o agendamento (dispara assim que iniciar).
  @IsOptional() @IsISO8601() scheduledAt?: string | null;
}

// REGRA 2: query param não declarado aqui é derrubado com 400 pelo
// `forbidNonWhitelisted` global — foi o que já aconteceu no incidente do DISP-015.
class AudienceQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

class SenderSettingsDto {
  @Type(() => Number) @IsInt() @Min(0) waStartHour!: number;
  @Type(() => Number) @IsInt() @Min(0) waEndHour!: number;
  @Type(() => Number) @IsInt() @Min(0) emailStartHour!: number;
  @Type(() => Number) @IsInt() @Min(0) emailEndHour!: number;
}

// DISP-008: sem isto qualquer string entrava na fila como "e-mail" e só falhava
// lá na frente, no SMTP, virando um alvo 'failed' sem motivo claro no relatório.
class EmailTargetDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() name?: string;
}

// TESTE: ignora o "já enviado" nesta campanha. Só vale com
// CAMPAIGN_RESEND_ALL_ENABLED ligado — ver podeIgnorarDedup.
class CreateEmailCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(1) subject!: string;
  @IsString() @MinLength(1) template!: string;
  // F8: mesmo campo da campanha de WhatsApp — sem ele aqui, o
  // `forbidNonWhitelisted` global derrubaria a criação com 400.
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmailTargetDto) emails?: EmailTargetDto[];
  @IsOptional() @IsBoolean() fromContacts?: boolean;
  @IsOptional() @IsString() link?: string;
  @IsOptional() @IsBoolean() sendLinkOnFirst?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sendLimit?: number;
  @IsOptional() @IsString() scheduledAt?: string;
  /**
   * TESTE: ignora o "já enviado" NESTA campanha, para reenviar ao mesmo endereço.
   *
   * Só tem efeito com `CAMPAIGN_RESEND_ALL_ENABLED` ligado (ver podeIgnorarDedup) —
   * pedir isto em produção com a variável desligada simplesmente não faz nada, em vez
   * de furar a proteção anti-spam.
   */
  @IsOptional() @IsBoolean() ignoreDedup?: boolean;
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
  list(@CurrentTenant() tenantId: string, @Query('archived') archived?: string) {
    return this.sender.listCampaigns(tenantId, archived === 'true');
  }

  // arquivar (guardar) campanhas selecionadas
  @Post('campaigns/archive')
  archive(@CurrentTenant() tenantId: string, @Body() dto: CampaignIdsDto) {
    return this.sender.setArchived(tenantId, dto.ids, true);
  }

  // desarquivar
  @Post('campaigns/unarchive')
  unarchive(@CurrentTenant() tenantId: string, @Body() dto: CampaignIdsDto) {
    return this.sender.setArchived(tenantId, dto.ids, false);
  }

  // excluir várias de uma vez
  @Post('campaigns/bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string, @Body() dto: CampaignIdsDto) {
    return this.sender.bulkRemoveCampaigns(tenantId, dto.ids);
  }

  // DISP-003: limit/offset/status/search são opcionais — sem `limit` o retorno é
  // a campanha inteira (comportamento anterior). Agregados nunca paginam.
  @Get('campaigns/:id')
  detail(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Query() q: CampaignDetailQueryDto,
  ) {
    return this.sender.campaignDetail(tenantId, id, {
      limit: q.limit,
      offset: q.offset,
      status: q.status,
      search: q.search,
    });
  }

  @Post('campaigns')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCampaignDto) {
    return this.sender.createCampaign(tenantId, dto);
  }

  // editar campanha em rascunho (nome/mensagem/assunto/link/limite)
  @Patch('campaigns/:id')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.sender.updateCampaign(tenantId, id, dto);
  }

  // Quem receberia a campanha de e-mail "Contatos com e-mail", com busca.
  // Antes o operador só via "disparado para todos os contatos ativos com e-mail" e
  // criava a campanha sem saber para quem. Espelha o where do disparo — ver
  // EmailCampaignSenderService.audienciaWhere.
  @Get('campaigns/audience/email')
  audienceEmail(@CurrentTenant() tenantId: string, @Query() q: AudienceQueryDto) {
    return this.emailCampaign.previewAudienciaEmail(tenantId, {
      search: q.search,
      limit: q.limit,
      offset: q.offset,
    });
  }

  @Post('campaigns/email')
  createEmail(@CurrentTenant() tenantId: string, @Body() dto: CreateEmailCampaignDto) {
    return this.emailCampaign.createEmailCampaign(tenantId, dto);
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
    // Store relative path so the public URL never depends on the tunnel/base URL.
    // The sender service rebuilds the full URL at send time using MEDIA_PUBLIC_BASE.
    return { url: `/uploads/${file.filename}`, name: file.originalname, size: file.size };
  }

  @Post('campaigns/:id/start')
  start(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.setStatus(tenantId, id, 'running');
  }

  @Post('campaigns/:id/pause')
  pause(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.setStatus(tenantId, id, 'paused');
  }

  // DISP-004: cancela de verdade — zera a fila e encerra. Diferente de `pause`,
  // que só suspende: os alvos `queued` continuavam na fila para sempre e um
  // `start` acidental meses depois disparava a lista inteira.
  @Post('campaigns/:id/cancel')
  cancel(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.cancelCampaign(tenantId, id);
  }

  // DISP-002: recoloca na fila os alvos que falharam (só 'failed' — 'skipped' é
  // exclusão deliberada). Vale para WhatsApp e e-mail.
  @Post('campaigns/:id/retry-failed')
  retryFailed(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.retryFailed(tenantId, id);
  }

  // Reenvio TOTAL — inclui quem já recebeu. Ferramenta de teste, atrás de
  // CAMPAIGN_RESEND_ALL_ENABLED (desligado por padrão). Ver SenderService.resendAll:
  // reenviar a mesma mensagem para quem já recebeu queima a reputação do domínio.
  @Post('campaigns/:id/resend-all')
  resendAll(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.resendAll(tenantId, id);
  }

  @Delete('campaigns/:id/targets/:targetId')
  removeTarget(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('targetId') targetId: string,
  ) {
    return this.sender.removeTarget(tenantId, id, targetId);
  }

  @Delete('campaigns/:id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.sender.removeCampaign(tenantId, id);
  }

  @Get('sender/numbers')
  numbers(@CurrentTenant() tenantId: string) {
    return this.sender.listNumbers(tenantId);
  }

  // Reinicia a sessão do WhatsApp (recuperar de "Falha na sessão" / reparear)
  @Post('sender/session/restart')
  restartSession() {
    return this.sender.restartWahaSession();
  }

  // QR de pareamento + status atual da sessão (a tela mostra o QR para escanear)
  @Get('sender/session/qr')
  sessionQr() {
    return this.sender.getWahaQr();
  }

  // janela de envio (horários) por tenant — exibida/editada na tela de Disparo
  @Get('sender/settings')
  getSettings(@CurrentTenant() tenantId: string) {
    return this.sender.getSettings(tenantId);
  }

  @Put('sender/settings')
  updateSettings(@CurrentTenant() tenantId: string, @Body() dto: SenderSettingsDto) {
    return this.sender.updateSettings(tenantId, dto);
  }
}
