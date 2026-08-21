import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength, MinLength } from 'class-validator';
import { Trim, NOME_MAX } from '@/shared/dto/trim.decorator';
import { Type } from 'class-transformer';
import { MessageTemplatesService } from '@/application/markets/message-templates.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

// REGRA 2: campo não declarado aqui é derrubado com 400 pelo forbidNonWhitelisted global.
// `@Trim()` antes do `@MinLength`: sem ele um nome de cinco espacos passava e
// virava template sem nome na lista — mesmo furo ja fechado em vendedor,
// parceiro, base de conhecimento e usuario. Mensagens em portugues porque o
// front joga `message` direto no toast.
class CreateTemplateDto {
  @IsString() @MinLength(1) productCode!: string;
  @Trim()
  @IsString({ message: 'Informe o nome do template.' })
  @MinLength(2, { message: 'O nome precisa de pelo menos 2 caracteres.' })
  @MaxLength(NOME_MAX, { message: `O nome pode ter no máximo ${NOME_MAX} caracteres.` })
  name!: string;
  @IsIn(['email', 'whatsapp']) channel!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) step?: number;
}

class UpdateTemplateDto {
  @IsOptional()
  @Trim()
  @IsString({ message: 'Informe o nome do template.' })
  @MinLength(2, { message: 'O nome precisa de pelo menos 2 caracteres.' })
  @MaxLength(NOME_MAX, { message: `O nome pode ter no máximo ${NOME_MAX} caracteres.` })
  name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() @MinLength(1) body?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) step?: number;
}

class PreviewDto {
  @IsOptional() @IsString() productCode?: string;
  @IsIn(['email', 'whatsapp']) channel!: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
  @IsOptional() @IsString() nomeTeste?: string;
}

class SendTestDto {
  @IsEmail() to!: string;
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() @MinLength(1) body!: string;
}

class RascunharDto {
  @IsString() @MinLength(1) productCode!: string;
  @IsIn(['email', 'whatsapp']) channel!: string;
  /// Teto de 6: acima disso a cadência vira insistência, e o custo por clique sobe
  /// sem a lista responder mais.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) quantos?: number;
}

/**
 * A permissão vive por ROTA, não na classe (21/08/2026).
 *
 * Era `@RequirePerm('campaigns')` na classe inteira, e isso barrava o SDR com 403 na
 * própria leitura: ele precisa dos modelos aprovados para responder um lead na mesa
 * dele, e não tem — nem deve ter — o poder de montar campanha.
 *
 * Só o `GET` abriu. Escrever, aprovar e excluir continuam onde estavam: quem lê a
 * biblioteca não ganha o direito de mexer nela.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('message-templates')
export class MessageTemplatesController {
  constructor(private readonly templates: MessageTemplatesService) {}

  /// `?approved=true` é o que o seletor do Disparo consome — rascunho não pode
  /// ser oferecido a quem monta campanha. A tela de Mensagens lista tudo.
  ///
  /// `sdr` entra aqui porque o cockpit dele oferece o modelo aprovado ao responder
  /// o lead. `RequirePerm` é OU: basta uma das duas.
  @Get()
  @RequirePerm('campaigns', 'sdr')
  list(
    @CurrentTenant() tenantId: string,
    @Query('productCode') productCode?: string,
    @Query('channel') channel?: string,
    @Query('approved') approved?: string,
  ) {
    return this.templates.list(tenantId, productCode, channel, approved === 'true');
  }

  /**
   * Pré-visualização. É POST e não GET porque o corpo da mensagem vai no body —
   * texto de campanha inteiro numa query string estoura o limite e ainda vaza a copy
   * para o log de acesso do servidor.
   */
  @Post('preview')
  @RequirePerm('campaigns', 'sdr')
  preview(@CurrentTenant() tenantId: string, @Body() dto: PreviewDto) {
    return this.templates.preview(tenantId, dto);
  }

  @Post('send-test')
  @RequirePerm('campaigns')
  sendTest(@CurrentTenant() tenantId: string, @Body() dto: SendTestDto) {
    return this.templates.sendTest(tenantId, dto.to, dto);
  }

  /**
   * Rascunha modelos a partir do roteiro APROVADO do mercado.
   *
   * `POST` e não `GET` porque a chamada custa tokens e não é idempotente — cada
   * clique gera um texto novo. Nada é gravado: a resposta é proposta, e quem salva
   * continua sendo quem lê.
   */
  /// Só `campaigns`: rascunhar gasta tokens e monta a cadência de uma campanha, que
  /// não é trabalho da mesa do SDR. Ele LÊ o que já foi aprovado.
  @Post('rascunhar')
  @RequirePerm('campaigns')
  rascunhar(@CurrentTenant() tenantId: string, @Body() dto: RascunharDto) {
    return this.templates.rascunhar(
      tenantId,
      dto.productCode,
      dto.channel as 'email' | 'whatsapp',
      dto.quantos ?? 4,
    );
  }

  @Post()
  @RequirePerm('campaigns')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateTemplateDto) {
    return this.templates.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePerm('campaigns')
  update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(tenantId, id, dto);
  }

  /// Aprovar fica atrás de `settings`, como o material de campanha: quem escreve
  /// (`campaigns`) não carimba o próprio texto.
  @Post(':id/approve')
  @RequirePerm('settings')
  approve(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.templates.approve(tenantId, id);
  }

  @Post(':id/unapprove')
  @RequirePerm('settings')
  unapprove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.templates.unapprove(tenantId, id);
  }

  /**
   * Exclui TODOS os modelos de um mercado.
   *
   * Declarada ANTES de `:id` de propósito: sem isso o Nest casaria `/todos` com o
   * parâmetro `:id` e a rota nunca seria alcançada.
   *
   * Atrás de `settings` como as outras destrutivas, e com `productCode`
   * obrigatório — o service recusa sem ele.
   */
  @Delete('todos')
  @RequirePerm('settings')
  removeAll(@CurrentTenant() tenantId: string, @Query('productCode') productCode: string) {
    return this.templates.removeAll(tenantId, productCode);
  }

  // Arquiva, não apaga — a campanha antiga continua apontando para o texto que a gerou.
  @Delete(':id')
  @RequirePerm('campaigns')
  archive(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.templates.archive(tenantId, id);
  }

  /// Exclusão definitiva de um modelo. Separada de `archive` na ROTA, e não num
  /// parâmetro do mesmo DELETE: apagar de vez não pode depender de uma flag que
  /// alguém esquece de mandar.
  @Delete(':id/permanente')
  @RequirePerm('settings')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.templates.remove(tenantId, id);
  }
}
