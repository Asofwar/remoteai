import { Input, Modal } from "antd";
import { useRef, useState } from "react";
import type { Translate } from "../../i18n";

interface PasteAccountModalProps {
  onClose: () => void;
  onImported: () => void;
  onImport: (content: string) => Promise<boolean>;
  t: Translate;
}

export function PasteAccountModal({ onClose, onImported, onImport, t }: PasteAccountModalProps) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const importing = useRef(false);
  const submit = async () => {
    if (importing.current || !content.trim()) return;
    importing.current = true;
    setBusy(true);
    try {
      if (await onImport(content)) onImported();
    } finally {
      importing.current = false;
      setBusy(false);
    }
  };

  return <Modal open centered width={400} title={t("login.importClipboard")}
    okText={t("login.importConfirm")} cancelText={t("login.webSessionCancelButton")}
    confirmLoading={busy} okButtonProps={{ disabled: !content.trim() }}
    cancelButtonProps={{ disabled: busy }} closable={!busy} maskClosable={!busy} keyboard={!busy}
    onCancel={onClose} onOk={() => void submit()}>
    <p>{t("login.pasteDescription")}</p>
    <Input.TextArea autoFocus value={content} onChange={(event) => setContent(event.target.value)}
      autoSize={{ minRows: 5, maxRows: 10 }} disabled={busy} autoComplete="off" spellCheck={false}
      aria-label={t("login.pasteLabel")} placeholder={t("login.pasteLabel")} />
  </Modal>;
}
