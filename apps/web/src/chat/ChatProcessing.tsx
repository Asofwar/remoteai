import type { ChatProcessingProps } from '../../../../shared/remote-chat/client/useProcessingStatus';
import { useProcessingSeconds } from '../../../../shared/remote-chat/client/useProcessingSeconds';
import { PROCESSING_LABELS } from '../../../desktop/src/pages/codexGui/processing';
import { formatTurnDuration } from './formatters';
import { t, useLanguage } from '../i18n';

export function ChatProcessing(props: ChatProcessingProps) {
  useLanguage();
  const current = props.processing?.turnId === props.turn.id ? props.processing : undefined;
  const seconds = useProcessingSeconds(props.turn, props.active, current?.startedAtMs);
  const phase = current?.phase ?? 'request';
  const label = `${t(PROCESSING_LABELS[phase])} · ${formatTurnDuration(seconds * 1000)}`;
  return <p role="status" data-processing-phase={phase} className="chat-processing chat-processing-status chat-muted">
    <span className="chat-spinner" aria-hidden="true" />{label}
  </p>;
}
