import { invoke } from '../../api/backend';
import { subscribeGuiEvent } from '../../pages/codexGui/webEvents';
import type { DashboardPage } from '../dashboard/DashboardNavigation';
import type { HelpAnswer, HelpContent, HelpMessage } from './types';

interface HelpRequest {
  question: string;
  images?: string[];
  history: Pick<HelpMessage, 'role' | 'text' | 'images'>[];
  page: DashboardPage;
  accountRevision?: number;
}

interface HelpProgress extends HelpContent { requestId: string }

export async function askHelp(request: HelpRequest, onProgress: (text: string) => void, signal: AbortSignal) {
  const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
  const unsubscribe = await subscribeGuiEvent<HelpProgress>('remote-ai-help-progress', (progress) => {
    if (progress.requestId === requestId && typeof progress.text === 'string') onProgress(progress.text);
  });
  let subscribed = true;
  const stop = () => { if (subscribed) { subscribed = false; unsubscribe(); } };
  if (signal.aborted) { stop(); throw new Error('answerFailed'); }
  signal.addEventListener('abort', stop, { once: true });
  try {
    return await invoke<HelpAnswer>('remote_ai_help_ask', { request: { ...request, requestId } });
  } finally {
    signal.removeEventListener('abort', stop);
    stop();
  }
}
