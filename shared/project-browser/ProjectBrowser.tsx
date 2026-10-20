import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, FileSearch, RefreshCw, Save } from 'lucide-react';
import type { ProjectBrowserClient } from './protocol';
import { ProjectTree, type BrowserTranslate } from './ProjectTree';
import { ProjectEditor } from './ProjectEditor';
import { useProjectDocument } from './useProjectDocument';
import { useTreeResize } from './useTreeResize';
import { PendingChanges } from './PendingChanges';
import './projectBrowser.css';

export interface ProjectBrowserHandle { requestClose: () => void }
interface Props {
  client: ProjectBrowserClient; cwd: string; connected: boolean; t: BrowserTranslate; onClose: () => void;
}

export const ProjectBrowser = forwardRef<ProjectBrowserHandle, Props>(function ProjectBrowser(
  { client, cwd, connected, t, onClose }, ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const file = useProjectDocument(client, cwd);
  const split = useTreeResize(host);
  const [showFile, setShowFile] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const document = file.document;
  const guard = (action: () => void) => {
    if (file.saving) return;
    if (file.dirty) setPending(() => action); else action();
  };
  useImperativeHandle(ref, () => ({ requestClose: () => guard(onClose) }));
  useEffect(() => {
    if (!file.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [file.dirty]);
  const choose = (path: string) => {
    if (path === document?.path) { setShowFile(true); return; }
    guard(() => { setShowFile(true); void file.open(path); });
  };
  const save = () => { if (connected && file.dirty && !file.loading) void file.save(); };
  const filename = document?.path.split(/[\\/]/).at(-1);
  const relativePath = document?.path.replace(/\\/g, '/').replace(`${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/`, '');
  return <div ref={host} className="pf-browser" data-show-file={showFile} data-narrow={split.narrow}
    style={{ '--pf-tree-width': `${split.width}px` } as CSSProperties}>
    {!connected && <p className="pf-connection" role="status">{t('连接已断开，重新连接后即可继续。')}</p>}
    <div className="pf-browser-layout">
      <ProjectTree client={client} cwd={cwd} connected={connected} selected={document?.path} choose={choose} t={t} />
      <div className="pf-splitter" role="separator" tabIndex={0} aria-orientation="vertical"
        aria-label={t('调整文件树宽度')} aria-valuemin={split.minimum} aria-valuemax={split.maximum}
        aria-valuenow={split.width} {...split.handle} />
      <section className="pf-file" aria-label={t('文件预览')}>
        <header className="pf-file-heading">
          <button type="button" className="pf-back" aria-label={t('返回文件列表')} onClick={() => setShowFile(false)}>
            <ArrowLeft size={18} /></button>
          <div className="pf-file-name"><strong>{filename ?? t('文件内容')}{file.dirty ? ' •' : ''}</strong>
            <span>{relativePath}</span></div>
          {document && <button type="button" aria-label={t('重新加载文件')} disabled={file.loading || file.saving || !connected}
            onClick={() => guard(() => void file.open(document.path))}><RefreshCw size={16} /></button>}
          {document?.kind === 'text' && <button type="button" className="pf-save"
            disabled={!connected || !file.dirty || document.readOnly || file.loading || file.saving} onClick={save}>
            <Save size={16} />{t(file.saving ? '正在保存…' : '保存')}</button>}
        </header>
        {file.error && <div className="pf-feedback" role="alert">{t(file.error)}</div>}
        {file.loading && <p className="pf-feedback" role="status">{t('正在加载…')}</p>}
        {!document && !file.loading && <div className="pf-empty"><FileSearch size={36} />
          <p>{t('选择文件以查看内容')}</p></div>}
        {document?.kind === 'text' && <ProjectEditor key={`${document.path}:${file.editorVersion}`}
          path={document.path} text={file.text} readOnly={document.readOnly || !connected || file.loading}
          onChange={file.edit} save={save} t={t} />}
        {document?.kind === 'image' && <div className="pf-image">
          <img src={document.image} alt={filename} /></div>}
        {document && ['binary', 'large'].includes(document.kind) && <div className="pf-empty">
          <FileSearch size={36} /><p>{t(document.kind === 'large'
            ? '文件超过 2 MB，暂不支持在这里编辑。' : '此文件暂不支持预览。')}</p></div>}
        {document && <footer className="pf-status" role="status">
          <span>{Math.max(1, Math.ceil(document.size / 1024))} KB</span>
          <span>{t(document.readOnly ? '只读' : file.dirty ? '未保存' : file.saved ? '已保存' : '可编辑')}</span>
        </footer>}
      </section>
    </div>
    {pending && <PendingChanges saving={file.saving} connected={connected} error={file.error} t={t}
      cancel={() => setPending(null)} discard={() => { setPending(null); pending(); }}
      save={async () => { if (await file.save()) { setPending(null); pending(); } }} />}
  </div>;
});
