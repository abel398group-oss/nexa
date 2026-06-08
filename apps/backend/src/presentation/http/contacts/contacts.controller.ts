import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContactsService } from '@/application/contacts/contacts.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { PermissionsGuard, RequirePerm } from '@/shared/auth/permissions.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '@/shared/dto/pagination.dto';
import { CreateContactDto, UpdateContactDto } from '@/application/contacts/dto/create-contact.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePerm('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string, @Query() q: PaginationQueryDto) {
    return this.contacts.findAll(tenantId ?? 'default', q);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.findOne(tenantId ?? 'default', id);
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

  @Patch(':id/reactivate')
  reactivate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.reactivate(tenantId ?? 'default', id);
  }

  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.contacts.remove(tenantId ?? 'default', id);
  }
}
