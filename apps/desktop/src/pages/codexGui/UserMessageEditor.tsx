import { useRef, useState } from "react";
import { Button, Input } from "antd";
import type { Content } from "./types";
import type { SubmitMessageEdit } from "./messageEditContent";
import { MessageEditorImages } from "./MessageEditorImages";
import styles from "./UserMessage.module.less";

export function UserMessageEditor({ text, images, disabled, onSubmit, onCancel }: {
  text: string; images: Content[]; disabled: boolean; onSubmit: SubmitMessageEdit; onCancel: () => void;
}) {
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [removedImageIndexes, setRemovedImageIndexes] = useState<number[]>([]);
  const inFlight = useRef(false);
  const submit = async () => {
    if (inFlight.current || disabled || !draft.trim()) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const content = removedImageIndexes.length ? { text: draft, removedImageIndexes } : { text: draft };
      if (await onSubmit(content)) onCancel();
    }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <div className={styles.editor}>
    <MessageEditorImages images={images} removed={removedImageIndexes} disabled={saving}
      onRemove={(index) => setRemovedImageIndexes((current) => [...current, index])} />
    <Input.TextArea autoFocus aria-label="编辑消息内容" value={draft} disabled={saving}
      className={styles.editorInput} variant="borderless"
      autoSize={{ minRows: 2, maxRows: 14 }} onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && !saving) { event.preventDefault(); onCancel(); }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit(); }
      }} />
    <div className={styles.editorActions}>
      <Button className={styles.cancelButton} autoInsertSpace={false} aria-label="取消编辑"
        disabled={saving} onClick={onCancel}>取消</Button>
      <Button className={styles.sendButton} autoInsertSpace={false} type="primary"
        loading={saving} disabled={disabled || !draft.trim()}
        onClick={() => void submit()}>发送</Button>
    </div>
  </div>;
}
