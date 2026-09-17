import { useEffect, useState } from 'react';
import type { Turn } from './types';
import { formatTurnDuration, SECOND_MS, turnElapsedMs } from '../../../desktop/src/pages/codexGui/turnTiming';
import type { TurnEntry } from '../../../../shared/chat/turnPresentation';

/** Keep the turn status before its response, including interrupted turns without timing data. */
export function desktopTimeline(entries: TurnEntry[]): TurnEntry[] {
  const seen = new Set<string>();
  return entries.flatMap(entry => {
    if (seen.has(entry.turn.id) || (entry.kind === 'message' && entry.item.type === 'userMessage')) return [entry];
    seen.add(entry.turn.id);
    if (entry.kind === 'work') return [{ ...entry, timed: true }];
    if (entry.kind === 'duration' || entry.turn.status !== 'interrupted') return [entry];
    return [{ id: `${entry.turn.id}:duration`, kind: 'duration', turn: entry.turn }, entry];
  });
}

export function ChatTurnTiming({ turn, fallback = '' }: { turn: Turn; fallback?: string }) {
  const [now, setNow] = useState(Date.now);
  const running = turn.status === 'inProgress';
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => window.clearInterval(timer);
  }, [turn.id, running]);
  const elapsed = turnElapsedMs(turn, now);
  if (turn.status === 'interrupted') return <>已停止生成{elapsed != null && ` · 用时 ${formatTurnDuration(elapsed)}`}</>;
  if (elapsed == null) return <>{fallback}</>;
  return <>{running ? '已处理' : '用时'} {formatTurnDuration(elapsed)}</>;
}
