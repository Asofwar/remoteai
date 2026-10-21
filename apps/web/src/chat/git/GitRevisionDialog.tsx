import { Modal, Radio } from 'antd';
import { useState } from 'react';
import type { GitResetMode } from '../../../../../shared/remote-chat/gitTypes';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';
import './gitRevision.css';
import { GIT_RESET_MODES } from '../../../../../shared/remote-chat/gitMenu';

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
        {GIT_RESET_MODES.map(item => <Radio key={item.value} value={item.value}>
          <strong>{t(item.label)}</strong><small>{t(item.description)}</small>
        </Radio>)}
      </Radio.Group>
    </> : <p>{t('将切换到此提交，并进入分离 HEAD 状态。当前分支不会移动；若未提交的改动会被覆盖，操作将停止。')}</p>}
    {panel.error && <p role="alert">{t(panel.error)}</p>}
  </Modal>;
}
