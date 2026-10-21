import { useState } from "react";
import { Alert, App, Button, Modal, Upload } from "antd";
import { Download, FolderArchive, Upload as UploadIcon } from "lucide-react";
import { errorText } from "../api";
import { msg, useT } from "../i18n";

export function BackupButton({ onRestored }: { onRestored: () => void }) {
  const { modal } = App.useApp();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const perform = async (file?: File) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/backup", { method: file ? "POST" : "GET", body: file,
        headers: { Authorization: `Bearer ${sessionStorage.getItem("coze-session") ?? ""}` } });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? msg("备份操作未完成，请稍后重试。"));
      }
      if (file) { onRestored(); setOpen(false); return; }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `coze-${new Date().toISOString().slice(0, 10)}.coze`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  const restore = (file: File) => {
    // App.useApp().modal follows the ConfigProvider locale and theme; static Modal.confirm does not.
    modal.confirm({ title: t("用备份替换当前内容？"), width: 400,
      content: t("当前内容会被替换，分享链接会失效。建议先下载一份备份。"),
      okText: t("恢复备份"), cancelText: t("取消"), okButtonProps: { danger: true }, onOk: () => perform(file) });
    return false;
  };
  return <><button className="studio-nav-button" aria-label={t("备份与恢复")} onClick={() => setOpen(true)}>
    <FolderArchive size={18} /><span>{t("备份与恢复")}</span></button>
    <Modal className="studio-dialog" title={t("备份与恢复")} open={open} width={400} centered
      footer={null} onCancel={() => setOpen(false)}>
      <p>{t("保存一份完整备份，随时恢复你的创作内容。")}</p>
      <section className="backup-option"><h3><Download size={18} />{t("下载备份")}</h3>
        <p>{t("包含应用、文档、对话、发布版本和运行记录。")}</p>
        <Button block type="primary" loading={busy} onClick={() => void perform()}>{t("下载完整备份")}</Button>
      </section>
      <section className="backup-option"><h3><UploadIcon size={18} />{t("恢复备份")}</h3>
        <p>{t("选择备份文件，恢复后将替换当前内容。")}</p>
        <Upload className="backup-upload" accept=".coze" beforeUpload={restore}
          showUploadList={false} disabled={busy}>
          <Button block disabled={busy}>{t("选择备份文件")}</Button></Upload>
      </section>
      {error && <Alert style={{ marginTop: 12 }} type="error" message={t(error)} />}
    </Modal></>;
}
