import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Toast } from '../components/AppToast';
import { appendQuote, clearSubmittedQuotes, quoteKey, type ChatQuote } from './replyQuotes';

interface QuotesContext {
  active: boolean;
  enabled: boolean;
  quotes: ChatQuote[];
  add: (quote: ChatQuote) => boolean;
  remove: (key: string) => void;
  clearSubmitted: (quotes: ChatQuote[]) => void;
}

const Context = createContext<QuotesContext | null>(null);
export const QuoteSourceContext = createContext<{
  messageId: string; role: ChatQuote['role']; onQuote?: () => void;
} | null>(null);

/** Scope quotes without remounting the composer during the first send of a new conversation. */
export function ChatQuotesProvider({ children, active, enabled, scope }: {
  children: ReactNode; active: boolean; enabled: boolean; scope: string | null;
}) {
  const [state, setState] = useState<{ scope: string | null; quotes: ChatQuote[] }>({ scope, quotes: [] });
  const quotes = state.scope === scope ? state.quotes : [];
  useEffect(() => {
    setState((value) => value.scope === scope ? value : { scope, quotes: [] });
  }, [scope]);
  const current = useRef(quotes);
  current.current = quotes;
  const add = useCallback((quote: ChatQuote) => {
    if (!enabled) return false;
    const result = appendQuote(current.current, quote);
    if (result.error) { Toast.fail(result.error); return false; }
    current.current = result.quotes;
    setState({ scope, quotes: result.quotes });
    return true;
  }, [enabled, scope]);
  return <Context.Provider value={{ active, enabled, quotes, add,
    remove: (key) => setState((value) => value.scope === scope
      ? { scope, quotes: value.quotes.filter((quote) => quoteKey(quote) !== key) } : value),
    clearSubmitted: (submitted) => setState((value) => value.scope === scope
      ? { scope, quotes: clearSubmittedQuotes(value.quotes, submitted) } : value),
  }}>{children}</Context.Provider>;
}

export function useChatQuotes() { return useContext(Context); }
