import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Download, FilePlus, FolderOpen, FolderPlus,
  Scissors, ClipboardPaste, Pencil, Trash2, Terminal, Link, Quote } from 'lucide-react';
import type { BrowserHost } from './entryActions';
import { normalizedPath } from './entryActions';
import type { TreeCommand, TreeMenu as Menu } from './useTreeActions';
import type { BrowserTranslate } from './ProjectTree';
import { TreeSubmenu } from './TreeSubmenu';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus, SUBMENU_GAP } from './treeMenuNavigation';

export function TreeMenu({ menu, host, canPaste, cwd, close, command, t }: {
  menu: Menu; host: BrowserHost; canPaste: boolean; cwd: string; close: () => void;
  command: (action: TreeCommand) => void; t: BrowserTranslate;
}) {
  const element = useRef<HTMLDivElement>(null);
  const pressedInMenu = useRef(false);
  const [submenu, setSubmenu] = useState<'new' | 'open'>();
  const [compact, setCompact] = useState(false);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const stackedSubmenu = compact ? submenu : undefined;
  const root = normalizedPath(menu.entry.path) === normalizedPath(cwd);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || element.current?.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    // A touch release can return focus to the pressed row after the menu has opened.
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [close]);
  useLayoutEffect(() => {
    const positionMenu = () => {
      const rect = element.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - rect.width - MENU_MARGIN)),
        top: Math.max(MENU_MARGIN, Math.min(menu.y, window.innerHeight - rect.height - MENU_MARGIN)),
      });
      setCompact(window.innerWidth < rect.width * 2 + MENU_MARGIN * 2 + SUBMENU_GAP);
    };
    const resize = () => { setSubmenu(undefined); positionMenu(); };
    positionMenu();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [menu, stackedSubmenu]);
  useLayoutEffect(() => { focusFirstMenuItem(element.current); }, [menu, stackedSubmenu]);
  const item = (action: TreeCommand, label: string, Icon: typeof Copy, disabled = false) =>
    <button key={action} type="button" role="menuitem" disabled={disabled}
      className={action === 'delete' ? 'pf-danger' : undefined} onClick={() => command(action)}>
      <Icon size={16} /><span>{t(label)}</span></button>;
  const newItems = <>{item('createFile', '新建文件', FilePlus)}{item('createFolder', '新建文件夹', FolderPlus)}</>;
  const openItems = <>{item('explorer', '系统文件浏览器', FolderOpen)}{item('terminal', '终端', Terminal)}</>;
  const clearOtherSubmenu = (target: EventTarget) => {
    const button = (target as HTMLElement).closest('button');
    if (button?.closest('[role="menu"]') === element.current && !button.hasAttribute('aria-haspopup')) {
      setSubmenu(undefined);
    }
  };
  return <div className="pf-menu-backdrop" onPointerDown={() => { pressedInMenu.current = true; }}
    onClickCapture={event => {
      // Ignore the synthetic click from releasing the touch that opened this menu.
      if (!pressedInMenu.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
      pressedInMenu.current = false;
    }} onClick={event => {
    if (event.target === event.currentTarget) { event.stopPropagation(); close(); }
  }} onContextMenu={event => event.preventDefault()}>
    <div ref={element} role="menu" aria-label={t('文件操作')} className="pf-tree-menu" style={position}
      onPointerOver={event => {
        if (event.pointerType === 'mouse' && !compact) clearOtherSubmenu(event.target);
      }} onFocus={event => { if (!compact) clearOtherSubmenu(event.target); }}
      onScroll={() => { if (!compact) setSubmenu(undefined); }}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault(); event.stopPropagation();
          if (submenu) setSubmenu(undefined); else close();
        }
        moveMenuFocus(event);
      }}>
      {stackedSubmenu && <button type="button" role="menuitem" onClick={() => setSubmenu(undefined)}>
        <ArrowLeft size={16} /><span>{t('返回')}</span></button>}
      {stackedSubmenu === 'new' && newItems}
      {stackedSubmenu === 'open' && openItems}
      {!stackedSubmenu && <>
        {item('reference', '引用文件', Quote, !host.reference)}
        {menu.entry.directory && <TreeSubmenu label={t('新建')} icon={FilePlus} active={submenu === 'new'}
          compact={compact} open={() => setSubmenu('new')}
          close={() => setSubmenu(current => current === 'new' ? undefined : current)}>{newItems}</TreeSubmenu>}
        {item('cut', '剪切', Scissors, root)}{item('copy', '复制', Copy, root)}
        {item('copyPath', '复制路径', Link)}
        {menu.entry.directory && item('paste', '粘贴', ClipboardPaste, !canPaste)}
        <div role="separator" />
        {item('rename', '重命名', Pencil, root)}{item('delete', '删除', Trash2, root)}
        <div role="separator" />
        {host.open ? <TreeSubmenu label={t('打开位置')} icon={FolderOpen} active={submenu === 'open'}
          compact={compact} open={() => setSubmenu('open')}
          close={() => setSubmenu(current => current === 'open' ? undefined : current)}>{openItems}</TreeSubmenu>
          : item('download', menu.entry.directory ? '下载为 ZIP' : '下载', Download, !host.download)}
      </>}
    </div>
  </div>;
}
