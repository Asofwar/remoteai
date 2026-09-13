import { Body, Controller, Get, Header, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '@/common/decorators/user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { Permission } from '@/common/rbac/permissions';
import { JwtAuthGuard } from '@/modules/jwt/jwt-auth.guard';
import { ChatSettingsService } from './chat-settings.service';

@Controller('admin/api/chat-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatSettingsController {
  constructor(private readonly settings: ChatSettingsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(Permission.ChatSettingsRead)
  read() { return this.settings.read(); }

  @Patch()
  @RequirePermissions(Permission.ChatSettingsManage)
  update(@CurrentUser() actor: AuthUser, @Body() body: Record<string, unknown>) {
    return this.settings.update(actor, body);
  }
}
