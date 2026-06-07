import { Controller, Get, UseGuards } from '@nestjs/common';
import { FollowUpService } from '@/application/followup/followup.service';
import { JwtAuthGuard } from '@/shared/auth/jwt-auth.guard';
import { CurrentTenant } from '@/shared/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('followups')
export class FollowUpController {
  constructor(private readonly followup: FollowUpService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.followup.list(tenantId ?? 'default');
  }
}
