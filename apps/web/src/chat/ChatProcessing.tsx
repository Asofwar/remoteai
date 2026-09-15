import { useProcessingStatus, type ChatProcessingProps } from '../../../../shared/remote-chat/client/useProcessingStatus';

export function ChatProcessing(props: ChatProcessingProps) {
  const { label, phase } = useProcessingStatus(props);
  return <p role="status" data-processing-phase={phase} className="chat-processing chat-processing-status chat-muted">
    <span className="chat-spinner" aria-hidden="true" />{label}
  </p>;
}
