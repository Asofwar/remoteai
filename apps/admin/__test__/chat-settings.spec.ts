import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { REQUIRED_PERMISSIONS } from '@/common/decorators/permissions.decorator';
import { Permission } from '@/common/rbac/permissions';
import { DEFAULT_CHAT_POLICY, parseChatPolicy } from '@/modules/chat-settings/chat-policy';
import { ChatSettingsController } from '@/modules/chat-settings/chat-settings.controller';
import { ChatSettingsService } from '@/modules/chat-settings/chat-settings.service';
import { ChatSettingsEntity } from '@/modules/chat-settings/chat-settings.entity';
import type { AuthUser } from '@/common/decorators/user.decorator';
import { AdminAuditLogEntity } from '@/modules/admin/entities/admin-audit-log.entity';

describe('chat settings', () => {
  it.each(['relayMaxMbPerSecond', 'relayMaxFramesPerSecond'] as const)(
    'defaults missing relay limits to unlimited and validates configured values: %s', (key) => {
      const previous = { ...DEFAULT_CHAT_POLICY };
      delete (previous as Partial<typeof previous>)[key];
      expect(parseChatPolicy(previous)[key]).toBe(-1);
      for (const value of [-1, 1, 10000]) {
        expect(parseChatPolicy({ ...DEFAULT_CHAT_POLICY, [key]: value })[key]).toBe(value);
      }
      for (const value of [-2, 0, 0.5, Infinity, '-1']) {
        expect(() => parseChatPolicy({ ...DEFAULT_CHAT_POLICY, [key]: value })).toThrow();
      }
    });
  it.each([null, {}, { threadPageSize: '20' }, { historyPageSize: 0 }, { imageTargetKb: 1 },
    { fileDownloadMaxMb: Infinity }, { imageMaxEdge: 300.5 }])('rejects incomplete or invalid limits: %o', (value) => {
    const input = value && Object.keys(value).length ? { ...DEFAULT_CHAT_POLICY, ...value } : value;
    expect(() => parseChatPolicy(input)).toThrow();
  });

  it('defaults only when no configuration has been saved and commits changes with their audit record', async () => {
    let saved: ChatSettingsEntity | null = null;
    const save = vi.fn(async (entity, row) => { if (entity === ChatSettingsEntity) saved = row; });
    const create = (entity: typeof AdminAuditLogEntity, row: Partial<AdminAuditLogEntity>) =>
      Object.assign(new entity(), row);
    const repository = { findOneBy: async () => saved,
      manager: { transaction: async (
        work: (manager: { save: typeof save; create: typeof create }) => Promise<void>,
      ) => work({ save, create }) } };
    const service = new ChatSettingsService(repository as unknown as Repository<ChatSettingsEntity>);
    expect(await service.read()).toEqual(DEFAULT_CHAT_POLICY);
    const policy = { ...DEFAULT_CHAT_POLICY, threadPageSize: 7, imageTargetKb: 128,
      fileUploadMaxMb: 20, fileUploadTotalMaxMb: 50, filePreviewMaxMb: 100, fileDownloadMaxMb: 1000 };
    const actor = { id: 'owner', email: 'owner@example.test' } as AuthUser;
    expect(await service.update(actor, policy)).toEqual(policy);
    expect(await service.read()).toEqual(policy);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toMatchObject({ actorId: actor.id, metadata: policy });
    const auditLog = save.mock.calls[1][1] as AdminAuditLogEntity;
    expect(auditLog.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    await expect(service.update(actor, { ...policy, imageSourceMaxMb: 0 })).rejects.toThrow();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('accepts positive video limits without an upper cap and defaults older saved settings', () => {
    const { videoPreviewMaxMb: _video, ...previous } = DEFAULT_CHAT_POLICY;
    expect(parseChatPolicy(previous).videoPreviewMaxMb).toBe(100);
    for (const limit of [1, 2048, 1000000]) {
      expect(parseChatPolicy({ ...DEFAULT_CHAT_POLICY, videoPreviewMaxMb: limit }).videoPreviewMaxMb).toBe(limit);
    }
    for (const limit of [0, -1, 0.5, Infinity, '100', Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseChatPolicy({ ...DEFAULT_CHAT_POLICY, videoPreviewMaxMb: limit })).toThrow();
    }
  });

  it.each(['imageSourceMaxMb', 'imagePreviewMaxMb', 'imageMaxEdge', 'imageTargetKb'] as const)(
    'accepts large image settings without an upper cap: %s', (key) => {
      for (const value of [1000000, Number.MAX_SAFE_INTEGER]) {
        expect(parseChatPolicy({ ...DEFAULT_CHAT_POLICY, [key]: value })[key]).toBe(value);
      }
    });

  it('requires distinct read and manage permissions', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, ChatSettingsController.prototype.read))
      .toEqual([Permission.ChatSettingsRead]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, ChatSettingsController.prototype.update))
      .toEqual([Permission.ChatSettingsManage]);
  });

  it('keeps older saved policies readable with the original upload limit', () => {
    const { fileUploadMaxMb: _upload, fileUploadTotalMaxMb: _total,
      videoPreviewMaxMb: _video, ...previous } = DEFAULT_CHAT_POLICY;
    expect(parseChatPolicy(previous)).toEqual(DEFAULT_CHAT_POLICY);
    expect(() => parseChatPolicy({ ...previous, fileUploadMaxMb: null })).toThrow();
  });

  it.each(['fileUploadMaxMb', 'fileUploadTotalMaxMb', 'filePreviewMaxMb', 'fileDownloadMaxMb'] as const)(
    'accepts file limits above the old cap while rejecting invalid values: %s', (key) => {
      for (const value of [1, 21, 1000000, Number.MAX_SAFE_INTEGER]) {
        expect(parseChatPolicy({ ...DEFAULT_CHAT_POLICY, [key]: value })[key]).toBe(value);
      }
      for (const value of [0, -1, 0.5, NaN, Infinity, '100', Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => parseChatPolicy({ ...DEFAULT_CHAT_POLICY, [key]: value })).toThrow();
      }
    });
});
