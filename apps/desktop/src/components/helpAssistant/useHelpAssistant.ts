import { useCallback, useEffect, useRef, useState } from 'react';
import { hasLocalBackend, invoke } from '../../api/backend';
import { subscribeGuiEvent } from '../../pages/codexGui/webEvents';
import type { DashboardPage } from '../dashboard/DashboardNavigation';
import { helpError, messageHistory, MAX_QUESTION_LENGTH, type HelpAnswer, type HelpError,
  type HelpMessage, type HelpStatus, type HelpAvailability } from './types';

const MAX_VISIBLE_MESSAGES = 40;

export function useHelpAssistant(options: { open: boolean; page: DashboardPage }) {
  const [status, setStatus] = useState<HelpStatus>();
  const [error, setError] = useState<HelpError>();
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const statusFlight = useRef(false);
  const generation = useRef(0);
  const nextId = useRef(0);
  const accountRevision = useRef<number>();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);

  const refresh = useCallback(async () => {
    if (statusFlight.current) return;
    statusFlight.current = true;
    setChecking(true);
    try {
      const result: HelpAvailability = hasLocalBackend
        ? await invoke<HelpAvailability>('remote_ai_help_status') : { status: 'installRequired' };
      if (!mounted.current) return;
      if (accountRevision.current !== undefined && accountRevision.current !== result.accountRevision) {
        generation.current++; setMessages([]);
      }
      accountRevision.current = result.accountRevision;
      setStatus(result.status); setError(undefined);
    } catch (failure) {
      if (mounted.current) { setStatus(undefined); setError(helpError(failure)); }
    } finally {
      statusFlight.current = false;
      if (mounted.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!options.open) return;
    void refresh();
    const onFocus = () => { if (!busy.current) void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [options.open, refresh]);

  useEffect(() => {
    if (!options.open || !hasLocalBackend) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void subscribeGuiEvent('codex-gui-account-changed', () => {
      generation.current++;
      setMessages([]);
      setError('accountChanged');
      setStatus(undefined);
      void refresh();
    }).then((unsubscribe) => { if (disposed) unsubscribe(); else stop = unsubscribe; })
      .catch(() => { if (!disposed) setError('unavailable'); });
    return () => { disposed = true; stop?.(); };
  }, [options.open, refresh]);

  const send = async (question = draft) => {
    question = question.trim();
    if (busy.current || status !== 'ready' || !question) return;
    if (Array.from(question).length > MAX_QUESTION_LENGTH) { setError('invalidRequest'); return; }
    busy.current = true;
    const currentGeneration = generation.current;
    setError(undefined); setPending(question); setDraft('');
    try {
      const answer = await invoke<HelpAnswer>('remote_ai_help_ask', {
        request: { question, history: messageHistory(messages), page: options.page,
          accountRevision: accountRevision.current },
      });
      if (!mounted.current) return;
      if (currentGeneration !== generation.current) {
        setDraft(question); setError('accountChanged'); return;
      }
      setMessages((current) => [...current,
        { id: nextId.current++, role: 'user' as const, text: question },
        { id: nextId.current++, role: 'assistant' as const, ...answer },
      ].slice(-MAX_VISIBLE_MESSAGES));
    } catch (failure) {
      if (!mounted.current) return;
      const problem = helpError(failure);
      setError(problem); setDraft(question);
      if (problem === 'accountChanged') void refresh();
      if (['installRequired', 'initializeRequired', 'accountRequired'].includes(problem)) {
        setStatus(problem as HelpStatus);
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending('');
    }
  };

  const clear = () => {
    if (busy.current) return;
    generation.current++; setMessages([]); setDraft(''); setError(undefined);
  };
  return { status, error, messages, draft, setDraft, pending, checking, refresh, send, clear };
}
