import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshRecoveryService, REFRESH_RECOVERY_SECONDS } from '@/modules/auth/refresh-recovery.service';

describe('encrypted refresh recovery', () => {
  const redis = { get: vi.fn(), set: vi.fn() };
  const service = new RefreshRecoveryService(redis as unknown as Redis);

  beforeEach(() => { redis.set.mockResolvedValue('OK'); });

  it('stores no plaintext credentials and recovers using the original token', async () => {
    await service.remember('old-secret', 'replacement-secret');
    const [key, value, expiryMode, ttl] = redis.set.mock.calls[0];
    expect(key).not.toContain('old-secret');
    expect(value).not.toContain('replacement-secret');
    expect(Buffer.from(value, 'base64').includes(Buffer.from('replacement-secret'))).toBe(false);
    expect([expiryMode, ttl]).toEqual(['EX', REFRESH_RECOVERY_SECONDS]);
    redis.get.mockResolvedValue(value);
    await expect(service.recall('old-secret')).resolves.toBe('replacement-secret');
    await expect(service.recall('different-secret')).rejects.toThrow('temporarily unavailable');
  });

  it('does not recreate missing or expired recovery entries', async () => {
    redis.get.mockResolvedValue(null);
    await expect(service.recall('old-secret')).resolves.toBeNull();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('fails safely on cache errors and tampering without exposing credentials', async () => {
    redis.set.mockRejectedValue(new Error('private connection details'));
    await expect(service.remember('secret', 'replacement')).rejects.toThrow('temporarily unavailable');
    redis.get.mockRejectedValueOnce(new Error('private connection details'));
    await expect(service.recall('secret')).rejects.toThrow('temporarily unavailable');
    redis.get.mockResolvedValueOnce('corrupt-data');
    await expect(service.recall('secret')).rejects.toThrow('temporarily unavailable');
  });
});
