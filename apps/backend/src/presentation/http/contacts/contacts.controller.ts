import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { ContactsService } from '@/application/contacts/contacts.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';
import { CreateContactDto, UpdateContactDto } from '@/application/contacts/dto/create-contact.dto';

// DTOs com validação — necessários porque o ValidationPipe global usa
// whitelist+forbidNonWhitelisted (tipos inline `{ ids }` podiam ser ignorados).
class BulkDeleteDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}
class BulkTagDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsString() tag!: string;
  @IsOptional() @IsIn(['add', 'remove']) mode?: 'add' | 'remove';
}
class RenameTagDto {
  @IsString() from!: string;
  @IsString() to!: string;
}
class DeleteTagDto {
  @IsString() tag!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() q: PaginationQueryDto,
    @Query('tag') tag?: string,
  ) {
    return this.contacts.findAll(tenantId ?? 'default', q, tag);
  }

  // distintas tags do tenant (definir ANTES de :id para não casar como id)
  @Get('tags')
  listTags(@CurrentTenant() tenantId: string) {
    return this.contacts.listTags(tenantId ?? 'default');
  }

  // adiciona/remove uma tag em vários contatos
  @Post('bulk-tag')
  bulkTag(@CurrentTenant() tenantId: string, @Body() body: BulkTagDto) {
    return this.contacts.bulkTag(tenantId ?? 'default', body.ids ?? [], body.tag ?? '', body.mode ?? 'add');
  }

  // renomeia uma tag em todos os contatos
  @Patch('tags/rename')
  renameTag(@CurrentTenant() tenantId: string, @Body() body: RenameTagDto) {
    return this.contacts.renameTag(tenantId ?? 'default', body.from, body.to);
  }

  // exclui uma tag de todos os contatos
  @Post('tags/delete')
  deleteTag(@CurrentTenant() tenantId: string, @Body() body: DeleteTagDto) {
    return this.contacts.deleteTag(tenantId ?? 'default', body.tag);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.findOne(tenantId ?? 'default', id);
  }

  // histórico de campanhas que o contato recebeu
  @Get(':id/campaigns')
  campaigns(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.campaignsForContact(tenantId ?? 'default', id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateContactDto) {
    return this.contacts.create(tenantId ?? 'default', dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contacts.update(tenantId ?? 'default', id, dto);
  }

  @Post('import')
  import(@CurrentTenant() tenantId: string, @Body() body: { contacts: CreateContactDto[] }) {
    return this.contacts.importMany(tenantId ?? 'default', body.contacts ?? []);
  }

  // exclusão em lote (vários contatos numa única requisição)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string, @Body() body: BulkDeleteDto) {
    // DEBUG temporário: quantos ids chegaram do front
    console.warn('[bulk-delete] ids recebidos:', body?.ids?.length ?? 0, body?.ids);
    return this.contacts.deleteMany(tenantId ?? 'default', body.ids ?? []);
  }

  @Patch(':id/reactivate')
  reactivate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.reactivate(tenantId ?? 'default', id);
  }

  // marca como descadastrado (opt-out) — não recebe mais disparos
  @Patch(':id/opt-out')
  optOut(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.optOut(tenantId ?? 'default', id);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.remove(tenantId ?? 'default', id);
  }
}
