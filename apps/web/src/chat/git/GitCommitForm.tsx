import { Checkbox } from 'antd';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';

export function GitCommitForm({ panel }: { panel: RemoteGit }) {
  const count = Object.keys(panel.selected).length;
  return <div className="git-commit-form">
    <textarea aria-label={t('提交说明')} maxLength={4000} value={panel.message}
      placeholder={t(panel.autoMessage ? '提交时根据所选文件自动生成说明' : '填写提交说明，或按 Tab 用 AI 生成')}
      disabled={panel.busy || panel.autoMessage} onChange={event => panel.setMessage(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
          || event.nativeEvent.isComposing || panel.message.trim() || !panel.canGenerateMessage) return;
        event.preventDefault();
        void panel.generateMessage();
      }} />
    <div className="git-message-options">
      <Checkbox checked={panel.autoMessage} disabled={panel.busy || panel.settingsBusy}
        onChange={event => void panel.setAutoMessage(event.target.checked)}>{t('自动生成提交说明')}</Checkbox>
      {!panel.autoMessage && !panel.message.trim() && <button type="button" className="git-generate-message"
        disabled={!panel.canGenerateMessage} onClick={() => void panel.generateMessage()}>{t('AI 生成')}</button>}
    </div>
    {panel.generatingMessage && <p role="status">{t('正在生成提交说明…')}</p>}
    <div className="git-commit-actions">
      <button type="button" className="git-submit" disabled={!panel.canCommit}
        onClick={() => void panel.commit()}>{t('提交 {count} 个文件', { count })}</button>
      <button type="button" className="git-submit" disabled={!panel.canCommitAndPush}
        onClick={() => void panel.commit({ push: true })}>{t('提交并推送')}</button>
    </div>
  </div>;
}
