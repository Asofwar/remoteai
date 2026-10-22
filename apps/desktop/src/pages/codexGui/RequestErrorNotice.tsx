import { guiText } from "../../i18n/guiText";
import { CircleAlert, ChevronDown } from "lucide-react";
import type { Turn } from "./types";
import { isModelCapacityError, requestErrorDetails } from "./requestError";
import { CapacityErrorNotice, type CapacityRetryControl } from "./CapacityErrorNotice";
import { DeferredDetails } from "./DeferredDetails";
import { requestErrorPosition, turnRequestErrors, type TurnRequestError } from "./turnRequestErrors";
import { TurnRetryButton } from "./TurnRetryButton";
import styles from "./RequestErrorNotice.module.less";

function noticeMessage(turn: Turn, record: TurnRequestError): string {
  if (!record.willRetry) return guiText("本次回复遇到问题，已中断。");
  if (turn.status === "completed") return guiText("本次回复曾出现连接中断，现已恢复。");
  if (turn.status === "interrupted" || turn.status === "failed") return guiText("本次回复曾出现连接中断。");
  const resumed = turn.items.slice(requestErrorPosition(turn, record))
    .some((item) => item.type !== "userMessage" && item.type !== "modelChange");
  if (resumed) return guiText("本次回复曾出现连接中断，现已恢复。");
  return guiText("连接暂时中断，Codex 正在重试…");
}

export function RequestErrorNotice({ turn, record, count = 1, retry, onCancelRetry }: {
  turn: Turn; record: TurnRequestError; count?: number;
} & CapacityRetryControl) {
  const { error } = record;
  const action = !record.willRetry && record.id === turnRequestErrors(turn).at(-1)?.id
    ? <TurnRetryButton turnId={turn.id} /> : null;
  if (isModelCapacityError(error)) return <CapacityErrorNotice retry={retry} onCancelRetry={onCancelRetry}
    action={action} />;
  const details = error ? requestErrorDetails(error) : "";
  const message = noticeMessage(turn, record);
  if (!details) return <div className={styles.notice}><span role="status">{message}</span>{action}</div>;
  return <div className={styles.notice} data-request-error={record.id}>
    <DeferredDetails className={styles.errorRow} summary={
      <summary className={styles.summary} aria-label={guiText("查看报错详情")}>
        <CircleAlert size={15} aria-hidden="true" />
        <span className={styles.preview} role="status">{details.replace(/\s+/g, " ")}</span>
        {count > 1 && <span className={styles.count}>×{count}</span>}
        <ChevronDown className={styles.toggle} size={15} aria-hidden="true" />
      </summary>}>
      {() => <div className={styles.details}><div>{message}</div><pre>{details}</pre></div>}
    </DeferredDetails>{action}
  </div>;
}
