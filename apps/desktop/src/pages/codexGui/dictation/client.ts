import { invoke } from '../../../api/backend';
import { audioBase64 } from './recording';

export const dictationClient = {
  prepare: () => invoke<{ sessionId: string }>('codex_gui_dictation_prepare'),
  cancel: (sessionId: string) => invoke<void>('codex_gui_dictation_cancel', { sessionId }),
  transcribe: async (sessionId: string, audio: Blob) => invoke<{ text: string }>(
    'codex_gui_dictation_transcribe',
    { request: { sessionId, data: await audioBase64(audio), mimeType: audio.type } },
  ),
};

export function recordingError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '请允许使用麦克风，再重新录音。';
    if (error.name === 'NotFoundError') return '未找到麦克风，请连接后重试。';
    if (error.name === 'NotReadableError') return '麦克风暂时不可用，请关闭占用它的应用后重试。';
  }
  return error instanceof Error ? error.message : typeof error === 'string' ? error : '转写失败，请重试。';
}
