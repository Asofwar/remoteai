import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { isDirty, type DocumentTab } from './documents';
import type { BrowserTranslate } from './ProjectTree';
import { TabMenu } from './TabMenu';
import { useTreeGesture } from './useTreeGesture';
import type { TabCommand, TabMenuTarget, TabTarget } from './tabCommands';

interface Props {
  tabs: DocumentTab[]; activePath?: string; choose: (path: string) => void;
  close: (path: string) => void; t: BrowserTranslate; groupId: string; blocked: boolean; connected: boolean;
  command: (target: TabTarget, command: TabCommand) => void;
}

function ProjectTab({ tab, active, choose, close, menu, navigate, blocked, t }: {
  tab: DocumentTab; active: boolean; blocked: boolean; choose: () => void; close: () => void;
  menu: (point: { x: number; y: number }) => void; navigate: (key: string) => boolean; t: BrowserTranslate;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const gesture = useTreeGesture(point => { button.current?.focus(); menu(point); });
  const name = tab.path.split(/[\\/]/).at(-1) ?? tab.path;
  return <div className="pf-tab" data-active={active} {...gesture}>
    <button ref={button} type="button" role="tab" aria-selected={active} aria-label={name}
      aria-haspopup="menu" tabIndex={active ? 0 : -1} onClick={choose} onKeyDown={event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          menu({ x: rect.left, y: rect.bottom }); return;
        }
        if (navigate(event.key)) event.preventDefault();
      }}>
      <span className="pf-tab-name">{name}</span>
      {isDirty(tab) && <span className="pf-dirty-dot" aria-label={t('未保存')} />}
    </button>
    <button type="button" className="pf-tab-close" aria-label={`${t('关闭文件')} ${name}`}
      disabled={tab.saving || blocked} onClick={close}><X size={14} /></button>
  </div>;
}

export function ProjectTabs({ tabs, activePath, choose, close, t, groupId, blocked, connected, command }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<TabMenuTarget>();
  const dismiss = useCallback(() => setMenu(undefined), []);
  useEffect(() => {
    host.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activePath]);
  return <><div ref={host} className="pf-tabs" role="tablist" aria-label={t('打开的文件')}>
    {tabs.map((tab, index) => <ProjectTab key={tab.path} tab={tab} active={tab.path === activePath}
      choose={() => choose(tab.path)} close={() => close(tab.path)} t={t} blocked={blocked}
      menu={point => setMenu({ ...point, groupId, path: tab.path })}
      navigate={key => {
        const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -index,
          End: tabs.length - index - 1 };
        if (!(key in offsets)) return false;
        const next = (index + offsets[key] + tabs.length) % tabs.length;
        choose(tabs[next].path);
        host.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
        return true;
      }} />)}
  </div>
    {menu && <TabMenu target={menu} tabs={tabs} blocked={blocked} connected={connected}
      command={action => command(menu, action)} close={dismiss} t={t} />}
  </>;
}
