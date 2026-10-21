import { useEffect, useRef, useState } from 'react';
import type { TreePrompt } from './useTreeActions';
import { entryNameError } from './entryActions';
import type { BrowserTranslate } from './ProjectTree';

const TITLES = { createFile: '新建文件', createFolder: '新建文件夹', rename: '重命名', delete: '删除' };

export function TreeActionDialog({ prompt, busy, error, connected, confirm, cancel, t }: {
  prompt: TreePrompt; busy: boolean; error: string; connected: boolean;
  confirm: (name: string) => void; cancel: () => void; t: BrowserTranslate;
}) {
  const element = useRef<HTMLElement>(null);
  const [name, setName] = useState(prompt.action === 'rename' ? prompt.entry.name : '');
  const deleting = prompt.action === 'delete';
  const invalid = deleting ? '' : entryNameError(name);
  useEffect(() => {
    const opener = document.activeElement;
    const field = element.current?.querySelector<HTMLInputElement>('input');
    if (field) { field.focus(); field.select(); }
    else element.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <div className="pf-confirm-backdrop">
    <section ref={element} role="alertdialog" aria-modal="true" aria-label={t(TITLES[prompt.action])}
      className="pf-confirm" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) cancel(); }
        if (event.key !== 'Tab') return;
        event.preventDefault(); event.stopPropagation();
        const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled)')];
        const index = fields.indexOf(document.activeElement as HTMLElement);
        fields[(index + (event.shiftKey ? -1 : 1) + fields.length) % fields.length]?.focus();
      }}>
      <form onSubmit={event => { event.preventDefault(); if (!invalid && !busy && connected) confirm(name); }}>
        <strong>{t(TITLES[prompt.action])}</strong><p className="pf-entry-name">{prompt.entry.name}</p>
        {deleting ? <p>{t(prompt.entry.directory
          ? '将删除此文件夹及其中的全部内容，包括未保存的修改。此操作无法撤销。'
          : '将删除此文件，包括未保存的修改。此操作无法撤销。')}</p>
          : <label className="pf-name-field">{t('名称')}
            <input value={name} maxLength={255} disabled={busy} aria-label={t('名称')}
              onChange={event => setName(event.target.value)} /></label>}
        {name && invalid && <p role="alert">{t(invalid)}</p>}
        {error && <p role="alert">{t(error)}</p>}
        <div className="pf-dialog-actions">
          <button type="button" disabled={busy} onClick={cancel}>{t('取消')}</button>
          <button type="submit" className={deleting ? 'pf-danger' : 'pf-save'}
            disabled={busy || !connected || !!invalid}>{t(busy ? '正在处理…' : deleting ? '确认删除' : '确定')}</button>
        </div>
      </form>
    </section>
  </div>;
}
