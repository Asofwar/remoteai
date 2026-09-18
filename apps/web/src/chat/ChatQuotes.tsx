import { t, useLanguage } from '../i18n';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Quote, X } from 'lucide-react';
import { Toast } from 'antd-mobile';
import { appendQuote, clearSubmittedQuotes, quoteKey, type ChatQuote } from '../../../../shared/chat/replyQuotes';

interface QuotesContext {
  quotes: ChatQuote[];
  add: (quote: ChatQuote) => void;
  remove: (quote: ChatQuote) => void;
  clear: (quotes: ChatQuote[]) => void;
}
const Context = createContext<QuotesContext | null>(null);
export const useChatQuotes = () => useContext(Context);

export function ChatQuotesProvider({ scope, children, sending, enabled }: {
  scope: string | null; children: ReactNode; sending: boolean; enabled: boolean;
}) {
  useLanguage();
  const [quotes, setQuotes] = useState<ChatQuote[]>([]);
  const previous = useRef(scope);
  useEffect(() => {
    if (previous.current === scope) return;
    const creating = previous.current === null && sending;
    previous.current = scope;
    if (!creating) setQuotes([]);
  }, [scope, sending]);
  const add = (quote: ChatQuote) => {
    const result = appendQuote(quotes, quote);
    if (result.error) Toast.show({ content: result.error });
    else setQuotes(result.quotes);
  };
  return <Context.Provider value={enabled ? { quotes, add,
    remove: quote => setQuotes(current => current.filter(item => quoteKey(item) !== quoteKey(quote))),
    clear: submitted => setQuotes(current => clearSubmittedQuotes(current, submitted)) } : null}>
    {children}</Context.Provider>;
}

export function ChatQuoteButton({ messageId, text, role, onQuote }: ChatQuote & { onQuote?: () => void }) {
  useLanguage();
  const context = useChatQuotes();
  if (!context || !text.trim()) return null;
  return <button type="button" className="chat-text-action" aria-label={t("引用回复")}
    onMouseDown={event => event.preventDefault()} onClick={() => {
      const selection = window.getSelection()?.toString().trim();
      context.add({ messageId, text: selection && text.includes(selection) ? selection : text, role });
      onQuote?.();
    }}><Quote size={15} /><span>{t("引用")}</span></button>;
}

export function ComposerQuotes({ disabled }: { disabled: boolean }) {
  useLanguage();
  const context = useChatQuotes();
  return <div className="chat-composer-capsules">{context?.quotes.map(quote =>
    <span className="chat-capsule" key={quoteKey(quote)}><Quote size={15} />
      <span title={quote.text}>{quote.text}</span><button type="button" aria-label={t("移除引用")} disabled={disabled}
        onClick={() => context.remove(quote)}><X size={14} /></button></span>)}</div>;
}
