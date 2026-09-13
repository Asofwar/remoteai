import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '@/common/decorators/user.decorator';
import { AdminAuditLogEntity } from '@/modules/admin/entities/admin-audit-log.entity';
import { ChatSettingsEntity } from './chat-settings.entity';
import { DEFAULT_CHAT_POLICY, parseChatPolicy } from './chat-policy';

const SETTINGS_ID = 'current';
@Injectable()
export class ChatSettingsService {
  constructor(@InjectRepository(ChatSettingsEntity) private readonly settings: Repository<ChatSettingsEntity>) {}

  async read() {
    const row = await this.settings.findOneBy({ id: SETTINGS_ID });
    return row ? parseChatPolicy(row.policy) : { ...DEFAULT_CHAT_POLICY };
  }

  async update(actor: AuthUser, value: unknown) {
    let policy;
    try { policy = parseChatPolicy(value); }
    catch { throw new BadRequestException('请在允许范围内填写完整的聊天设置。'); }
    await this.settings.manager.transaction(async (manager) => {
      await manager.save(ChatSettingsEntity, { id: SETTINGS_ID, policy });
      await manager.save(AdminAuditLogEntity, { actorId: actor.id, actorEmail: actor.email,
        action: 'chat-settings.update', targetType: 'chat-settings', targetId: SETTINGS_ID, metadata: policy });
    });
    return policy;
  }
}
