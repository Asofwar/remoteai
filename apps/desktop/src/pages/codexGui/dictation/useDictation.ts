import { useEffect, useRef, useState } from 'react';
import { subscribeGuiEvent } from '../webEvents';
import { dictationClient, recordingError } from './client';
import { startRecording, type Recording } from './recording';

type Phase = 'idle' | 'preparing' | 'recording' | 'transcribing' | 'error';
interface Operation {
  abort: AbortController; sessionId?: string; recording?: Recording; audio?: Blob; uploading?: boolean;
}
interface View { phase: Phase; error?: string; started?: number; canRetry?: boolean }
interface Options { active: boolean; onText: (text: string) => void; onBusyChange: (busy: boolean) => void }
const IDLE: View = { phase: 'idle' };

export function useDictation({ active, onText, onBusyChange }: Options) {
  const [view, setView] = useState<View>(IDLE);
  const current = useRef<Operation>();
  const callbacks = useRef({ onText, onBusyChange });
  callbacks.current = { onText, onBusyChange };
  const change = (next: View) => {
    callbacks.current.onBusyChange(['preparing', 'recording', 'transcribing'].includes(next.phase));
    setView(next);
  };
  const cancelOperation = () => {
    const operation = current.current;
    current.current = undefined;
    if (!operation) return;
    operation.abort.abort();
    operation.recording?.cancel();
    if (operation.sessionId) {
      // Cleanup is best effort; the backend also expires abandoned sessions.
      void dictationClient.cancel(operation.sessionId).catch(() => undefined);
    }
  };
  const cancel = () => { cancelOperation(); change(IDLE); };
  const valid = (operation: Operation) => current.current === operation && !operation.abort.signal.aborted;
  const transcribe = async (operation: Operation) => {
    if (!operation.audio || !operation.sessionId || operation.uploading || !valid(operation)) return;
    operation.uploading = true;
    change({ phase: 'transcribing' });
    try {
      const { text } = await dictationClient.transcribe(operation.sessionId, operation.audio);
      if (!valid(operation)) return;
      current.current = undefined;
      callbacks.current.onText(text);
      change(IDLE);
    } catch (error) {
      if (valid(operation)) change({ phase: 'error', error: recordingError(error), canRetry: true });
    } finally { operation.uploading = false; }
  };
  const start = async () => {
    if (current.current) return;
    const operation: Operation = { abort: new AbortController() };
    current.current = operation;
    change({ phase: 'preparing' });
    try {
      const { sessionId } = await dictationClient.prepare();
      operation.sessionId = sessionId;
      if (!valid(operation)) {
        void dictationClient.cancel(sessionId).catch(() => undefined);
        return;
      }
      operation.recording = await startRecording(operation.abort.signal);
      // A cancelled permission prompt may return after this component has gone away.
      if (!valid(operation)) { operation.recording.cancel(); return; }
      change({ phase: 'recording', started: Date.now() });
      operation.audio = await operation.recording.result;
      operation.recording = undefined;
      await transcribe(operation);
    } catch (error) {
      if (!valid(operation)) return;
      cancelOperation();
      change({ phase: 'error', error: recordingError(error) });
    }
  };
  useEffect(() => {
    if (!active) { cancel(); return; }
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeGuiEvent('codex-gui-account-changed', () => {
      if (!disposed) cancel();
    }).then((stop) => { if (disposed) stop(); else unsubscribe = stop; })
      .catch(() => undefined); // The backend independently checks the pinned account revision.
    return () => {
      disposed = true; unsubscribe?.(); cancelOperation();
      callbacks.current.onBusyChange(false);
    };
    // Lifecycle is scoped to the keyed composer and its visibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return {
    ...view, cancel, start,
    stop: () => current.current?.recording?.stop(),
    retry: () => { if (current.current && view.phase === 'error') void transcribe(current.current); },
  };
}
