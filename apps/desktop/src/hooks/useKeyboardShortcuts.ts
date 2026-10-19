import { useCallback, useEffect, useRef, useState } from 'react';
import { getKeyboardShortcuts, setKeyboardShortcut, shortcutError,
  type ShortcutAction, type ShortcutError, type ShortcutSetting } from '../api/keyboardShortcuts';

export function useKeyboardShortcuts() {
  const [settings, setSettings] = useState<ShortcutSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ShortcutError | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getKeyboardShortcuts();
      if (mounted.current) setSettings(next);
    } catch (error) {
      if (mounted.current) setError(shortcutError(error, 'load'));
    } finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const save = async (action: ShortcutAction, shortcut: string | null) => {
    if (pending.current || loading) return false;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const next = await setKeyboardShortcut(action, shortcut);
      if (mounted.current) setSettings(next);
      return true;
    } catch (error) {
      if (mounted.current) setError(shortcutError(error, 'save'));
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return { settings, loading, saving, error, load, save, clearError: () => setError(null) };
}
