import { Dropdown } from 'antd';
import { GitCommitHorizontal, Trash2, Undo2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { GitFileRow } from '../../../../../shared/remote-chat/useGitFileList';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';

export function GitFileMenu({ row, panel, connected, children }: {
  row: GitFileRow; panel: RemoteGit; connected: boolean; children: ReactElement;
}) {
  if (row.kind === 'area') return children;
  const folder = row.kind === 'folder';
  const deletable = row.files.filter(file => file.status[1] !== 'D' && file.status !== 'D ');
  const disabled = panel.busy || !connected || panel.changes?.files.some(item => item.conflict);
  return <Dropdown trigger={['contextMenu']} disabled={disabled} overlayClassName="git-file-context-menu"
    menu={{ items: [
      { key: 'commit', label: t(folder ? '提交文件夹内改动' : '提交单个文件'),
        icon: <GitCommitHorizontal size={16} /> },
      { key: 'rollback', label: t(folder ? '回退文件夹内改动' : '回退单个文件'), icon: <Undo2 size={16} /> },
      { type: 'divider' },
      { key: 'delete', label: t(folder ? '删除文件夹内改动文件' : '删除文件'), icon: <Trash2 size={16} />,
        danger: true, disabled: !deletable.length },
    ], onClick: ({ key }) => {
      if (key === 'commit' || key === 'rollback') panel.requestFileAction(key, row.files);
      if (key === 'delete') panel.requestFileAction(key, deletable);
    } }}>{children}</Dropdown>;
}
