import { beforeEach, expect, it, vi } from 'vitest';
import { translateText } from '../../../../shared/i18n/translate';

const native = vi.hoisted(() => ({ start: vi.fn(async () => true), stop: vi.fn(async () => undefined),
  setPortMappingEnabled: vi.fn(async (_enabled: boolean) => true), setLabels: vi.fn() }));
const platform = vi.hoisted(() => ({ OS: 'android', module: {} as Record<string, unknown> }));
vi.mock('react-native', () => ({ Platform: platform, NativeModules: { get ChatBackground() { return platform.module; } },
  AppRegistry: { registerHeadlessTask: vi.fn() }, DeviceEventEmitter: { addListener: vi.fn() } }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); platform.OS = 'android'; platform.module = native; });

const sources = { channel: '聊天连接', channelDescription: '在后台接收电脑上的聊天回复',
  chatTitle: 'Remote AI 聊天', chatText: '后台接收电脑回复，点击返回应用',
  mappingTitle: 'Remote AI 端口映射', mappingText: '端口映射正在运行，点击返回应用' };
const translated = (language: 'en' | 'ru') =>
  Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, translateText(language, source)]));
// Import after resetModules so the test and the module share one language store.
const load = async () => {
  const language = await import('../../../../shared/i18n/interfaceLanguage');
  language.setInterfaceLanguage('zh');
  return { ...await import('./backgroundConnection'), setInterfaceLanguage: language.setInterfaceLanguage };
};

it('gives the Android notification its copy in the interface language and after each change', async () => {
  const { setInterfaceLanguage } = await load();
  expect(native.setLabels).toHaveBeenLastCalledWith(sources);
  for (const language of ['ru', 'en'] as const) {
    setInterfaceLanguage(language);
    const labels = native.setLabels.mock.lastCall?.[0] as Record<string, string>;
    expect(labels).toEqual(translated(language));
    expect(Object.values(labels).join('')).not.toMatch(/[㐀-鿿]/);
  }
  setInterfaceLanguage('zh');
});

it('sends no labels on iOS', async () => {
  platform.OS = 'ios';
  const { setInterfaceLanguage } = await load();
  setInterfaceLanguage('ru');
  expect(native.setLabels).not.toHaveBeenCalled();
  setInterfaceLanguage('zh');
});

it('keeps background chat working with native builds that predate notification labels', async () => {
  const { setLabels: _omitted, ...legacy } = native;
  platform.module = legacy;
  const { keepChatConnected, setInterfaceLanguage } = await load();
  setInterfaceLanguage('ru');
  await keepChatConnected(true);
  expect(native.start).toHaveBeenCalledTimes(1);
  setInterfaceLanguage('zh');
});
