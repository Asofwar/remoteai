import { useEffect, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AUTO_SAVE_KEY, autoSaveDelay, DEFAULT_AUTO_SAVE_DELAY } from '../../../../shared/project-browser/preferences';

let state = { delay: DEFAULT_AUTO_SAVE_DELAY, ready: false };
let loading: Promise<void> | undefined;
let revision = 0;
let writes = Promise.resolve();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const read = () => state;
const publish = (delay: number) => {
  state = { delay, ready: true };
  listeners.forEach(listener => listener());
};
function load() {
  const current = revision;
  loading ??= SecureStore.getItemAsync(AUTO_SAVE_KEY).then(value => {
    if (current === revision) publish(value === null ? DEFAULT_AUTO_SAVE_DELAY : autoSaveDelay(Number(value)));
  }).catch(() => { if (current === revision) publish(DEFAULT_AUTO_SAVE_DELAY); });
  return loading;
}
export function setFileAutoSave(value: number): Promise<boolean> {
  const delay = autoSaveDelay(value);
  revision++;
  publish(delay);
  const saved = writes.then(() => SecureStore.setItemAsync(AUTO_SAVE_KEY, String(delay)));
  writes = saved.catch(() => { /* Keep later preference writes usable after a storage failure. */ });
  return saved.then(() => true, () => false);
}
export function useFilePreferences() {
  useEffect(() => { void load(); }, []);
  return useSyncExternalStore(subscribe, read, read);
}
