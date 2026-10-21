import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { isDirty, type DocumentTab } from './documents';
import type { BrowserTranslate } from './ProjectTree';

export function ProjectTabs({ tabs, activePath, choose, close, t }: {
  tabs: DocumentTab[]; activePath?: string; choose: (path: string) => void;
  close: (path: string) => void; t: BrowserTranslate;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activePath]);
  return <div ref={host} className="pf-tabs" role="tablist" aria-label={t('打开的文件')}>
    {tabs.map((tab, index) => {
      const name = tab.path.split(/[\\/]/).at(-1) ?? tab.path;
      return <div key={tab.path} className="pf-tab" data-active={tab.path === activePath}>
        <button type="button" role="tab" aria-selected={tab.path === activePath} aria-label={name}
          tabIndex={tab.path === activePath ? 0 : -1} onClick={() => choose(tab.path)}
          onKeyDown={event => {
            const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -index,
              End: tabs.length - index - 1 };
            if (!(event.key in offsets)) return;
            event.preventDefault();
            const next = (index + offsets[event.key] + tabs.length) % tabs.length;
            choose(tabs[next].path);
            host.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
          }}>
          <span className="pf-tab-name">{name}</span>
          {isDirty(tab) && <span className="pf-dirty-dot" aria-label={t('未保存')} />}
        </button>
        <button type="button" className="pf-tab-close" aria-label={`${t('关闭文件')} ${name}`}
          disabled={tab.saving} onClick={() => close(tab.path)}><X size={14} /></button>
      </div>;
    })}
  </div>;
}
