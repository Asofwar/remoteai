import { useEffect, useState } from "react";
import { invoke } from "../../api/backend";
import type { ContextSettings } from "../../../../../shared/remote-chat/contextSettings";
import { formatCompactTokenCount } from "../../utils/tokenContext";
import styles from "./ContextUsageButton.module.less";

export function ContextCapacityHint({ threadId, open }: { threadId?: string | null; open: boolean }) {
  const [settings, setSettings] = useState<ContextSettings | null>(null);
  useEffect(() => {
    setSettings(null);
    if (!open || !threadId) return;
    let cancelled = false;
    void invoke<ContextSettings>("codex_gui_context_settings", { threadId }).then((value) => {
      if (!cancelled) setSettings(value);
    }).catch(() => { /* The settings dialog provides retry; usage remains available. */ });
    return () => { cancelled = true; };
  }, [threadId, open]);
  if (settings?.capacity == null) return null;
  return <div className={styles.hint}>
    <div>对话设置：{formatCompactTokenCount(settings.capacity, "zh")} Token</div>
    <div>可用容量受模型上限和预留空间影响，下次回复后更新。</div>
  </div>;
}
