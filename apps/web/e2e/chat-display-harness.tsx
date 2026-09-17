import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatMessages } from '../src/chat/ChatMessages';
import { ChatQuotesProvider } from '../src/chat/ChatQuotes';
import type { Thread } from '../src/chat/types';
import '../src/styles.css';
import '../src/chat/chat.css';

function Harness() {
  const [thread, setThread] = useState<Thread | null>(null);
  useEffect(() => {
    void fetch('/web/display-fixture.json').then(response => response.json()).then(setThread);
  }, []);
  useEffect(() => {
    const update = (event: Event) => setThread((event as CustomEvent<Thread>).detail);
    window.addEventListener('display-fixture', update);
    return () => window.removeEventListener('display-fixture', update);
  }, []);
  return <ChatQuotesProvider scope={thread?.id ?? null} enabled sending={false}>
    <main className="chat-page" style={{ height: '100vh' }}>
      <div className="chat-conversation">
        <header className="chat-header"><h2>对话展示回归</h2></header>
        <ChatMessages key={thread?.id} thread={thread} />
        <footer style={{ padding: 20 }}><input aria-label="消息" placeholder="输入消息…" /></footer>
      </div>
    </main>
  </ChatQuotesProvider>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
