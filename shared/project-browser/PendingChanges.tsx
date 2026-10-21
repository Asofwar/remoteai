import { useEffect, useRef } from 'react';
import type { BrowserTranslate } from './ProjectTree';

export function PendingChanges({ saving, connected, error, path, cancel, discard, save, t }: {
  saving: boolean; connected: boolean; error: string; cancel: () => void; discard: () => void;
  save: () => void; t: BrowserTranslate; path: string;
}) {
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    host.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <div className="pf-confirm-backdrop">
    <section ref={host} role="alertdialog" aria-modal="true" aria-label={t('保留文件修改？')} className="pf-confirm"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!saving) cancel(); return; }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(host.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }}>
      <strong>{t('保留文件修改？')}</strong><p>{path.split(/[\\/]/).at(-1)}<br />{t('此文件有未保存的修改。')}</p>
      <div>
        <button type="button" disabled={saving} onClick={cancel}>{t('取消')}</button>
        <button type="button" disabled={saving} onClick={discard}>{t('放弃修改')}</button>
        <button type="button" className="pf-save" disabled={!connected || saving} onClick={save}>
          {t(saving ? '正在保存…' : '保存并继续')}</button>
      </div>
      {error && <p role="alert">{t(error)}</p>}
    </section>
  </div>;
}
