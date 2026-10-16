import { guiText } from '../../i18n/guiText';

const IMAGE_INPUT_ERRORS = new Set([
  '图片无法读取，请重新选择后发送。',
  '图片过大，请缩小图片或减少图片后发送。',
]);

export function queueSendError(error: unknown, dispatched: boolean): string {
  const message = error instanceof Error ? error.message : error;
  // Only known pre-send validation failures have a definite outcome and safe display text.
  if (typeof message === 'string' && IMAGE_INPUT_ERRORS.has(message)) return guiText(message);
  return dispatched ? guiText('发送结果尚未确认，请查看聊天后重试。') : guiText('发送失败，请重试。');
}
