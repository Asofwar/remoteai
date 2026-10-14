import type { RefObject } from 'react';
import { File, Folder, X } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { projectFileReference, useProjectFileCandidates,
  type ProjectFileSearch } from '../../../../shared/chat/useProjectFileCandidates';
import type { AttachmentReference } from '../../../desktop/src/pages/codexGui/attachmentTypes';
import { useComposerMenuKeyboard } from './useComposerMenuKeyboard';
import './composerFileMenu.css';

export function ComposerFileMenu(props: {
  input: RefObject<HTMLTextAreaElement>; query: string; threadId: string | null; cwd: string; ready: boolean;
  load: ProjectFileSearch; choose: (reference: AttachmentReference) => void; close: () => void;
}) {
  useLanguage();
  const { input, query, threadId, cwd, ready, load, choose, close } = props;
  const result = useProjectFileCandidates({ active: true, connected: ready, query, threadId, cwd, load });
  const keyboard = useComposerMenuKeyboard({ input, query, close, selectWithTab: true,
    options: result.entries.map(file => ({ key: file.path, enabled: ready,
      choose: () => choose(projectFileReference(file)) })) });
  return <div className="chat-command-menu chat-file-menu" aria-label={t('引用文件或文件夹')}>
    <header><strong>{t('引用文件或文件夹')}</strong>
      <button type="button" aria-label={t('关闭文件列表')} onClick={close}><X size={16} /></button></header>
    <div ref={keyboard.list} id={keyboard.id} className="chat-menu-options" role="menu" aria-label={t('项目文件')}>
      {result.entries.map(file => <button key={file.path} type="button" role="menuitem" disabled={!ready}
        {...keyboard.optionProps(file.path)} onPointerDown={event => event.preventDefault()}
        onClick={() => choose(projectFileReference(file))}>
        {file.directory ? <Folder size={18} /> : <File size={18} />}
        <span><strong>{file.name}</strong><small>{file.relativePath ?? file.path}</small></span>
      </button>)}
      {result.loading && <p role="status">{t('正在搜索文件…')}</p>}
      {result.error && <p role="status">{t(result.error)}</p>}
      {!result.loading && !result.error && !result.entries.length && <p>{t('没有找到匹配的文件或文件夹')}</p>}
      {result.truncated && <p role="status">{t('仅显示部分结果，请输入更完整的名称或路径')}</p>}
    </div>
  </div>;
}
