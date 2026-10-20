import { Input, Modal } from 'antd';
import { useState } from 'react';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';

const ACTION_LABELS = { commit: '提交单个文件', rollback: '回退文件', delete: '删除文件' };

export function GitFileActionDialog({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const [message, setMessage] = useState(panel.message);
  const prompt = panel.fileAction;
  if (!prompt) return null;
  const committing = prompt.action === 'commit';
  const confirmText = t(committing ? '提交' : prompt.action === 'rollback' ? '确认回退' : '确认删除');
  return <Modal open centered width={400} title={t(ACTION_LABELS[prompt.action])}
    className="git-file-action-dialog" onCancel={panel.cancelFileAction} closable={!panel.busy}
    maskClosable={!panel.busy} keyboard={!panel.busy} cancelText={t('取消')}
    cancelButtonProps={{ disabled: panel.busy, 'aria-label': t('取消') }} confirmLoading={panel.busy}
    okText={confirmText}
    okButtonProps={{ danger: !committing, disabled: !connected || (committing && !message.trim()),
      'aria-label': confirmText }}
    onOk={() => void panel.confirmFileAction(message)}>
    <ul className="git-action-file-list">{prompt.files.map(file => <li key={file.path}>{file.path}</li>)}</ul>
    {committing ? <Input.TextArea autoFocus aria-label={t('单文件提交说明')} placeholder={t('填写提交说明')}
      maxLength={4000} rows={3} value={message} disabled={panel.busy}
      onChange={event => setMessage(event.target.value)} />
      : <p>{t(prompt.action === 'rollback'
        ? '将放弃这些文件的全部未提交改动，新增文件会被删除。此操作无法撤销。'
        : '将从项目中删除此文件。此操作无法撤销。')}</p>}
    {panel.error && <p role="alert">{t(panel.error)}</p>}
  </Modal>;
}
