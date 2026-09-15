import { Fragment, memo, useMemo } from "react";
import type { Item, Turn } from "./types";
import type { SubmitMessageEdit } from "./messageEditContent";
import { MessageItem } from "./MessageItem";
import { TurnDuration } from "./TurnDuration";
import { TurnPlan } from "./TurnPlan";
import { TurnDiff } from "./TurnDiff";
import { changedFiles, parseDiff } from "./diff";
import { visibleContinuationItems } from "./continuation";
import styles from "./styles.module.less";
import { GeneratedImages } from "./GeneratedImages";
import { RequestErrorNotice } from "./RequestErrorNotice";
import { hasVisibleProcessContent, TurnProcess } from "./TurnProcess";
import { groupTurnItems } from "../../../../../shared/chat/turnGroups";
export { groupTurnItems } from "../../../../../shared/chat/turnGroups";

export const TurnMessage = memo(function TurnMessage({ turn, running, active, followsInterruption = false,
  editableItemId, onEdit, editDisabled, threadId, visibleItems = turn.items }: {
  turn: Turn; running: boolean; active: boolean; followsInterruption?: boolean;
  editableItemId?: string; onEdit?: SubmitMessageEdit; editDisabled?: boolean;
  threadId?: string;
  visibleItems?: Item[];
}) {
  const groups = useMemo(() => {
    const visible = new Set(visibleItems.map((item) => item.id));
    return groupTurnItems(followsInterruption ? visibleContinuationItems(turn.items) : turn.items)
      .map((group) => ({ ...group, key: group.items[0].id, items: group.items.filter((item) =>
        visible.has(item.id) && (group.type !== "work" || hasVisibleProcessContent(item))) }))
      .filter((group) => group.items.length > 0);
  }, [turn.items, followsInterruption, visibleItems]);
  const netFiles = useMemo(() => parseDiff(turn.diff ?? ""), [turn.diff]);
  const files = useMemo(() => turn.diff ? netFiles : turn.items
    .filter((item) => item.type === "fileChange" && !["declined", "failed", "inProgress"].includes(item.status ?? ""))
    .flatMap((item) => changedFiles(item.changes ?? [])), [turn.diff, turn.items, netFiles]);
  const responseIndex = groups.findIndex((group) => group.items[0].type !== "userMessage");
  return <div className={styles.turn} data-turn-id={turn.id}>
    {groups.map((group, index) => <Fragment key={group.key}>
      {index === responseIndex && group.type !== "work"
        && <TurnDuration turn={turn} running={running} active={active} />}
      {group.type === "work" ? <TurnProcess turn={turn} items={group.items} running={running}
        active={active} timed={index === responseIndex} />
        : <div className={styles.messageEntry} data-message-id={group.items[0].id}>
        <MessageItem item={group.items[0]} startedAt={turn.startedAt}
        onEdit={group.items[0].id === editableItemId ? onEdit : undefined} editDisabled={editDisabled}
        streaming={running && group.items[0].status !== "completed"} /></div>}
    </Fragment>)}
    {responseIndex === -1 && !running && <TurnDuration turn={turn} running={running} active={active} />}
    <GeneratedImages items={visibleItems} />
    <TurnPlan turn={turn} />
    {files.length > 0 && <TurnDiff files={files} title={turn.diff ? "本轮修改" : "文件修改记录"}
      threadId={threadId} turnId={turn.id}
      disabled={running || turn.status === "inProgress" || Boolean(editDisabled)} />}
    <RequestErrorNotice turn={turn} />
  </div>;
});
