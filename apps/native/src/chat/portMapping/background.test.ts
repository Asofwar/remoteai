import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ start: vi.fn(async () => true), stop: vi.fn(async () => undefined),
  setPortMappingEnabled: vi.fn(async (_enabled: boolean) => true) }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { ChatBackground: native },
  AppRegistry: { registerHeadlessTask: vi.fn() }, DeviceEventEmitter: { addListener: vi.fn() } }));
vi.mock('../../i18n', () => ({ t: (value: string) => value }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

it('retains the foreground service until the last mapping and chat have released it', async () => {
  const { keepChatConnected, retainPortMappingConnection } = await import('../backgroundConnection');
  await keepChatConnected(true);
  const first = await retainPortMappingConnection(); const second = await retainPortMappingConnection();
  expect(native.setPortMappingEnabled).toHaveBeenCalledTimes(1);
  await keepChatConnected(false); expect(native.stop).not.toHaveBeenCalled();
  await first(); expect(native.stop).not.toHaveBeenCalled();
  await second(); expect(native.setPortMappingEnabled).toHaveBeenLastCalledWith(false);
  expect(native.stop).toHaveBeenCalledTimes(1);
  await second(); expect(native.stop).toHaveBeenCalledTimes(1);
});
it('stopping mappings leaves background chat running', async () => {
  const { keepChatConnected, retainPortMappingConnection } = await import('../backgroundConnection');
  await keepChatConnected(true); const release = await retainPortMappingConnection(); await release();
  expect(native.setPortMappingEnabled).toHaveBeenLastCalledWith(false); expect(native.stop).not.toHaveBeenCalled();
});
it('does not retain a failed lease and allows a later foreground retry', async () => {
  const { retainPortMappingConnection } = await import('../backgroundConnection');
  native.setPortMappingEnabled.mockResolvedValueOnce(false);
  await expect(retainPortMappingConnection()).rejects.toThrow('返回应用');
  const release = await retainPortMappingConnection(); await release();
  expect(native.stop).toHaveBeenCalledTimes(1);
});
