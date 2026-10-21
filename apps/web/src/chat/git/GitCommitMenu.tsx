import { GitContextMenu } from './GitContextMenu';
import { Copy, FileDown, GitCommitHorizontal, Undo2 } from 'lucide-react';
import type { ReactElement } from 'react';
import type { GitCommit } from '../../../../../shared/remote-chat/gitTypes';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { copyText } from '../../components/copyText';
import { t } from '../../i18n';
import './gitRevision.css';

export function GitCommitMenu({ commit, panel, connected, onPatch, children }: {
  commit: GitCommit; panel: RemoteGit; connected: boolean; onPatch?: (commit: GitCommit) => Promise<void>;
  children: ReactElement;
}) {
  const disabled = !connected || panel.busy;
  const mutationDisabled = disabled || !panel.changes || panel.changes.files.some(file => file.conflict);
  return <GitContextMenu overlayClassName="git-commit-context-menu"
    menu={{ items: [
      { key: 'copy', label: t('复制提交哈希'), icon: <Copy size={16} /> },
      { key: 'patch', label: t('创建补丁…'), icon: <FileDown size={16} />, disabled: disabled || !onPatch },
      { type: 'divider' },
      { key: 'checkout', label: t('检出此提交…'), icon: <GitCommitHorizontal size={16} />,
        disabled: mutationDisabled },
      { type: 'divider' },
      { key: 'reset', label: t('重置当前分支到此提交…'), icon: <Undo2 size={16} />,
        disabled: mutationDisabled || !panel.changes?.branch },
    ], onClick: ({ key }) => {
      if (key === 'copy') void copyText(t('提交哈希'), commit.hash);
      else if (key === 'patch' && onPatch) {
        void panel.performHistoryAction(() => onPatch(commit), '已加入下载管理。');
      } else if (key === 'checkout' || key === 'reset') panel.requestRevisionAction(key, commit);
    } }}>{children}</GitContextMenu>;
}
