import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Copy, Download, FilePlus, FolderOpen, FolderPlus,
  Scissors, ClipboardPaste, Pencil, Trash2, Terminal, Link } from 'lucide-react';
import type { BrowserHost } from './entryActions';
import { normalizedPath } from './entryActions';
import type { TreeCommand, TreeMenu as Menu } from './useTreeActions';
import type { BrowserTranslate } from './ProjectTree';

export function TreeMenu({ menu, host, canPaste, cwd, close, command, t }: {
  menu: Menu; host: BrowserHost; canPaste: boolean; cwd: string; close: () => void;
  command: (action: TreeCommand) => void; t: BrowserTranslate;
}) {
  const element = useRef<HTMLDivElement>(null);
  const pressedInMenu = useRef(false);
  const [submenu, setSubmenu] = useState<'new' | 'open'>();
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
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
    const rect = element.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)) });
    element.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [menu, submenu]);
  const item = (action: TreeCommand, label: string, Icon: typeof Copy, disabled = false) =>
    <button key={action} type="button" role="menuitem" disabled={disabled}
      className={action === 'delete' ? 'pf-danger' : undefined} onClick={() => command(action)}>
      <Icon size={16} /><span>{t(label)}</span></button>;
  return <div className="pf-menu-backdrop" onPointerDown={() => { pressedInMenu.current = true; }}
    onClickCapture={event => {
      // Ignore the synthetic click from releasing the touch that opened this menu.
      if (!pressedInMenu.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
      pressedInMenu.current = false;
    }} onClick={event => {
    if (event.target === event.currentTarget) { event.stopPropagation(); close(); }
  }} onContextMenu={event => event.preventDefault()}>
    <div ref={element} role="menu" aria-label={t('文件操作')} className="pf-tree-menu" style={position}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault(); event.stopPropagation();
          if (submenu) setSubmenu(undefined); else close();
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowUp' || event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {submenu && <button type="button" role="menuitem" onClick={() => setSubmenu(undefined)}>
        <ArrowLeft size={16} /><span>{t('返回')}</span></button>}
      {submenu === 'new' && <>
        {item('createFile', '新建文件', FilePlus)}{item('createFolder', '新建文件夹', FolderPlus)}
      </>}
      {submenu === 'open' && <>
        {item('explorer', '系统文件浏览器', FolderOpen)}{item('terminal', '终端', Terminal)}
      </>}
      {!submenu && <>
        {menu.entry.directory && <button type="button" role="menuitem" aria-haspopup="menu"
          onClick={() => setSubmenu('new')} onKeyDown={event => {
            if (event.key === 'ArrowRight') { event.preventDefault(); setSubmenu('new'); }
          }}><FilePlus size={16} /><span>{t('新建')}</span><ChevronRight size={14} /></button>}
        {item('cut', '剪切', Scissors, root)}{item('copy', '复制', Copy, root)}
        {item('copyPath', '复制路径', Link)}
        {menu.entry.directory && item('paste', '粘贴', ClipboardPaste, !canPaste)}
        <div role="separator" />
        {item('rename', '重命名', Pencil, root)}{item('delete', '删除', Trash2, root)}
        <div role="separator" />
        {host.open ? <button type="button" role="menuitem" aria-haspopup="menu"
          onClick={() => setSubmenu('open')} onKeyDown={event => {
            if (event.key === 'ArrowRight') { event.preventDefault(); setSubmenu('open'); }
          }}><FolderOpen size={16} /><span>{t('打开位置')}</span><ChevronRight size={14} /></button>
          : item('download', menu.entry.directory ? '下载为 ZIP' : '下载', Download, !host.download)}
      </>}
    </div>
  </div>;
}
