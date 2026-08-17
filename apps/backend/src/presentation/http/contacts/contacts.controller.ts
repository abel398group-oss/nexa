import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { ContactsService } from '@/application/contacts/contacts.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant, CurrentUser } from '@/shared/decorators/current-user.decorator';
import { escopoDeVendedor } from '@/shared/auth/seller-scope';
import { CreateContactDto, UpdateContactDto } from '@/application/contacts/dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query.dto';

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
// Transferência de carteira: `sellerId: null` devolve para o bolo sem dono.
class TransferirDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsOptional() @IsString() sellerId?: string | null;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  /**
   * `owner` é o filtro da TELA (o admin escolhendo ver só os do Mateus, ou os
   * sem dono). O escopo do vendedor é derivado do token e aplicado por dentro —
   * mandar `?owner=` de outro vendedor não escapa da própria carteira.
   */
  /**
   * Os filtros vêm todos do MESMO DTO, e não de `@Query('x')` soltos: com
   * `forbidNonWhitelisted`, quem manda a resposta é a classe que valida o objeto
   * de query inteiro. Declarar o parâmetro no controller sem declarar o campo no
   * DTO devolve 400 — foi o que aconteceu com `tag`, `owner` e `status`.
   */
  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Query() q: ListContactsQueryDto,
  ) {
    return this.contacts.findAll(tenantId, q, q.tag, escopoDeVendedor(user), q.owner, q.base, q.status);
  }

  /**
   * Passa contatos (e as conversas deles) para outro vendedor.
   *
   * Só admin: é a ferramenta de quem redistribui carteira, e um vendedor podendo
   * transferir para si mesmo tornaria a separação decorativa.
   */
  @Post('transfer')
  transferir(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: TransferirDto,
  ) {
    if (user?.role !== 'admin') {
      throw new ForbiddenException('Só o administrador transfere carteira.');
    }
    return this.contacts.transferir(tenantId, body.ids ?? [], body.sellerId ?? null);
  }

  // distintas tags do tenant (definir ANTES de :id para não casar como id)
  @Get('tags')
  listTags(@CurrentTenant() tenantId: string) {
    return this.contacts.listTags(tenantId);
  }

  // adiciona/remove uma tag em vários contatos
  @Post('bulk-tag')
  bulkTag(@CurrentTenant() tenantId: string, @Body() body: BulkTagDto) {
    return this.contacts.bulkTag(tenantId, body.ids ?? [], body.tag ?? '', body.mode ?? 'add');
  }

  // renomeia uma tag em todos os contatos
  @Patch('tags/rename')
  renameTag(@CurrentTenant() tenantId: string, @Body() body: RenameTagDto) {
    return this.contacts.renameTag(tenantId, body.from, body.to);
  }

  // exclui uma tag de todos os contatos
  @Post('tags/delete')
  deleteTag(@CurrentTenant() tenantId: string, @Body() body: DeleteTagDto) {
    return this.contacts.deleteTag(tenantId, body.tag);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.findOne(tenantId, id);
  }

  // LGPD — portabilidade: exporta os dados do contato como CSV.
  // Definir ANTES de rotas mais específicas de :id para evitar conflito.
  @Get(':id/export')
  async export(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const csv = await this.contacts.exportCsv(tenantId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contato-${id}.csv"`);
    res.send(csv);
  }

  // histórico de campanhas que o contato recebeu
  @Get(':id/campaigns')
  campaigns(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.campaignsForContact(tenantId, id);
  }

  // F16: histórico de chamados (suporte/vendas) — painel do Inbox
  @Get(':id/tickets')
  tickets(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.ticketsForContact(tenantId, id);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateContactDto) {
    return this.contacts.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contacts.update(tenantId, id, dto);
  }

  @Post('import')
  import(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: { contacts: CreateContactDto[]; ownerSellerId?: string | null },
  ) {
    // Vendedor importando fica com a própria lista, escolha ou não: deixar o
    // campo livre para ele permitiria empurrar contato para a carteira alheia.
    // `__none__` (vendedor sem vínculo) não é dono de nada — entra sem dono.
    const escopo = escopoDeVendedor(user);
    const dono = escopo && escopo !== '__none__' ? escopo : escopo ? null : body.ownerSellerId ?? null;
    return this.contacts.importMany(tenantId, body.contacts ?? [], dono);
  }

  // exclusão em lote (vários contatos numa única requisição)
  @Post('bulk-delete')
  bulkDelete(@CurrentTenant() tenantId: string, @Body() body: BulkDeleteDto) {
    // DEBUG temporário: quantos ids chegaram do front
    console.warn('[bulk-delete] ids recebidos:', body?.ids?.length ?? 0, body?.ids);
    return this.contacts.deleteMany(tenantId, body.ids ?? []);
  }

  // Blocklist (concorrentes): bloqueio/desbloqueio em lote — nunca recebem campanha
  @Post('bulk-block')
  bulkBlock(@CurrentTenant() tenantId: string, @Body() body: BulkDeleteDto) {
    return this.contacts.block(tenantId, body.ids ?? []);
  }

  @Post('bulk-unblock')
  bulkUnblock(@CurrentTenant() tenantId: string, @Body() body: BulkDeleteDto) {
    return this.contacts.unblock(tenantId, body.ids ?? []);
  }

  @Patch(':id/reactivate')
  reactivate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.reactivate(tenantId, id);
  }

  // marca como descadastrado (opt-out) — não recebe mais disparos
  @Patch(':id/opt-out')
  optOut(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.optOut(tenantId, id);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.remove(tenantId, id);
  }
}
