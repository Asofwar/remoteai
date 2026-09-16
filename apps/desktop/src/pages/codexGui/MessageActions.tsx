import { Button, Tooltip } from "antd";
import { Split } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { SECOND_MS } from "./turnTiming";
import styles from "./MessageActions.module.less";

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function MessageActions({ text, completedAt, onFork, forkDisabled }: {
  text: string; completedAt?: number | null; onFork?: () => void; forkDisabled?: boolean;
}) {
  const date = completedAt == null ? null : new Date(completedAt * SECOND_MS);
  const timestamp = date && Number.isFinite(date.getTime()) ? date : null;
  return <div className={styles.actions}>
    <CopyButton text={text} />
    <Tooltip title="分支到新聊天" styles={{ root: { maxWidth: 400 } }}>
      <Button type="text" size="small" aria-label="分支到新聊天" disabled={!onFork || forkDisabled}
        icon={<Split size={14} />} onClick={onFork} />
    </Tooltip>
    {timestamp && <time className={styles.timestamp} dateTime={timestamp.toISOString()}>
      {timeFormatter.format(timestamp)}
    </time>}
  </div>;
}
