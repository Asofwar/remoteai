import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Columns2, Rows2 } from 'lucide-react';
import type { BrowserTranslate } from './ProjectTree';
import type { DocumentTab } from './documents';
import { tabsToClose, type CloseTabCommand, type TabCommand, type TabMenuTarget } from './tabCommands';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus } from './treeMenuNavigation';

const CLOSE_ITEMS: { action: CloseTabCommand; label: string }[] = [
  { action: 'close', label: '关闭' }, { action: 'closeOthers', label: '关闭其他标签页' },
  { action: 'closeAll', label: '关闭所有标签页' }, { action: 'closeUnmodified', label: '关闭未修改的标签页' },
  { action: 'closeRight', label: '关闭右侧标签页' },
];
const SPLIT_ITEMS = [
  { action: 'splitRight', label: '向右拆分', Icon: Columns2 },
  { action: 'moveRight', label: '拆分并移到右侧' },
  { action: 'splitDown', label: '向下拆分', Icon: Rows2 },
  { action: 'moveDown', label: '拆分并移到下方' },
] as const;

export function TabMenu({ target, tabs, blocked, connected, command, close, t }: {
  target: TabMenuTarget; tabs: DocumentTab[]; blocked: boolean; connected: boolean;
  command: (command: TabCommand) => void; close: () => void; t: BrowserTranslate;
}) {
  const element = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement);
  const restoreFocus = useRef(true);
  const pressed = useRef(false);
  const [position, setPosition] = useState({ left: target.x, top: target.y });
  useLayoutEffect(() => {
    const rect = element.current?.getBoundingClientRect();
    if (rect) setPosition({
      left: Math.max(MENU_MARGIN, Math.min(target.x, window.innerWidth - rect.width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(target.y, window.innerHeight - rect.height - MENU_MARGIN)),
    });
    focusFirstMenuItem(element.current);
  }, [target]);
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
      if (restoreFocus.current && opener.current instanceof HTMLElement && opener.current.isConnected) {
        opener.current.focus();
      }
    };
  }, [close]);
  const choose = (action: TabCommand) => { restoreFocus.current = false; close(); command(action); };
  return <div className="pf-menu-backdrop" onPointerDown={() => { pressed.current = true; }}
    onContextMenu={event => event.preventDefault()} onClickCapture={event => {
      if (!pressed.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
      pressed.current = false;
    }} onClick={event => { if (event.target === event.currentTarget) { event.stopPropagation(); close(); } }}>
    <div ref={element} className="pf-tree-menu pf-tab-menu" role="menu" aria-label={t('标签页操作')}
      style={position} onKeyDown={moveMenuFocus}>
      {CLOSE_ITEMS.map(({ action, label }) => {
        const paths = tabsToClose(tabs, target.path, action);
        const disabled = blocked || !paths.length || tabs.some(tab => paths.includes(tab.path) && tab.saving);
        return <button key={action} type="button" role="menuitem" disabled={disabled} onClick={() => choose(action)}
          aria-keyshortcuts={action === 'close' ? 'Control+F4' : undefined}>
          <span>{t(label)}</span>{action === 'close' && <kbd aria-hidden="true">Ctrl+F4</kbd>}
        </button>;
      })}
      <div role="separator" />
      <button type="button" role="menuitem" onClick={() => choose('copyPath')}><span>{t('复制路径')}</span></button>
      <button type="button" role="menuitem"
        disabled={blocked || !connected || tabs.some(tab => tab.saving || tab.loading)}
        onClick={() => choose('rename')}><span>{t('重命名')}</span></button>
      <div role="separator" />
      {SPLIT_ITEMS.map(item => <button key={item.action} type="button" role="menuitem"
        disabled={blocked} onClick={() => choose(item.action)}>
        {'Icon' in item ? <item.Icon size={16} /> : <span className="pf-menu-icon-space" />}
        <span>{t(item.label)}</span>
      </button>)}
    </div>
  </div>;
}
