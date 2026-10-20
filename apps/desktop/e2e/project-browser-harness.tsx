import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import { DetailsWorkspace } from '../src/pages/codexGui/DetailsWorkspace';
import { LocalProjectBrowser } from '../src/pages/codexGui/LocalProjectBrowser';
import { ProjectBrowserButton } from '../../web/src/chat/projectBrowser/ProjectBrowserButton';
import { ChatTools } from '../../web/src/chat/ChatTools';
import { createGuiToolsClient } from '../../../shared/remote-chat/guiTools';
import type { ProjectBrowserRequest } from '../../../shared/project-browser/protocol';
import { guiApi } from '../src/pages/codexGui/api';
import { browserRequest, browserRoot, savedFiles, causeConflict } from './project-browser-fixture';
import '../src/styles.css';
import 'antd/dist/reset.css';

const params = new URLSearchParams(location.search);
const dark = params.has('dark');
const mode = params.get('mode') ?? 'local';
const client = createGuiToolsClient(<T,>(request: object) => browserRequest<T>(request as ProjectBrowserRequest));
guiApi.request = <T,>(request: object) => browserRequest<T>(request as ProjectBrowserRequest);
Object.assign(window, { savedFiles, causeConflict });
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
document.body.style.minWidth = '0';
localStorage.setItem('codex-switch:language', 'zh');

function App() {
  const [connected, setConnected] = useState(true);
  return <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
    <div style={{ height: '100dvh', background: dark ? '#121614' : '#f5f8f6' }}>
      <DetailsWorkspace selected={null} active>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>聊天</span>
          {mode === 'local' && <LocalProjectBrowser cwd={browserRoot} active connected={connected} />}
          {mode === 'remote' && <ProjectBrowserButton client={client.projectBrowser} cwd="D:/remote"
            active connected={connected} />}
          {mode === 'mobile' && <ChatTools client={client} cwd={browserRoot} active connected={connected} />}
          <button type="button" onClick={() => setConnected(value => !value)}>切换连接</button>
        </div>
      </DetailsWorkspace>
    </div>
  </ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
