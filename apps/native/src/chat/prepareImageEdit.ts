import { Image } from 'react-native';
import { EncodingType, getInfoAsync, readAsStringAsync } from 'expo-file-system';
import { chatImageCharLimit, validateChatImages } from '../../../../shared/remote-chat/attachments';
import { getChatPolicy, MIB } from '../../../../shared/remote-chat/policy';
import { preparePhoto } from './chatPhotos';

export async function prepareImageEdit(source: string) {
  if (source.startsWith('data:')) {
    try { validateChatImages([source]); return source; }
    catch { /* Reuse photo compression for originals beyond the send limit. */ }
  }
  if (source.startsWith('file://')) {
    const info = await getInfoAsync(source);
    if (!info.exists || info.isDirectory || info.size > getChatPolicy().imageSourceMaxMb * MIB) {
      throw new Error('Image unavailable or too large');
    }
    if (info.size * 4 / 3 < chatImageCharLimit() - 64) return readInlineImage(source);
  }
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    Image.getSize(source, (width, height) => resolve({ width, height }), reject);
  });
  const photo = await preparePhoto({ uri: source, ...size, fileSize: 0 });
  return photo.dataUrl;
}

async function readInlineImage(source: string) {
  const data = await readAsStringAsync(source, { encoding: EncodingType.Base64 });
  const signatures = [['iVBOR', 'png'], ['/9j/', 'jpeg'], ['R0lG', 'gif'], ['UklGR', 'webp']];
  const mime = signatures.find(([prefix]) => data.startsWith(prefix))?.[1];
  if (!mime) throw new Error('Unsupported image');
  const inline = `data:image/${mime};base64,${data}`;
  validateChatImages([inline]);
  return inline;
}
