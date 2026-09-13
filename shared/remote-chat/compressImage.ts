import { getChatPolicy, KIB, type ChatPolicy } from './policy';

const QUALITIES = [0.8, 0.65, 0.5];
const MIN_EDGE = 128;
export class ImagePolicyError extends Error {}

/** Reduce quality, then dimensions, until the encoded file satisfies the configured byte target. */
export async function compressChatImage<T>(
  encode: (edge: number, quality: number) => Promise<{ value: T; bytes: number }>,
  policy: ChatPolicy = getChatPolicy(),
): Promise<T> {
  let edge = policy.imageMaxEdge;
  while (edge >= MIN_EDGE) {
    for (const quality of QUALITIES) {
      const result = await encode(edge, quality);
      if (result.bytes <= policy.imageTargetKb * KIB) return result.value;
    }
    edge = Math.floor(edge / 2);
  }
  throw new ImagePolicyError(`图片无法压缩至 ${policy.imageTargetKb} KB，请换一张图片。`);
}
