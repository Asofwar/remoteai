import { useCallback, useMemo, useRef, useState } from 'react';
import type { WorkspaceTab, WorkspaceTabs } from './workspaceDrawer';

export function useWorkspaceDrawer(active: boolean) {
  const [entries, setEntries] = useState<WorkspaceTab[]>([]);
  const [selected, select] = useState<string | null>(null);
  const [display, setDisplay] = useState<'open' | 'closed' | 'minimized'>('closed');
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const register = useCallback((tab: WorkspaceTab) => {
    setEntries(current => [...current.filter(entry => entry.id !== tab.id), tab]);
    return () => setEntries(current => current.filter(entry => entry.id !== tab.id));
  }, []);
  const rememberOpener = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && !focused.closest('[data-details-panel]')) opener.current = focused;
  }, []);
  const open = useCallback((id: string) => {
    rememberOpener();
    select(id); setDisplay('open');
  }, [rememberOpener]);
  const hide = useCallback(() => { setDisplay('closed'); opener.current?.focus(); }, []);
  const minimize = useCallback(() => { setDisplay('minimized'); opener.current?.focus(); }, []);
  const visible = active && display === 'open';
  const tabs = useMemo<WorkspaceTabs>(() => ({
    entries, selected, visible, content, register, open, hide, rememberOpener,
  }), [entries, selected, visible, content, register, open, hide, rememberOpener]);
  return { tabs, setContent, minimize, minimized: display === 'minimized',
    restore: () => setDisplay('open') };
}
