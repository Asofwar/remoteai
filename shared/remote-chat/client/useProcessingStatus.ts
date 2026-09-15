import { PROCESSING_LABELS } from '../../../apps/desktop/src/pages/codexGui/processing';
import { formatTurnDuration, SECOND_MS } from '../../../apps/desktop/src/pages/codexGui/turnTiming';
import type { ChatState, Turn } from './types';
import { useProcessingSeconds } from './useProcessingSeconds';

export interface ChatProcessingProps {
  turn: Turn;
  active: boolean;
  processing?: ChatState['processing'];
}

export function useProcessingStatus({ turn, active, processing }: ChatProcessingProps) {
  const current = processing?.turnId === turn.id ? processing : undefined;
  const seconds = useProcessingSeconds(turn, active, current?.startedAtMs);
  const phase = current?.phase ?? 'request';
  return { phase, label: `${PROCESSING_LABELS[phase]} · ${formatTurnDuration(seconds * SECOND_MS)}` };
}
