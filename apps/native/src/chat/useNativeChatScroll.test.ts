import { beforeEach, expect, it, vi } from 'vitest';
import type { FlatList } from 'react-native';
import { useNativeChatScroll } from './useNativeChatScroll';

const mock = vi.hoisted(() => ({
  tag: 42 as number | null,
  attach: vi.fn<(tag: number, following: boolean, distance: number) => Promise<boolean>>(),
  setFollowing: vi.fn(), finishLoadingOlder: vi.fn(), detach: vi.fn(), cleanup: undefined as (() => void) | undefined,
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, findNodeHandle: () => mock.tag,
  NativeModules: { ChatScroll: { attach: mock.attach, setFollowing: mock.setFollowing,
    finishLoadingOlder: mock.finishLoadingOlder, detach: mock.detach } },
}));
vi.mock('react', () => ({ useRef: <T>(current: T) => ({ current }),
  useEffect: (effect: () => (() => void)) => { mock.cleanup = effect(); },
}));

const list = { current: { getNativeScrollRef: () => ({}) } as FlatList };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  vi.clearAllMocks(); mock.tag = 42; mock.attach.mockResolvedValue(true); mock.cleanup = undefined;
});

it('keeps the fallback until the native view attaches and coalesces repeated layout events', async () => {
  let resolve: (ready: boolean) => void = () => {};
  mock.attach.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const scroll = useNativeChatScroll(list, 100);
  scroll.attach(); scroll.attach();
  expect(mock.attach).toHaveBeenCalledExactlyOnceWith(42, true, 100);
  expect(scroll.attached.current).toBe(false);
  resolve(true); await flush();
  expect(scroll.attached.current).toBe(true);
  scroll.attach();
  expect(mock.attach).toHaveBeenCalledTimes(1);
});

it('retries attachment when Fabric has not mounted the native scroll view yet', async () => {
  const scroll = useNativeChatScroll(list, 100);
  mock.tag = null;
  scroll.attach();
  expect(mock.attach).not.toHaveBeenCalled();
  mock.tag = 42;
  mock.attach.mockResolvedValueOnce(false);
  scroll.attach(); await flush();
  expect(scroll.attached.current).toBe(false);
  scroll.attach(); await flush();
  expect(scroll.attached.current).toBe(true);
});

it('preserves an explicit history pause while attachment is pending', async () => {
  const scroll = useNativeChatScroll(list, 100);
  scroll.setFollowing(false);
  scroll.attach(); await flush();
  expect(mock.attach).toHaveBeenCalledWith(42, false, 100);
  scroll.finishLoadingOlder();
  expect(mock.finishLoadingOlder).toHaveBeenCalledExactlyOnceWith(42);
  expect(mock.setFollowing).not.toHaveBeenCalled();
  scroll.setFollowing(true);
  expect(mock.setFollowing).toHaveBeenCalledExactlyOnceWith(42, true);
});

it('detaches on navigation and ignores an attachment response for the old conversation', async () => {
  let resolve: (ready: boolean) => void = () => {};
  mock.attach.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const scroll = useNativeChatScroll(list, 100);
  scroll.attach();
  mock.cleanup?.();
  resolve(true); await flush();
  expect(mock.detach).toHaveBeenCalledExactlyOnceWith(42);
  expect(scroll.attached.current).toBe(false);
  scroll.setFollowing(true);
  expect(mock.setFollowing).not.toHaveBeenCalled();
});

it('retains the JavaScript fallback when native attachment fails', async () => {
  mock.attach.mockRejectedValueOnce(new Error('View removed'));
  const scroll = useNativeChatScroll(list, 100);
  scroll.attach(); await flush();
  expect(scroll.attached.current).toBe(false);
  scroll.attach(); await flush();
  expect(scroll.attached.current).toBe(true);
});
