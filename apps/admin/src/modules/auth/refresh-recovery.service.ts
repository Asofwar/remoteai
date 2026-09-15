import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@/modules/redis/redis.constants';

export const REFRESH_RECOVERY_SECONDS = 120;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** Keeps one replacement available for bounded retries after a lost refresh response. */
@Injectable()
export class RefreshRecoveryService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async remember(previous: string, replacement: string): Promise<void> {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(previous), nonce);
    const encrypted = Buffer.concat([cipher.update(replacement, 'utf8'), cipher.final()]);
    const value = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
    try {
      await this.redis.set(this.cacheKey(previous), value, 'EX', REFRESH_RECOVERY_SECONDS);
    } catch {
      // The caller must roll back rotation if recovery cannot be saved.
      throw new ServiceUnavailableException('Sign-in renewal is temporarily unavailable. Please retry.');
    }
  }

  async recall(previous: string): Promise<string | null> {
    try {
      const value = await this.redis.get(this.cacheKey(previous));
      if (!value) return null;
      const bytes = Buffer.from(value, 'base64');
      const decipher = createDecipheriv(
        'aes-256-gcm', this.encryptionKey(previous), bytes.subarray(0, NONCE_BYTES),
      );
      decipher.setAuthTag(bytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
      return Buffer.concat([
        decipher.update(bytes.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException('Sign-in renewal is temporarily unavailable. Please retry.');
    }
  }

  private cacheKey(token: string): string {
    return `auth:refresh-recovery:${createHash('sha256').update(token).digest('hex')}`;
  }

  private encryptionKey(token: string): Buffer {
    // Redis contains neither plaintext credentials nor the key needed to decrypt them.
    return createHash('sha256').update('codex-switch:refresh-recovery\0').update(token).digest();
  }
}
