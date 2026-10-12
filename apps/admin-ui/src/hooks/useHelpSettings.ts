import { useEffect, useRef, useState } from "react";
import { App } from "antd";
import type { OfficialModelsProps } from "./useOfficialModels";

export interface HelpSettings { model: string; systemPrompt: string; revision: string }
const ENDPOINT = "/admin/api/help-assistant";
const noticeStyle = { maxWidth: 400, whiteSpace: "normal" as const };

export function useHelpSettings(api: OfficialModelsProps["api"], zh: boolean) {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<HelpSettings>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    void api<HelpSettings>(ENDPOINT).then((settings) => { if (current) setDraft(settings); })
      .catch(() => {
        if (current) message.error({ content: zh ? "助手设置加载失败，请重试。"
          : "Unable to load assistant settings. Please retry.", style: noticeStyle });
      }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [api, attempt, message, zh]);

  const save = async () => {
    if (pending.current || loading || !draft) return;
    pending.current = true; setSaving(true);
    try {
      const settings = await api<HelpSettings>(ENDPOINT, { method: "PATCH", body: JSON.stringify(draft) });
      if (!active.current) return;
      setDraft(settings);
      message.success({ content: zh ? "助手设置已保存，下次提问时生效。"
        : "Assistant settings saved. They apply to the next question.", style: noticeStyle });
    } catch (error) {
      if (active.current) message.error({ content: error instanceof Error ? error.message
        : (zh ? "保存失败，请重试。" : "Unable to save. Please retry."), style: noticeStyle });
    } finally {
      pending.current = false; if (active.current) setSaving(false);
    }
  };
  return { draft, setDraft, loading, saving, save, reload: () => setAttempt((value) => value + 1) };
}
