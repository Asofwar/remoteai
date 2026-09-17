import { useEffect, useRef } from 'react';
import type { GuiTitleSettings } from './titleSettings';

export function useTitleSettings(active: boolean, settings: GuiTitleSettings) {
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) void settings.refresh();
    wasActive.current = active;
  }, [active, settings]);
}
