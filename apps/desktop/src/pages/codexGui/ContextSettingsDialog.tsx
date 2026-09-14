import { useId } from "react";
import { Button, Input, Modal, Spin } from "antd";
import { useContextSettings } from "./useContextSettings";
import styles from "./ContextUsageButton.module.less";

export function ContextSettingsDialog({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const editor = useContextSettings(threadId);
  const id = useId();
  const save = async () => { if (await editor.save()) onClose(); };
  return <Modal open centered width={360} title="对话上下文设置" onCancel={onClose}
    closable={!editor.saving} maskClosable={!editor.saving} keyboard={!editor.saving}
    footer={<>
      <Button disabled={editor.saving} onClick={onClose}>取消</Button>
      <Button type="primary" loading={editor.saving} disabled={editor.loading || !editor.loaded}
        onClick={() => void save()}>保存</Button>
    </>}>
    <div className={styles.settings}>
      <p className={styles.hint}>仅用于当前对话。保存后，重新连接 Codex 生效。</p>
      {editor.loading && <div role="status"><Spin size="small" /> 正在读取设置…</div>}
      {editor.loaded && <>
        <label htmlFor={id}>上下文容量（K Token）</label>
        <Input id={id} aria-label="上下文容量（K Token）" inputMode="decimal" value={editor.value}
          disabled={editor.saving} placeholder="使用默认容量" onChange={(event) => editor.setValue(event.target.value)}
          onPressEnter={() => void save()} />
        <div className={styles.settingHelp}>
          <span className={styles.hint}>1 K = 1000 Token；留空使用默认容量。</span>
          <Button type="link" size="small" disabled={editor.saving} onClick={() => editor.setValue("")}>恢复默认</Button>
        </div>
      </>}
      {editor.error && <div role="alert" className={styles.error}>{editor.error}
        {!editor.loaded && <Button type="link" size="small" onClick={editor.retry}>重试</Button>}
      </div>}
    </div>
  </Modal>;
}
