import { Modal, Radio } from 'antd';
import { useState } from 'react';
import type { GitResetMode } from '../../../../../shared/remote-chat/gitTypes';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';
import './gitRevision.css';

const RESET_MODES: { value: GitResetMode; label: string; description: string }[] = [
  { value: 'soft', label: '保留改动并暂存（Soft）', description: '保留文件和暂存区，撤回的提交可重新提交。' },
  { value: 'mixed', label: '保留改动，取消暂存（Mixed）', description: '保留文件，将与目标提交的差异放回未暂存改动。' },
  { value: 'hard', label: '放弃改动（Hard）',
    description: '文件和暂存区将恢复到此提交，未提交的改动及阻挡恢复的未跟踪文件会丢失。' },
  { value: 'keep', label: '保留未提交改动（Keep）', description: '保留未提交的改动；如与目标提交冲突，将停止重置。' },
];

export function GitRevisionDialog({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const [mode, setMode] = useState<GitResetMode>('mixed');
  const prompt = panel.revisionAction;
  if (!prompt) return null;
  const resetting = prompt.action === 'reset';
  return <Modal open centered width={400} title={t(resetting ? '重置当前分支到此提交' : '检出此提交')}
    className="git-revision-dialog" onCancel={panel.cancelRevisionAction} closable={!panel.busy}
    maskClosable={!panel.busy} keyboard={!panel.busy} cancelText={t('取消')}
    cancelButtonProps={{ disabled: panel.busy, 'aria-label': t('取消') }} confirmLoading={panel.busy}
    okText={t(resetting ? '确认重置' : '确认检出')}
    okButtonProps={{ danger: resetting && mode === 'hard', disabled: !connected,
      'aria-label': t(resetting ? '确认重置' : '确认检出') }}
    onOk={() => void panel.confirmRevisionAction(mode)}>
    <p className="git-revision-target"><code>{prompt.commit.slice(0, 12)}</code> · {prompt.subject}</p>
    {resetting ? <>
      <p>{t('将分支 {branch} 移到所选提交。', { branch: prompt.branch ?? '' })}</p>
      <Radio.Group value={mode} disabled={panel.busy} onChange={event => setMode(event.target.value)}
        className="git-reset-modes" aria-label={t('重置方式')}>
        {RESET_MODES.map(item => <Radio key={item.value} value={item.value}>
          <strong>{t(item.label)}</strong><small>{t(item.description)}</small>
        </Radio>)}
      </Radio.Group>
    </> : <p>{t('将切换到此提交，并进入分离 HEAD 状态。当前分支不会移动；若未提交的改动会被覆盖，操作将停止。')}</p>}
    {panel.error && <p role="alert">{t(panel.error)}</p>}
  </Modal>;
}
