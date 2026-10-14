import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatConnectionInfo } from '../src/chat/ChatConnectionInfo';
import { ChatController } from '../../../shared/remote-chat/client/controller';
import { initialChatState } from '../../../shared/remote-chat/client/types';
import { HOST_IDENTITY_CHANGED } from '../../../shared/remote-chat/trustedHost';
import '../src/styles.css';
import '../src/chat/chat.css';

function Harness() {
  const [result, setResult] = useState('');
  const [controller] = useState(() => new ChatController(() => ({
    start: () => undefined, stop: () => undefined, request: async <T,>() => ({}) as T,
    retryNow: () => setResult(value => value || 'reconnected'),
    confirmHostIdentity: async fingerprint => { setResult(`verified:${fingerprint}`); },
  })));
  const changed = new URLSearchParams(location.search).has('changed');
  const state = { ...initialChatState(), retryAt: Date.now() + 30_000,
    error: changed ? HOST_IDENTITY_CHANGED : '' };
  const device = { deviceId: 'long-name', name: '开发电脑-长名称用于检查操作始终可见-'.repeat(16),
    online: true, platform: 'windows' };
  return <main className="chat-page" style={{ minHeight: '100dvh' }}>
    <section className="chat-conversation">
      <header className="chat-header">
        <button className="chat-back" type="button" aria-label="打开聊天列表">☰</button>
        <div className="chat-grow"><h2>聊天</h2>
          <ChatConnectionInfo state={state} controller={controller} device={device} active chooseDevice={() => {}} />
        </div>
        <div className="chat-header-tools"><button className="chat-back" type="button" aria-label="工具">⋯</button></div>
      </header>
      <output data-testid="result">{result}</output>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
