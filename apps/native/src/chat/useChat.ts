import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import type { AuthSession } from '../types';
import { ChatController } from './controller';
import { CHAT_SERVICE_STOPPED } from './backgroundConnection';
import { useChatCatalog } from './useChatCatalog';

const HISTORY_REFRESH_MS = 15_000;

export function useChat(session: AuthSession, deviceId: string, active: boolean) {
  const controller = useMemo(() => new ChatController(session, deviceId), [session, deviceId]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const catalog = useChatCatalog({ session, deviceId, controller, state });
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    // Device visibility controls polling, while the mounted chat owns the connection.
    if (!deviceId) return;
    controller.start();
    const stopped = DeviceEventEmitter.addListener(CHAT_SERVICE_STOPPED, () => controller.stop());
    const resumed = AppState.addEventListener('change', (next) => {
      if (next !== 'active') { void controller.flushCache(); return; }
      controller.start();
      // Returning to chat should not wait for a background retry's backoff timer.
      controller.connectNow();
    });
    return () => { stopped.remove(); resumed.remove(); controller.stop(); };
  }, [deviceId, controller]);
  useEffect(() => {
    if (active && foreground && deviceId) controller.connectNow();
  }, [active, foreground, deviceId, controller]);
  useEffect(() => {
    if (!active || !foreground || (state.mode !== 'direct' && state.mode !== 'relay')) return;
    void controller.refreshSelected();
    const timer = setInterval(() => { void controller.refreshSelected(); }, HISTORY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, foreground, controller, state.mode]);
  return { controller, state, foreground, catalog };
}
