import { Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { NotificationsService } from '@/application/notifications/notifications.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.notifications.list(tenantId ?? 'default');
  }

  @Post('read-all')
  readAll(@CurrentTenant() tenantId: string) {
    return this.notifications.markAllRead(tenantId ?? 'default');
  }

  @Patch(':id/read')
  read(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.notifications.markRead(tenantId ?? 'default', id);
  }
}
