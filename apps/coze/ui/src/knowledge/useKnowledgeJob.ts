import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errorText } from "../api";
import { msg, useT } from "../i18n";

interface Progress { type?: string; stage?: string; completed?: number; total?: number }
interface Job {
  status: "running" | "completed" | "failed" | "cancelled";
  events: { sequence: number; event: Progress }[]; error?: string;
}
/** Import progress as data: `label` is a Chinese source string, translated when it is rendered. */
interface JobProgress { label: string; completed?: number; total?: number }

const stages: Record<string, string> = {
  parse: msg("正在读取文档"), download: msg("正在读取网页"), recognize: msg("正在识别内容"), index: msg("正在整理知识"),
};
const stageLabel = (stage = "") =>
  Object.prototype.hasOwnProperty.call(stages, stage) ? stages[stage] : msg("正在处理");

export function useKnowledgeJob(options: {
  scope: string; onComplete: () => Promise<void>; onError: (error: string) => void;
}) {
  const { scope, onComplete, onError } = options;
  const t = useT();
  const storageKey = `coze-import-${scope}`;
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(storageKey) ?? "");
  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState<JobProgress>();
  const pending = useRef(false);
  const start = useCallback(async (method: string, params: unknown) => {
    if (pending.current || jobId) return;
    pending.current = true; setStarting(true); setProgress({ label: msg("正在准备导入") }); onError("");
    try {
      const result = await api<{ id: string }>(method, params);
      sessionStorage.setItem(storageKey, result.id); setJobId(result.id);
    } catch (error) { onError(errorText(error)); setProgress(undefined); }
    finally { pending.current = false; setStarting(false); }
  }, [jobId, onError, storageKey]);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let after = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const job = await api<Job>("job_status", { id: jobId, after });
        if (!active) return;
        for (const { sequence, event } of job.events) {
          after = sequence;
          if (event.type !== "progress") continue;
          setProgress({ label: stageLabel(event.stage), completed: event.completed, total: event.total });
        }
        if (job.status === "running") { timer = setTimeout(() => void poll(), 500); return; }
        sessionStorage.removeItem(storageKey); setJobId("");
        setProgress(job.status === "completed" ? { label: msg("导入完成") }
          : job.status === "cancelled" ? { label: msg("已取消导入") } : undefined);
        // job.error is the untranslated Rust message; the panel translates errors when it renders them.
        if (job.status === "failed") onError(job.error || msg("导入未完成，请重试。"));
        if (job.status === "completed") await onComplete();
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) {
          sessionStorage.removeItem(storageKey); setJobId(""); setProgress(undefined);
          onError(msg("上次导入已结束或连接已重启，请检查文档列表。")); return;
        }
        onError(errorText(error));
        timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [jobId, onComplete, onError, storageKey]);
  const cancel = async () => {
    if (!jobId) return;
    try { await api("job_cancel", { id: jobId }); setProgress({ label: msg("正在取消导入") }); }
    catch (error) { onError(errorText(error)); }
  };
  const label = progress ? t(progress.label) : "";
  const text = progress?.total
    ? t("{stage}（{completed} / {total}）", { stage: label, completed: progress.completed ?? 0, total: progress.total })
    : label;
  return { busy: starting || Boolean(jobId), progress: text, start, cancel, cancellable: Boolean(jobId) };
}
