import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatProfileMenu } from '../src/chat/ChatProfileMenu';
import { ChatSidebar } from '../src/chat/ChatSidebar';
import { useDesktopLayout } from '../src/useDesktopLayout';
import type { GuiAccountsClient } from '../../../shared/remote-chat/guiAccounts';
import { createGuiToolsClient } from '../../../shared/remote-chat/guiTools';
import '../src/styles.css';
import '../src/chat/chat.css';

const client: GuiAccountsClient = {
  read: async () => (await fetch('/web/accounts-fixture.json')).json(),
  select: async selection => selection,
  subscribe: () => () => {},
};
const guiTools = createGuiToolsClient(async () => { throw new Error('Unused in this fixture'); });

function Harness() {
  const desktop = useDesktopLayout();
  const [open, setOpen] = useState(false);
  return <main className="chat-page" style={{ height: '100vh' }}>
    <div className="chat-conversation"><header className="chat-header">
      <button onClick={() => setOpen(true)}>打开聊天列表</button><h2>聊天仍可使用</h2>
    </header></div>
    <ChatSidebar desktop={desktop} open={open} onClose={() => setOpen(false)}>
      <button onClick={() => setOpen(false)}>保留的聊天</button>
      <ChatProfileMenu client={client} ready active={desktop || open} guiTools={guiTools}
        running={false} deviceName="测试电脑" email="test@example.test" chooseDevice={() => {}}
        openTokenSummary={() => {}} />
    </ChatSidebar>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
