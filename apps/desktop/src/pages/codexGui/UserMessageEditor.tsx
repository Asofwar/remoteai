import { guiText } from "../../i18n/guiText";
import { backendText } from "../../../../../shared/i18n/backend/translateBackendMessage";
import { useContext, useEffect, useRef, useState } from "react";
import { Button, Popconfirm } from "antd";
import type { Content, SkillReference } from "./types";
import type { SubmitMessageEdit } from "./messageEditContent";
import { MessageEditorImages } from "./MessageEditorImages";
import { SkillInput, type SkillInputHandle } from "./SkillInput";
import { useMessageEditDraft } from "./useMessageEditDraft";
import { MessageEditContext } from "./messageEditContext";
import styles from "./UserMessage.module.less";

export function UserMessageEditor({ text, images, skills, disabled, onSubmit, onDelete, onCancel }: {
  text: string; images: Content[]; skills: SkillReference[];
  disabled: boolean; onSubmit: SubmitMessageEdit; onDelete?: () => Promise<boolean>; onCancel: () => void;
}) {
  const editor = useRef<SkillInputHandle>(null);
  const { cwd, active } = useContext(MessageEditContext);
  const draft = useMessageEditDraft({ text, images, skills });
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const remove = async () => {
    if (inFlight.current || disabled || !active || !onDelete) return;
    inFlight.current = true;
    setSaving(true);
    try { if (await onDelete()) onCancel(); }
    finally { inFlight.current = false; setSaving(false); }
  };
  useEffect(() => { editor.current?.focus(); }, []);
  const submit = async () => {
    if (inFlight.current || disabled || !active || draft.reading || draft.isReading() || !draft.draft.text.trim()) return;
    inFlight.current = true;
    setSaving(true);
    try {
      if (await onSubmit(draft.content())) onCancel();
    }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <div className={styles.editor}>
    <MessageEditorImages images={draft.images} removed={draft.removed} disabled={saving || disabled}
      onRemove={draft.remove} />
    <SkillInput ref={editor} value={draft.draft} draftKey="message-edit" cwd={cwd} active={active}
      connected={!disabled} disabled={saving || disabled} editing={{ onCancel, className: styles.editorInput }}
      placeholder={guiText("输入消息，或输入 / 选择技能…")} onChange={draft.setDraft} onPaste={draft.paste}
      onSend={() => void submit()} />
    {draft.error && <p className={styles.editorError} role="status">{backendText(draft.error)}</p>}
    <div className={styles.editorActions}>
      {onDelete && <Popconfirm title={guiText("删除这条消息？")}
        description={guiText("这条消息及之后的所有消息都会删除，无法撤销。")}
        overlayStyle={{ maxWidth: 400 }} okText={guiText("删除")} cancelText={guiText("取消")}
        okButtonProps={{ danger: true, autoInsertSpace: false }} cancelButtonProps={{ autoInsertSpace: false }}
        disabled={saving || disabled || !active} onConfirm={remove}>
        <Button danger className={styles.deleteButton} autoInsertSpace={false}
          disabled={saving || disabled || !active}>{guiText("删除消息")}</Button>
      </Popconfirm>}
      <Button className={styles.cancelButton} autoInsertSpace={false} aria-label={guiText("取消编辑")}
        disabled={saving} onClick={onCancel}>{guiText("取消")}</Button>
      <Button className={styles.sendButton} autoInsertSpace={false} type="primary"
        loading={saving} disabled={disabled || draft.reading || !draft.draft.text.trim()}
        onClick={() => void submit()}>{guiText("发送")}</Button>
    </div>
  </div>;
}
