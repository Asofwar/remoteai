import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isDirty, type DocumentTab } from './documents';
import type { BrowserTranslate } from './ProjectTree';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus } from './treeMenuNavigation';

interface Props {
  tabs: DocumentTab[]; anchor: HTMLButtonElement; choose: (path: string) => void;
  close: () => void; t: BrowserTranslate;
}

export function TabOverflowMenu({ tabs, anchor, choose, close, t }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const selected = useRef(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const bounds = menu.current?.getBoundingClientRect();
    if (!bounds) return;
    const trigger = anchor.getBoundingClientRect();
    setPosition({
      left: Math.max(MENU_MARGIN, Math.min(trigger.right - bounds.width,
        window.innerWidth - bounds.width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(trigger.bottom, window.innerHeight - bounds.height - MENU_MARGIN)),
    });
    focusFirstMenuItem(menu.current);
  }, [anchor]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener('keydown', dismiss, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('resize', close);
      if (!selected.current && anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor, close]);
  return <div className="pf-menu-backdrop" onClick={event => {
    if (event.target === event.currentTarget) { event.stopPropagation(); close(); }
  }} onContextMenu={event => { event.preventDefault(); close(); }}>
    <div ref={menu} className="pf-tree-menu pf-tab-overflow-menu" role="menu" aria-label={t('隐藏的标签页')}
      style={position} onKeyDown={moveMenuFocus}>
      {tabs.map(tab => <button key={tab.path} type="button" role="menuitem"
        aria-label={tab.path.split(/[\\/]/).at(-1) ?? tab.path}
        onClick={() => { selected.current = true; close(); choose(tab.path); }}>
        <span className="pf-tab-overflow-label">
          <span>{tab.path.split(/[\\/]/).at(-1) ?? tab.path}</span>
          <small>{tab.path}</small>
        </span>
        {isDirty(tab) && <span className="pf-dirty-dot" aria-label={t('未保存')} />}
      </button>)}
    </div>
  </div>;
}
