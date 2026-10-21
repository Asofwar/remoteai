import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import type { GitResetMode } from '../../../../../shared/remote-chat/gitTypes';
import { GIT_RESET_MODES } from '../../../../../shared/remote-chat/gitMenu';
import { t, useLanguage } from '../../i18n';
import { GitActionDialog, useGitActionStyles } from './GitActionDialog';

export function GitFileActionConfirmation({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const [message, setMessage] = useState(panel.message);
  const styles = useGitActionStyles();
  useLanguage();
  const prompt = panel.fileAction;
  if (!prompt) return null;
  const committing = prompt.action === 'commit';
  const title = committing ? t('提交 {count} 个文件', { count: prompt.files.length })
    : t(prompt.action === 'rollback' ? '回退文件' : '删除文件');
  const label = t(committing ? '提交' : prompt.action === 'rollback' ? '确认回退' : '确认删除');
  return <GitActionDialog title={title} close={panel.cancelFileAction} busy={panel.busy}
    confirm={() => void panel.confirmFileAction(message)} label={label} danger={!committing}
    disabled={!connected || (committing && !message.trim())}>
    {prompt.files.map(file => <Text key={file.path} style={styles.text}>{file.path}</Text>)}
    {committing ? <TextInput accessibilityLabel={t('提交说明')} multiline maxLength={4000}
      autoFocus value={message} editable={!panel.busy} onChangeText={setMessage} style={styles.input} />
      : <Text style={styles.text}>{t(prompt.action === 'rollback'
        ? '将放弃这些文件的全部未提交改动，新增文件会被删除。此操作无法撤销。'
        : '将从项目中删除这些文件。此操作无法撤销。')}</Text>}
    {!!panel.error && <Text accessibilityRole="alert" style={[styles.text, styles.danger]}>{t(panel.error)}</Text>}
  </GitActionDialog>;
}

export function GitRevisionConfirmation({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const [mode, setMode] = useState<GitResetMode>('mixed');
  const styles = useGitActionStyles();
  useLanguage();
  const prompt = panel.revisionAction;
  if (!prompt) return null;
  const resetting = prompt.action === 'reset';
  return <GitActionDialog title={t(resetting ? '重置当前分支到此提交' : '检出此提交')}
    close={panel.cancelRevisionAction} busy={panel.busy} disabled={!connected}
    confirm={() => void panel.confirmRevisionAction(mode)} label={t(resetting ? '确认重置' : '确认检出')}
    danger={resetting && mode === 'hard'}>
    <Text style={styles.text}>{prompt.commit.slice(0, 12)} · {prompt.subject}</Text>
    {resetting ? <>
      <Text style={styles.text}>{t('将分支 {branch} 移到所选提交。', { branch: prompt.branch ?? '' })}</Text>
      {GIT_RESET_MODES.map(item => <Pressable key={item.value} accessibilityRole="radio"
        accessibilityLabel={t(item.label)} accessibilityState={{ checked: mode === item.value, disabled: panel.busy }}
        disabled={panel.busy} onPress={() => setMode(item.value)} style={[styles.item,
          mode === item.value && styles.selected]}>
        <Text style={styles.label}>{mode === item.value ? '● ' : '○ '}{t(item.label)}</Text>
        <Text style={styles.hint}>{t(item.description)}</Text>
      </Pressable>)}
    </> : <Text style={styles.text}>
      {t('将切换到此提交，并进入分离 HEAD 状态。当前分支不会移动；若未提交的改动会被覆盖，操作将停止。')}
    </Text>}
    {!!panel.error && <Text accessibilityRole="alert" style={[styles.text, styles.danger]}>{t(panel.error)}</Text>}
  </GitActionDialog>;
}
