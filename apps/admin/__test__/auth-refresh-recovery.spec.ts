import { createHash, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import type { DataSource, Repository } from 'typeorm';
import type Redis from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@/modules/auth/auth.service';
import { RefreshRecoveryService, REFRESH_RECOVERY_SECONDS } from '@/modules/auth/refresh-recovery.service';
import type { RefreshTokenEntity } from '@/modules/auth/entities/refresh-token.entity';
import type { UserService } from '@/modules/user/user.service';
import type { AdminService } from '@/modules/admin/admin.service';
import type { RbacService } from '@/modules/rbac/rbac.service';
import type { EmailVerificationService } from '@/modules/auth/email-verification.service';
import { makeUser } from './fixtures';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type TokenRecord = Pick<RefreshTokenEntity, 'id' | 'userId' | 'expiresAt' | 'revokedAt' | 'tokenHash'>;

/** Serial transactions with rollback; real JWT signing and encrypted cache exercise the HTTP retry contract. */
function fixture() {
  let records: TokenRecord[] = [];
  const user = makeUser();
  const cache = new Map<string, string>();
  const redis = {
    set: vi.fn(async (key: string, value: string) => { cache.set(key, value); return 'OK'; }),
    get: vi.fn(async (key: string) => cache.get(key) ?? null),
  };
  const matches = (row: TokenRecord, where: Record<string, unknown>) => Object.entries(where)
    .every(([key, value]) => key === 'revokedAt' ? !row.revokedAt : row[key as keyof TokenRecord] === value);
  const repository = {
    create: (value: Partial<TokenRecord>) => ({ id: randomUUID(), revokedAt: null, ...value }),
    save: async (row: TokenRecord) => {
      records = [...records.filter((record) => record.id !== row.id), row];
      return row;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => records.find((row) => matches(row, where)),
    update: async (where: Record<string, unknown>, patch: Partial<TokenRecord>) => {
      records.filter((row) => matches(row, where)).forEach((row) => Object.assign(row, patch));
    },
  };
  const manager = { getRepository: () => repository, findOne: async () => user };
  let pending: Promise<unknown> = Promise.resolve();
  let failCommit = false;
  const dataSource = { transaction: (callback: (value: typeof manager) => Promise<unknown>) => {
    const operation = pending.then(async () => {
      const before = structuredClone(records);
      try {
        const result = await callback(manager);
        if (failCommit) { failCommit = false; throw new Error('commit failed'); }
        return result;
      } catch (error) { records = before; throw error; }
    });
    pending = operation.catch(() => undefined);
    return operation;
  } };
  const service = new AuthService(
    { findByEmailWithPassword: async () => user, validatePassword: async () => true,
      markLogin: async () => undefined } as unknown as UserService,
    {} as AdminService, new JwtService(), repository as unknown as Repository<RefreshTokenEntity>,
    dataSource as unknown as DataSource, {} as EmailVerificationService,
    { accessForRole: async () => ({ roleName: 'User', permissions: [] }) } as unknown as RbacService,
    { JWT_REFRESH_SECRET: 'test-refresh-secret', KONG_JWT_SECRET: 'test-access-secret' },
    new RefreshRecoveryService(redis as unknown as Redis),
  );
  return { service, user, redis, cache, records: () => records,
    failNextCommit: () => { failCommit = true; } };
}

describe('refresh response loss and session revocation', () => {
  let context: ReturnType<typeof fixture>;
  let original: Awaited<ReturnType<AuthService['login']>>;
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'));
    context = fixture();
    original = await context.service.login('test@example.com', 'password');
  });
  afterEach(() => vi.useRealTimers());

  it('recovers a lost successful response without creating another refresh token', async () => {
    const lost = await context.service.refresh(original.refreshToken);
    vi.advanceTimersByTime(20_000);
    const recovered = await context.service.refresh(original.refreshToken);
    expect(recovered.refreshToken).toBe(lost.refreshToken);
    expect(context.records()).toHaveLength(2);
    await expect(context.service.refresh(recovered.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('concurrent refresh requests receive the same replacement', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => context.service.refresh(original.refreshToken)));
    expect(new Set(responses.map((response) => response.refreshToken)).size).toBe(1);
    expect(context.records()).toHaveLength(2);
    expect(context.redis.set).toHaveBeenCalledOnce();
  });

  it('does not extend the grace period when the original request is retried', async () => {
    await context.service.refresh(original.refreshToken);
    vi.advanceTimersByTime((REFRESH_RECOVERY_SECONDS - 1) * 1000);
    await context.service.refresh(original.refreshToken);
    vi.advanceTimersByTime(1000);
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
    expect(context.redis.set).toHaveBeenCalledOnce();
  });

  it.each(['original', 'replacement'] as const)('logout with the %s prevents recovery', async (which) => {
    const replacement = await context.service.refresh(original.refreshToken);
    await context.service.logout(which === 'original' ? original.refreshToken : replacement.refreshToken);
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
    await expect(context.service.refresh(replacement.refreshToken)).rejects.toThrow('Refresh token expired');
  });

  it('does not recover a session after its replacement has rotated again', async () => {
    const replacement = await context.service.refresh(original.refreshToken);
    await context.service.refresh(replacement.refreshToken);
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
  });

  it('rejects disabled users even when their recovery entry is available', async () => {
    await context.service.refresh(original.refreshToken);
    context.user.disabled = true;
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
  });

  it('does not recover expired, revoked or deleted successor records', async () => {
    const replacement = await context.service.refresh(original.refreshToken);
    const successor = context.records().find((record) => record.tokenHash === hash(replacement.refreshToken))!;
    successor.expiresAt = new Date();
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
    successor.expiresAt = new Date(Date.now() + 60_000);
    successor.revokedAt = new Date();
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
    successor.tokenHash = 'deleted';
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
  });

  it('rolls back rotation when Redis is unavailable and allows a later retry', async () => {
    context.redis.set.mockRejectedValueOnce(new Error('cache unavailable'));
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('temporarily unavailable');
    expect(context.records()).toHaveLength(1);
    expect(context.records()[0].revokedAt).toBeNull();
    await expect(context.service.refresh(original.refreshToken)).resolves.toHaveProperty('refreshToken');
  });

  it('never returns an uncommitted replacement left in the recovery cache', async () => {
    context.failNextCommit();
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('commit failed');
    expect(context.cache.size).toBe(1);
    expect(context.records()).toHaveLength(1);
    await context.service.refresh(original.refreshToken);
    expect(context.records()).toHaveLength(2);
  });

  it('does not recover manually revoked tokens without a rotation entry', async () => {
    await context.service.logout(original.refreshToken);
    await expect(context.service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
  });
});
