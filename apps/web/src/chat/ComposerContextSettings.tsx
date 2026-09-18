import { useId, useState } from 'react';
import { AutoComplete, Button, Input, Modal, Spin } from 'antd';
import { CONTEXT_CAPACITY_PRESETS_K, type ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import { useContextSettings } from '../../../../shared/remote-chat/client/useContextSettings';
import { t, useLanguage } from '../i18n';

const capacityOptions = CONTEXT_CAPACITY_PRESETS_K.map(value => ({ value: String(value), label: `${value}K` }));

export function ComposerContextSettings({ threadId, api, onClose }: {
  threadId: string; api: ContextSettingsApi; onClose: () => void;
}) {
  useLanguage();
  const editor = useContextSettings(threadId, api);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const id = useId();
  const save = async () => { if (await editor.save()) onClose(); };
  return <Modal open centered width={360} title={t('对话上下文设置')}
    onCancel={() => { if (!editor.saving) onClose(); }}
    closable={editor.saving ? false : { 'aria-label': t('关闭') }}
    maskClosable={!editor.saving} keyboard={!editor.saving} footer={<>
      <Button disabled={editor.saving} aria-label={t('取消')} onClick={onClose}>{t('取消')}</Button>
      <Button type="primary" aria-label={t('保存')} loading={editor.saving} disabled={editor.loading || !editor.loaded}
        onClick={() => { void save(); }}>{t('保存')}</Button>
    </>}>
    <div className="composer-context-settings">
      <p className="composer-context-hint">
        {t('仅用于当前对话。保存后立即应用；正在回复时会先暂停，修改后自动继续。')}</p>
      {editor.loading && <div role="status"><Spin size="small" /> {t('正在读取上下文设置…')}</div>}
      {editor.loaded && <>
        <label htmlFor={id}>{t('上下文容量（K Token）')}</label>
        <AutoComplete id={id} value={editor.value} options={capacityOptions} disabled={editor.saving}
          onChange={editor.setValue} onOpenChange={setPresetsOpen} defaultActiveFirstOption={false}>
          <Input aria-label={t('上下文容量（K Token）')} inputMode="decimal"
            placeholder={t('选择或输入容量，留空使用默认值')} onPressEnter={event => {
              event.preventDefault();
              if (!presetsOpen && !event.nativeEvent.isComposing) void save();
            }} />
        </AutoComplete>
        <div className="composer-context-help">
          <span className="composer-context-hint">{t('1 K = 1000 Token；留空使用默认容量。')}</span>
          <Button type="link" size="small" disabled={editor.saving}
            onClick={() => editor.setValue('')}>{t('恢复默认')}</Button>
        </div>
        <p className="composer-context-hint">{t('用量会在收到回复后更新。可用容量受模型上限和预留空间影响。')}</p>
      </>}
      {editor.error && <div role="alert" className="chat-error">{t(editor.error)}
        {!editor.loaded && <Button type="link" size="small" onClick={editor.retry}>{t('重试')}</Button>}
      </div>}
    </div>
  </Modal>;
}
