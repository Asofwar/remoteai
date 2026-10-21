import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_CHAT_POLICY, MIB, setChatPolicy } from '../../../../../shared/remote-chat/policy';
import { setInterfaceLanguage } from '../../../../../shared/i18n/interfaceLanguage';
import { translateText } from '../../../../../shared/i18n/translate';
import { checkVideoSize, VideoPlaybackError, videoRangeStream } from './videoRangeStream';
import { videoErrorMessage } from './useVideoStream';

vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: vi.fn() } }));
vi.mock('react-native-tcp-socket', () => ({ default: { createServer: vi.fn() } }));

const GENERIC = '视频暂时无法播放，请检查电脑连接后重试。';
const info = { id: '12345678-1234-4234-a234-123456789012', size: 3, mimeType: 'video/mp4' as const };
const thrown = (action: () => unknown) => {
  try { action(); } catch (error) { return error; }
  throw new Error('Expected the action to throw.');
};
afterEach(() => { setInterfaceLanguage('zh'); setChatPolicy(DEFAULT_CHAT_POLICY); });

it.each(['en', 'ru'] as const)('shows localized playback limits and interruptions in %s', async (language) => {
  setInterfaceLanguage(language);
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, videoPreviewMaxMb: 1 });
  const limit = thrown(() => checkVideoSize(MIB + 1));
  expect(limit).toBeInstanceOf(VideoPlaybackError);
  expect(videoErrorMessage(limit)).toBe(translateText(language, '视频超过 {value1} MB，无法播放。', { value1: 1 }));
  expect(videoErrorMessage(limit)).not.toBe(translateText(language, GENERIC));
  const stream = videoRangeStream({ info, read: async () => ({ offset: 1, data: 'AAAA' }) },
    { start: 0, end: 2, partial: true }, new AbortController().signal);
  const interrupted = await stream.next().catch((error: unknown) => error);
  expect(interrupted).toBeInstanceOf(VideoPlaybackError);
  expect(videoErrorMessage(interrupted)).toBe(translateText(language, '视频加载中断，请重试。'));
});

it('keeps host video errors for display-time translation and hides unrelated failures', () => {
  setInterfaceLanguage('en');
  const host = '视频暂时无法读取，请确认文件可访问，且格式为 MP4、MOV 或 WebM。';
  expect(videoErrorMessage(new Error(host))).toBe(host);
  expect(videoErrorMessage(new Error('Video connection closed'))).toBe(translateText('en', GENERIC));
  expect(videoErrorMessage('视频')).toBe(translateText('en', GENERIC));
});

it('keeps the Chinese playback messages byte-identical', () => {
  setChatPolicy({ ...DEFAULT_CHAT_POLICY, videoPreviewMaxMb: 1 });
  expect(videoErrorMessage(thrown(() => checkVideoSize(MIB + 1)))).toBe('视频超过 1 MB，无法播放。');
  expect(videoErrorMessage(new Error('Video connection closed'))).toBe(GENERIC);
});
