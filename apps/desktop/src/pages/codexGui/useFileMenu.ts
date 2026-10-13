import { guiText } from "../../i18n/guiText";
import { useContext, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { isHostedWebApp } from "../../api/backend";
import { fileApi, FileThreadContext, type FileAction, type FileApplication } from "./fileApi";
import type { FileReference } from "./fileReference";
import { DetailsContext } from "./detailsContext";
import { FileEnvironmentContext } from './fileEnvironment';
import { isDownloadOnlyFile } from '../../../../../shared/remote-chat/filePreview';

const FEEDBACK_STYLE = { maxWidth: 400, marginInline: "auto" };

export function useFileMenu(target: FileReference) {
  const threadId = useContext(FileThreadContext);
  const panel = useContext(DetailsContext);
  const environment = useContext(FileEnvironmentContext);
  const api = environment?.actions ?? fileApi;
  const desktop = Boolean(environment) || isTauri();
  const [open, setOpen] = useState(false);
  const [applications, setApplications] = useState<FileApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  useEffect(() => {
    setOpen(false); setApplications([]);
  }, [target.path, threadId, api]);
  useEffect(() => {
    if (!open || !desktop) return;
    let cancelled = false;
    setLoading(true); setFailed(false);
    void api.applications().then((value) => { if (!cancelled) setApplications(value); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, desktop, api]);
  const perform = async (action: FileAction) => {
    if (flight.current) return;
    flight.current = true; setBusy(true); setOpen(false);
    try {
      const result = desktop ? await api.perform({ ...target, threadId }, action)
        : { path: target.path, text: undefined, saved: false };
      if (action.type === "copyFile" && desktop) {
        void message.success({ content: guiText(environment ? "文件已复制到远程电脑的剪贴板。"
          : "文件已复制，可粘贴到文件夹。"), style: FEEDBACK_STYLE });
      }
      if (action.type === "copyPath" || action.type === "copyContents") {
        await navigator.clipboard.writeText(action.type === "copyPath" ? result.path : result.text ?? "");
        void message.success({ content: guiText("已复制"), style: FEEDBACK_STYLE });
      }
      if (action.type === "saveAs" && result.saved) {
        void message.success({ content: guiText("文件已保存"), style: FEEDBACK_STYLE });
      }
    } catch (error) {
      // Native errors are intentionally limited to friendly messages at the IPC boundary.
      void message.error({ content: typeof error === "string" ? error : guiText("操作未完成，请稍后重试。"),
        style: FEEDBACK_STYLE });
    } finally { flight.current = false; setBusy(false); }
  };
  const preview = async () => {
    if (flight.current) return;
    flight.current = true; setBusy(true); setOpen(false);
    try {
      const file = { ...target, threadId };
      const remotePreview = environment && !isDownloadOnlyFile(target.path) ? panel?.openRemoteFile : undefined;
      try {
        if (panel && await panel.openFile(file)) return;
      } catch (error) {
        // Older peers and unavailable preview tunnels still support ordinary remote file reads.
        if (!remotePreview) throw error;
      }
      if (!remotePreview || !await remotePreview(file)) setOpen(true);
    } catch (error) {
      setOpen(true);
      void message.error({ content: typeof error === "string" ? error : guiText("预览未能打开，请选择其他打开方式。"),
        style: FEEDBACK_STYLE });
    } finally { flight.current = false; setBusy(false); }
  };
  return { open, setOpen, applications, desktop, remote: Boolean(environment), canPreview: desktop || isHostedWebApp,
    loading, failed, busy, perform, preview };
}
