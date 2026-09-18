import { useEffect, useId, useRef, useState } from 'react';
import { Popover } from 'antd';
import { Settings } from 'lucide-react';
import { contextUsage, FULL_PERCENT } from '../../../desktop/src/pages/codexGui/contextUsage';
import { formatCompactTokenCount } from '../../../desktop/src/utils/tokenContext';
import type { ContextSettings, ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import { t, useLanguage } from '../i18n';
import type { ComposerProps } from './composerProps';
import { ComposerContextSettings } from './ComposerContextSettings';
import './composerContext.css';

function CapacityHint({ threadId, api }: { threadId: string; api: ContextSettingsApi }) {
  const language = useLanguage();
  const [settings, setSettings] = useState<ContextSettings | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api.read(threadId).then(value => { if (!cancelled) setSettings(value); }).catch(() => {
      // Usage remains available; the settings dialog offers a retry if reading fails.
    });
    return () => { cancelled = true; };
  }, [threadId, api]);
  if (settings?.capacity == null) return null;
  return <div className="composer-context-hint">
    <div>{t('对话设置：{capacity} Token', { capacity: formatCompactTokenCount(settings.capacity, language) })}</div>
    <div>{t('上方用量来自最近一次回复；可用容量会扣除预留空间。')}</div>
  </div>;
}

export function ComposerContext({ tokenUsage, threadId, contextSettings, ready, beforeOpen }: Pick<ComposerProps,
  'tokenUsage' | 'threadId' | 'contextSettings' | 'ready'> & { beforeOpen: () => void }) {
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const context = contextUsage(tokenUsage);
  const percent = context?.percent;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const content = <div id={id} className="composer-context-content" role="dialog" aria-label={t('背景信息窗口')}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <div className="composer-context-heading"><span>{t('背景信息窗口')}</span>
      <button type="button" className="composer-context-button" aria-label={t('设置当前对话的上下文容量')}
        disabled={!threadId || !ready} onClick={() => { setOpen(false); setEditing(true); }}>
        <Settings size={14} aria-hidden="true" />
      </button>
    </div>
    {!threadId && <div className="composer-context-hint">{t('选择对话后可设置容量')}</div>}
    {context ? <>
      <div>{percent != null ? t('{percent}% 已用（剩余 {remaining}%）', {
        percent, remaining: FULL_PERCENT - percent,
      }) : t('上下文容量未知')}</div>
      <div>{t('已用 {used} Token', { used: formatCompactTokenCount(context.used, language) })}
        {context.capacity !== null && t('，共 {capacity}', {
          capacity: formatCompactTokenCount(context.capacity, language),
        })}</div>
    </> : <div>{t('暂无上下文用量')}</div>}
    {open && threadId && ready && <CapacityHint threadId={threadId} api={contextSettings} />}
  </div>;
  return <>
    <Popover content={content} fresh destroyOnHidden trigger="click" placement="top" arrow={false} open={open}
      onOpenChange={value => { if (value) beforeOpen(); setOpen(value); }}
      styles={{ root: { maxWidth: 'min(400px, calc(100vw - 24px))', visibility: open ? 'visible' : 'hidden' },
        body: { padding: '6px 10px', borderRadius: 12 } }}>
      <button ref={trigger} type="button" className="composer-context-button" aria-label={t('查看上下文用量')}
        aria-haspopup="dialog" aria-expanded={open} aria-describedby={open ? id : undefined}
        onKeyDown={event => { if (event.key === 'Escape') close(); }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity=".2" />
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" pathLength={FULL_PERCENT}
            strokeDasharray={`${percent ?? 0} ${FULL_PERCENT}`} transform="rotate(-90 8 8)" />
        </svg>
      </button>
    </Popover>
    {editing && threadId && <ComposerContextSettings threadId={threadId} api={contextSettings}
      onClose={() => { setEditing(false); trigger.current?.focus(); }} />}
  </>;
}
