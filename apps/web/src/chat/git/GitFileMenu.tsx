import { Dropdown } from 'antd';
import { GitCommitHorizontal, Trash2, Undo2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { GitChange } from '../../../../../shared/remote-chat/gitTypes';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';

export function GitFileMenu({ file, panel, connected, children }: {
  file?: GitChange; panel: RemoteGit; connected: boolean; children: ReactElement;
}) {
  if (!file) return children;
  const disabled = panel.busy || !connected || panel.changes?.files.some(item => item.conflict);
  return <Dropdown trigger={['contextMenu']} disabled={disabled} overlayClassName="git-file-context-menu"
    menu={{ items: [
      { key: 'commit', label: t('提交单个文件'), icon: <GitCommitHorizontal size={16} /> },
      { key: 'rollback', label: t('回退单个文件'), icon: <Undo2 size={16} /> },
      { type: 'divider' },
      { key: 'delete', label: t('删除文件'), icon: <Trash2 size={16} />, danger: true,
        disabled: file.status[1] === 'D' || file.status === 'D ' },
    ], onClick: ({ key }) => {
      if (key === 'commit' || key === 'rollback' || key === 'delete') panel.requestFileAction(key, file);
    } }}>{children}</Dropdown>;
}
