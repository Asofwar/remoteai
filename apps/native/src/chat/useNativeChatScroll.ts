import { useEffect, useRef, type RefObject } from 'react';
import { findNodeHandle, NativeModules, Platform, type FlatList } from 'react-native';

interface ScrollBridge {
  attach: (tag: number, following: boolean, edgeDistance: number) => Promise<boolean>;
  setFollowing: (tag: number, following: boolean) => void;
  finishLoadingOlder: (tag: number) => void;
  detach: (tag: number) => void;
}
const bridge = Platform.OS === 'android' ? NativeModules.ChatScroll as ScrollBridge | undefined : undefined;

/** Older installed binaries and iOS retain the JavaScript scroll fallback. */
export function useNativeChatScroll<Entry>(list: RefObject<FlatList<Entry> | null>, edgeDistance: number) {
  const attached = useRef(false);
  const pending = useRef(false);
  const tag = useRef<number | null>(null);
  const following = useRef(true);
  useEffect(() => () => {
    if (tag.current != null) bridge?.detach(tag.current);
    tag.current = null;
    attached.current = false;
  }, []);
  const attach = () => {
    if (!bridge || attached.current || pending.current) return;
    const current = findNodeHandle(list.current?.getNativeScrollRef() ?? null);
    if (current == null) return;
    tag.current = current;
    pending.current = true;
    void bridge.attach(current, following.current, edgeDistance).then((ready) => {
      if (tag.current === current) attached.current = ready;
    }).catch(() => {
      // Keep the existing scroll path when a native view is unavailable during navigation.
      attached.current = false;
    }).finally(() => { pending.current = false; });
  };
  const setFollowing = (value: boolean) => {
    following.current = value;
    if (tag.current != null) bridge?.setFollowing(tag.current, value);
  };
  const finishLoadingOlder = () => {
    if (tag.current != null) bridge?.finishLoadingOlder(tag.current);
  };
  return { available: Boolean(bridge), attached, attach, setFollowing, finishLoadingOlder };
}
