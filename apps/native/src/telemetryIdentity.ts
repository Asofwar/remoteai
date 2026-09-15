import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/** App-scoped identifier, stable across Android reinstalls with the same signing key and user. */
export async function mobileDeviceId(fallback?: string): Promise<string> {
  if (Platform.OS !== 'android') return fallback || Crypto.randomUUID();
  const androidId = Application.getAndroidId()?.trim().toLowerCase();
  if (!androidId || !/^[0-9a-f]{1,16}$/.test(androidId) || /^0+$/.test(androidId)) {
    throw new Error('Android device identifier is unavailable');
  }
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `codex-switch:android-device:v1:${androidId}`,
  );
  // Keep the existing UUID v4 wire format so older servers accept the stable, hashed ID too.
  const variant = ((parseInt(digest[16], 16) & 3) | 8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}`
    + `-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
