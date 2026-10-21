import { Pressable, Text } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import type { GitCommit } from '../../../../../shared/remote-chat/gitTypes';
import type { GitFileRow } from '../../../../../shared/remote-chat/useGitFileList';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { deletableGitFiles, gitFileMenuLabels } from '../../../../../shared/remote-chat/gitMenu';
import { t, useLanguage } from '../../i18n';
import { GitActionDialog, useGitActionStyles } from './GitActionDialog';

export type GitMenuTarget = { kind: 'file'; row: GitFileRow } | { kind: 'commit'; commit: GitCommit };
interface MenuItem { label: string; run: () => void; disabled?: boolean; danger?: boolean }
interface Props {
  target: GitMenuTarget; panel: RemoteGit; connected: boolean; close: () => void;
  onPatch?: (commit: GitCommit) => Promise<void>; patchNotice: string;
}

function menuItems({ target, panel, connected, onPatch, patchNotice }: Props): MenuItem[] {
  const disabled = panel.busy || !connected;
  const mutationDisabled = disabled || !panel.changes || panel.changes.files.some(file => file.conflict);
  if (target.kind === 'file') {
    const { row } = target;
    const labels = gitFileMenuLabels(row.kind === 'folder');
    const deletable = deletableGitFiles(row.files);
    return [
      { label: labels.commit, disabled: mutationDisabled, run: () => panel.requestFileAction('commit', row.files) },
      { label: labels.rollback, disabled: mutationDisabled, run: () => panel.requestFileAction('rollback', row.files) },
      { label: labels.delete, danger: true, disabled: mutationDisabled || !deletable.length,
        run: () => panel.requestFileAction('delete', deletable) },
    ];
  }
  const { commit } = target;
  return [
    { label: '复制提交哈希', disabled: panel.busy,
      run: () => void panel.performHistoryAction(async () => { await setStringAsync(commit.hash); }, '已复制') },
    { label: '创建补丁…', disabled: disabled || !onPatch,
      run: () => { if (onPatch) void panel.performHistoryAction(() => onPatch(commit), patchNotice); } },
    { label: '检出此提交…', disabled: mutationDisabled,
      run: () => panel.requestRevisionAction('checkout', commit) },
    { label: '重置当前分支到此提交…', disabled: mutationDisabled || !panel.changes?.branch,
      run: () => panel.requestRevisionAction('reset', commit) },
  ];
}

export function GitMenu(props: Props) {
  const styles = useGitActionStyles();
  useLanguage();
  const { target, close } = props;
  const title = target.kind === 'file' ? target.row.path : target.commit.subject;
  return <GitActionDialog title={title} close={close}>
    {menuItems(props).map(item => <Pressable key={item.label} accessibilityRole="menuitem"
      accessibilityLabel={t(item.label)} accessibilityState={{ disabled: item.disabled }} disabled={item.disabled}
      onPress={() => { close(); item.run(); }} style={[styles.item, item.disabled && styles.disabled]}>
      <Text style={[styles.label, item.danger && styles.danger]}>{t(item.label)}</Text>
    </Pressable>)}
  </GitActionDialog>;
}
