import { ChatImageError, draftImage, MAX_CHAT_IMAGES,
  validateChatImages, type DraftImage } from '../../../../shared/remote-chat/attachments';

import { base64Bytes, getChatPolicy, MIB } from '../../../../shared/remote-chat/policy';
import { compressChatImage, ImagePolicyError } from '../../../../shared/remote-chat/compressImage';

async function prepareImage(file: File) {
  if ((file.type && !file.type.startsWith('image/')) || !file.size) {
    throw new ChatImageError('请选择有效的图片。');
  }
  const policy = getChatPolicy();
  if (file.size > policy.imageSourceMaxMb * MIB) {
    throw new ChatImageError(`单张图片不能超过 ${policy.imageSourceMaxMb} MB，请选择较小的图片。`);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await compressChatImage(async (edge, quality) => {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new ChatImageError('当前浏览器无法读取图片，请换个浏览器重试。');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', quality);
      return { value: draftImage(url), bytes: base64Bytes(url) };
    }, policy);
  } catch (error) {
    if (error instanceof ChatImageError || error instanceof ImagePolicyError) throw new ChatImageError(error.message);
    throw new ChatImageError('这张图片暂时无法读取，请换一张 JPG 或 PNG 图片。');
  } finally { URL.revokeObjectURL(url); }
}

export async function pickChatImages(files: File[], remaining: number): Promise<DraftImage[]> {
  if (files.length > remaining) throw new ChatImageError(`一次最多添加 ${MAX_CHAT_IMAGES} 张图片。`);
  const images: DraftImage[] = [];
  for (const file of files) {
    images.push(await prepareImage(file));
    validateChatImages(images.map((image) => image.url));
  }
  return images;
}
