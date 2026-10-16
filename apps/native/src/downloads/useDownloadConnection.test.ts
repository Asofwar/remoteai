import { afterEach, expect, it, vi } from 'vitest';
import { ChatController } from '../../../../shared/remote-chat/client/controller';
import { useDownloadConnection as useNativeDownloadConnection } from './useDownloadConnection';
import { useDownloadConnection as useWebDownloadConnection } from '../../../web/src/downloads/useDownloadConnection';

const runtime = vi.hoisted(() => ({
  effect: undefined as { dependencies: unknown[]; cleanup?: () => void } | undefined,
  manager: { bind: vi.fn(), unbind: vi.fn(), initialize: vi.fn(async () => undefined) },
}));
vi.mock('./manager', () => ({ downloadManager: runtime.manager, downloadOwner: () => 'owner' }));
vi.mock('../../../web/src/downloads/manager', () => ({
  downloadManager: runtime.manager, downloadOwner: () => 'owner',
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('react', () => ({
  useEffect: (effect: () => (() => void) | undefined, dependencies: unknown[]) => {
    const previous = runtime.effect;
    if (previous && dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))) return;
    previous?.cleanup?.();
    runtime.effect = { dependencies, cleanup: effect() };
  },
}));

afterEach(() => {
  runtime.effect?.cleanup?.(); runtime.effect = undefined;
  vi.clearAllMocks();
});

for (const [platform, useConnection] of [
  ['native', useNativeDownloadConnection], ['web', useWebDownloadConnection],
] as const) {
  it(`${platform}: background devices cannot replace the selected download source`, () => {
    const controller = new ChatController(() => ({ start() {}, stop() {}, request: async <T>() => ({}) as T }));
    const options = { session: { baseUrl: 'https://example.test', email: 'test@example.test',
      accessToken: 'access', refreshToken: 'refresh' },
    deviceId: 'computer', deviceName: 'Computer', controller };
    useConnection({ ...options, enabled: false });
    expect(runtime.manager.bind).not.toHaveBeenCalled();
    useConnection({ ...options, enabled: true });
    expect(runtime.manager.bind).toHaveBeenCalledOnce();
    useConnection({ ...options, enabled: false });
    expect(runtime.manager.unbind).toHaveBeenCalledWith(controller.files);
    controller.back({ cwd: '/project', label: 'Background project' });
    expect(runtime.manager.bind).toHaveBeenCalledOnce();
    useConnection({ ...options, enabled: true });
    expect(runtime.manager.bind).toHaveBeenCalledTimes(2);
  });
}
