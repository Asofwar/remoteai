import { useActivityWindow } from './useActivityWindow';
import type { Item } from "./types";
import { ActivitySummary } from "./ActivityRow";
import { DeferredDetails } from "./DeferredDetails";
import { MessageItem } from "./MessageItem";
import { latestActivity } from "./activityGroups";
import styles from "./styles.module.less";
import activityStyles from "./ActivityRow.module.less";

interface Props { items: Item[]; running: boolean; startedAt?: number | null }

function ActivityGroup({ items, visible, running, startedAt }: Props & { visible: Item[] }) {
  const latest = latestActivity(items);
  if (!latest) return null;
  return <div data-activity-group={items[0].id} data-history-anchor>
    <DeferredDetails className={activityStyles.row} status={latest.status}
      summary={<ActivitySummary item={latest} text="" count={items.length} />}>
      {() => <div className={activityStyles.activityList}>{visible.map((item) => (
        <div key={item.id} data-message-id={item.id}>
          <MessageItem item={item} startedAt={startedAt} streaming={running && item.status !== "completed"} />
        </div>
      ))}</div>}
    </DeferredDetails>
  </div>;
}

export function WorkItems({ items, running, startedAt }: Props) {
  const window = useActivityWindow(items);
  return <div ref={window.root} className={styles.workItems}>
    {window.groups.map((group) => group.activity && group.items.length > 1
    ? <ActivityGroup key={group.key} items={group.items} visible={group.visible}
      running={running} startedAt={startedAt} />
    : <div key={group.key} data-message-id={group.items[0].id}>
      <MessageItem item={group.items[0]} startedAt={startedAt}
        streaming={running && group.items[0].status !== "completed"} />
    </div>)}
  </div>;
}
