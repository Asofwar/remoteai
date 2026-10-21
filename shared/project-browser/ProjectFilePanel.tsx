import { FileSearch } from 'lucide-react';
import { ProjectEditor } from './ProjectEditor';
import { isDirty, type DocumentTab } from './documents';
import type { BrowserTranslate } from './ProjectTree';

export function ProjectFilePanel({ tab, active, connected, edit, save, t }: {
  tab: DocumentTab; active: boolean; connected: boolean; edit: (text: string) => void;
  save: () => void; t: BrowserTranslate;
}) {
  const document = tab.document;
  const filename = tab.path.split(/[\\/]/).at(-1);
  return <div className="pf-file-panel" role="tabpanel" aria-label={filename} hidden={!active}>
    {tab.error && <div className="pf-feedback" role="alert">{t(tab.error)}</div>}
    {tab.loading && <p className="pf-feedback" role="status">{t('正在加载…')}</p>}
    {document?.kind === 'text' && <ProjectEditor key={tab.editorVersion} path={document.path}
      text={tab.text} readOnly={document.readOnly || !connected || tab.loading}
      onChange={edit} save={save} t={t} />}
    {document?.kind === 'image' && <div className="pf-image"><img src={document.image} alt={filename} /></div>}
    {document && ['binary', 'large'].includes(document.kind) && <div className="pf-empty">
      <FileSearch size={36} /><p>{t(document.kind === 'large'
        ? '文件超过 2 MB，暂不支持在这里编辑。' : '此文件暂不支持预览。')}</p></div>}
    {document && <footer className="pf-status" role="status">
      <span>{Math.max(1, Math.ceil(document.size / 1024))} KB</span>
      <span>{t(document.readOnly ? '只读' : isDirty(tab) ? '未保存' : tab.saved ? '已保存' : '可编辑')}</span>
    </footer>}
  </div>;
}
