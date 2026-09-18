import { t, useLanguage } from '../i18n';
import { LoaderCircle } from 'lucide-react';
import type { UploadProgress } from '../../../../shared/remote-chat/uploadProgress';
import './uploadProgress.css';

export function ChatUploadProgress({ progress, reconnecting }: {
  progress?: UploadProgress; reconnecting: boolean;
}) {
  useLanguage();
  if (!progress) return null;
  const label = reconnecting ? t("连接恢复后继续上传…") : {
    preparing: t("正在准备上传…"), uploading: t("正在上传附件 {value1}%", { value1: progress.percent }),
    confirming: t("上传完成，等待电脑确认…"),
  }[progress.phase];
  return <div className="chat-upload-progress">
    <div role="status"><LoaderCircle className="spin" size={17} /><span>{label}</span></div>
    <div className="chat-upload-track" role="progressbar" aria-label={t("附件上传进度")}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
      <i style={{ width: `${progress.percent}%` }} /></div>
  </div>;
}
