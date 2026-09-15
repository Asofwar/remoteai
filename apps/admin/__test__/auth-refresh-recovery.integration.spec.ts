import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntitySchema } from 'typeorm';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@/modules/auth/auth.service';
import { RefreshRecoveryService } from '@/modules/auth/refresh-recovery.service';
import { RefreshTokenEntity } from '@/modules/auth/entities/refresh-token.entity';
import { UserEntity } from '@/modules/user/entities/user.entity';
import type { UserService } from '@/modules/user/user.service';
import type { AdminService } from '@/modules/admin/admin.service';
import type { RbacService } from '@/modules/rbac/rbac.service';
import type { EmailVerificationService } from '@/modules/auth/email-verification.service';
import { makeUser } from './fixtures';

// Opt in with disposable local PostgreSQL/Redis URLs; this suite creates and clears its own schema.
const postgresUrl = process.env.AUTH_TEST_POSTGRES_URL;
const redisUrl = process.env.AUTH_TEST_REDIS_URL;
describe.skipIf(!postgresUrl || !redisUrl)('refresh recovery with PostgreSQL and Redis', () => {
  let database: DataSource;
  let redis: Redis;
  let service: AuthService;
  let recovery: RefreshRecoveryService;
  let original: Awaited<ReturnType<AuthService['login']>>;
  const user = makeUser({ id: randomUUID() });

  beforeAll(async () => {
    for (const value of [postgresUrl, redisUrl]) {
      if (!value || new URL(value).hostname !== '127.0.0.1') throw new Error('Use disposable loopback databases');
    }
    database = new DataSource({
      type: 'postgres', url: postgresUrl, schema: 'auth_recovery_test', synchronize: false,
      entities: [
        new EntitySchema<UserEntity>({ name: 'UserEntity', target: UserEntity, tableName: 'users', columns: {
          id: { type: 'uuid', primary: true }, email: { type: String },
          role: { type: String }, disabled: { type: Boolean },
        } }),
        new EntitySchema<RefreshTokenEntity>({
          name: 'RefreshTokenEntity', target: RefreshTokenEntity, tableName: 'refresh_tokens', columns: {
            id: { type: 'uuid', primary: true }, userId: { type: 'uuid' }, tokenHash: { type: String },
            expiresAt: { type: 'timestamptz' }, revokedAt: { type: 'timestamptz', nullable: true },
            createdAt: { type: 'timestamptz', createDate: true },
          },
        }),
      ],
    });
    await database.initialize();
    await database.query('CREATE SCHEMA IF NOT EXISTS auth_recovery_test');
    await database.synchronize();
    redis = new Redis(redisUrl!);
    recovery = new RefreshRecoveryService(redis);
    service = new AuthService(
      { findByEmailWithPassword: async () => user, validatePassword: async () => true,
        markLogin: async () => undefined, findActiveByEmail: async () => user,
        setPassword: async () => undefined } as unknown as UserService,
      {} as AdminService, new JwtService(), database.getRepository(RefreshTokenEntity), database,
      { verifyPasswordResetCode: async () => undefined } as unknown as EmailVerificationService,
      { accessForRole: async () => ({ roleName: 'User', permissions: [] }) } as unknown as RbacService,
      { JWT_REFRESH_SECRET: 'integration-refresh-secret', KONG_JWT_SECRET: 'integration-access-secret' }, recovery,
    );
  });

  beforeEach(async () => {
    await database.getRepository(RefreshTokenEntity).clear();
    await database.getRepository(UserEntity).save(user);
    original = await service.login(user.email, 'test-password');
  });
  afterAll(async () => {
    if (redis) await redis.quit();
    if (database?.isInitialized) await database.destroy();
  });

  it('serializes simultaneous refreshes into one replacement and permits response-loss recovery', async () => {
    const replies = await Promise.all(Array.from({ length: 8 }, () => service.refresh(original.refreshToken)));
    expect(new Set(replies.map((reply) => reply.refreshToken)).size).toBe(1);
    expect(await database.getRepository(RefreshTokenEntity).count()).toBe(2);
    const retried = await service.refresh(original.refreshToken);
    expect(retried.refreshToken).toBe(replies[0].refreshToken);
  });

  it('rolls back database rotation when recovery cannot be saved', async () => {
    vi.spyOn(recovery, 'remember').mockRejectedValueOnce(new Error('cache unavailable'));
    await expect(service.refresh(original.refreshToken)).rejects.toThrow('cache unavailable');
    const records = await database.getRepository(RefreshTokenEntity).find();
    expect(records).toHaveLength(1);
    expect(records[0].revokedAt).toBeNull();
    await expect(service.refresh(original.refreshToken)).resolves.toHaveProperty('refreshToken');
  });

  it('signing out with the old token revokes both sides of the rotation', async () => {
    const replacement = await service.refresh(original.refreshToken);
    await service.logout(original.refreshToken);
    await expect(service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
    await expect(service.refresh(replacement.refreshToken)).rejects.toThrow('Refresh token expired');
  });

  it('password reset revokes the successor and blocks cached recovery', async () => {
    const replacement = await service.refresh(original.refreshToken);
    await service.resetPassword(user.email, 'test-code', 'new-password');
    await expect(service.refresh(original.refreshToken)).rejects.toThrow('Refresh token expired');
    await expect(service.refresh(replacement.refreshToken)).rejects.toThrow('Refresh token expired');
  });
});
