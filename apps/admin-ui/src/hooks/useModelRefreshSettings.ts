import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import type { OfficialModelsProps } from "./useOfficialModels";

export interface ModelRefreshSettings { enabled: boolean; intervalMinutes: number; revision: string }
export const MAX_MODEL_REFRESH_MINUTES = 10080;
const ENDPOINT = "/admin/api/official-models/settings";
const noticeStyle = { maxWidth: 400, whiteSpace: "normal" as const };

export function useModelRefreshSettings(api: OfficialModelsProps["api"], zh: boolean) {
  const { message } = App.useApp();
  const [saved, setSaved] = useState<ModelRefreshSettings>();
  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const active = useRef(true);
  const accept = (settings: ModelRefreshSettings) => {
    setSaved(settings); setEnabled(settings.enabled); setIntervalMinutes(settings.intervalMinutes);
  };
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    void api<ModelRefreshSettings>(ENDPOINT).then((settings) => { if (current) accept(settings); })
      .catch(() => {
        if (current) message.error({ content: zh ? "自动更新设置加载失败，请重试。"
          : "Unable to load automatic update settings. Please retry.", style: noticeStyle });
      }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, attempt, message, zh]);

  const valid = intervalMinutes !== null && Number.isInteger(intervalMinutes)
    && intervalMinutes >= 1 && intervalMinutes <= MAX_MODEL_REFRESH_MINUTES;
  const dirty = Boolean(saved && (saved.enabled !== enabled || saved.intervalMinutes !== intervalMinutes));
  const save = async () => {
    if (pending.current || loading || !saved || !valid || !dirty) return;
    pending.current = true; setSaving(true);
    try {
      const settings = await api<ModelRefreshSettings>(ENDPOINT, { method: "PATCH",
        body: JSON.stringify({ enabled, intervalMinutes, revision: saved.revision }) });
      if (!active.current) return;
      accept(settings);
      message.success({ content: zh ? "自动更新设置已保存。" : "Automatic update settings saved.", style: noticeStyle });
    } catch (error) {
      if (active.current) message.error({ content: error instanceof Error ? error.message
        : (zh ? "保存失败，请重试。" : "Unable to save. Please retry."), style: noticeStyle });
    } finally {
      pending.current = false; if (active.current) setSaving(false);
    }
  };
  const changeEnabled = (value: boolean) => {
    setEnabled(value);
    if (!value && !valid && saved) setIntervalMinutes(saved.intervalMinutes);
  };
  return { saved, enabled, setEnabled: changeEnabled, intervalMinutes, setIntervalMinutes,
    loading, saving, valid, dirty, save,
    reload: () => setAttempt((value) => value + 1) };
}
