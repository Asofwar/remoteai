import { t, useLanguage } from '../i18n';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { CONTEXT_CAPACITY_PRESETS_K, type ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import { useContextSettings } from '../../../../shared/remote-chat/client/useContextSettings';

export function ChatContextSettings({ threadId, api, onClose }: {
  threadId: string; api: ContextSettingsApi; onClose: () => void;
}) {
  useLanguage();
  const editor = useContextSettings(threadId, api);
  const close = () => { if (!editor.saving) onClose(); };
  const save = async () => { if (await editor.save()) onClose(); };
  return <AdaptiveSheet open title={t("对话上下文设置")} width={400} onBack={close} onClose={close}>
    <div className="chat-settings">
      <p className="chat-muted">{t("仅用于当前对话。保存后立即应用；正在回复时会先暂停，修改后自动继续。")}</p>
      {editor.loading && <p role="status">{t("正在读取上下文设置…")}</p>}
      {editor.loaded && <>
        <label htmlFor="chat-context-capacity">{t("上下文容量（K Token）")}</label>
        <input id="chat-context-capacity" className="chat-answer" inputMode="decimal" value={editor.value}
          onChange={event => editor.setValue(event.target.value)} disabled={editor.saving} placeholder={t("选择或输入容量")} />
        <div className="chat-context-presets">{CONTEXT_CAPACITY_PRESETS_K.map(capacity =>
          <button key={capacity} type="button" className="chat-button" disabled={editor.saving}
            aria-pressed={Number(editor.value) === capacity} onClick={() => editor.setValue(String(capacity))}>
            {capacity}K</button>)}</div>
        <p className="chat-muted">{t("1 K = 1000 Token；留空使用默认容量。")}</p>
        <p className="chat-muted">{t("用量会在收到回复后更新。程序会预留部分空间，显示的可用容量可能略小。")}</p>
        <button type="button" className="chat-button" disabled={editor.saving}
          onClick={() => editor.setValue('')}>{t("恢复默认")}</button>
      </>}
      {editor.error && <p role="alert" className="chat-error">{t(editor.error)}</p>}
      {!editor.loading && !editor.loaded && <button type="button" className="chat-button"
        onClick={editor.retry}>{t("重试")}</button>}
      <div className="chat-row"><button type="button" className="chat-button" disabled={editor.saving}
        onClick={close}>{t("取消")}</button><button type="button" className="chat-button chat-primary"
        disabled={editor.loading || !editor.loaded || editor.saving} onClick={() => { void save(); }}>
        {editor.saving ? t("正在保存…") : t("保存")}</button></div>
    </div>
  </AdaptiveSheet>;
}
