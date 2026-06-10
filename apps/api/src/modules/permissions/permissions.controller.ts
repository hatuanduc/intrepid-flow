import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('management')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private perms: PermissionsService) {}

  @Get('permissions')
  async getPermissions() {
    const items = await this.perms.listPermissions();
    return { items };
  }
}
