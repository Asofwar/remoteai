import { useMemo } from "react";
import { guiText } from '../../i18n/guiText';
import { useActivityWindow } from './useActivityWindow';
import type { Item } from "./types";
import { ActivitySummary } from "./ActivityRow";
import { DeferredDetails } from "./DeferredDetails";
import { MessageItem } from "./MessageItem";
import { groupConsecutiveActivities, latestActivity } from "./activityGroups";
import styles from "./styles.module.less";
import activityStyles from "./ActivityRow.module.less";

interface Props { items: Item[]; running: boolean; startedAt?: number | null }

function ActivityGroup({ items, running, startedAt }: Props) {
  const latest = latestActivity(items);
  if (!latest) return null;
  return <div data-activity-group={items[0].id} data-history-anchor>
    <DeferredDetails className={activityStyles.row} status={latest.status}
      summary={<ActivitySummary item={latest} text="" count={items.length} />}>
      {() => <div className={activityStyles.activityList}>{items.map((item) => (
        <div key={item.id} data-message-id={item.id}>
          <MessageItem item={item} startedAt={startedAt} streaming={running && item.status !== "completed"} />
        </div>
      ))}</div>}
    </DeferredDetails>
  </div>;
}

export function WorkItems({ items, running, startedAt }: Props) {
  const window = useActivityWindow(items);
  const groups = useMemo(() => groupConsecutiveActivities(window.items), [window.items]);
  return <div className={styles.workItems}>
    {window.earlier && <button type="button" onClick={window.older}>{guiText("查看更早的活动")}</button>}
    {groups.map((group) => group.activity && group.items.length > 1
    ? <ActivityGroup key={group.key} items={group.items} running={running} startedAt={startedAt} />
    : <div key={group.key} data-message-id={group.items[0].id}>
      <MessageItem item={group.items[0]} startedAt={startedAt}
        streaming={running && group.items[0].status !== "completed"} />
    </div>)}
    {window.later && <div>
      <button type="button" onClick={window.newer}>{guiText("查看后续活动")}</button>
      <button type="button" onClick={window.latest}>{guiText("回到最新活动")}</button>
    </div>}
  </div>;
}
