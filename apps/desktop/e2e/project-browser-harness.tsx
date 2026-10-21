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
import { ProjectBrowser } from '../../../shared/project-browser/ProjectBrowser';
import type { BrowserHost } from '../../../shared/project-browser/entryActions';
import '../src/styles.css';
import 'antd/dist/reset.css';

const params = new URLSearchParams(location.search);
const dark = params.has('dark');
const mode = params.get('mode') ?? 'local';
const client = createGuiToolsClient(<T,>(request: object) => browserRequest<T>(request as ProjectBrowserRequest));
guiApi.request = <T,>(request: object) => browserRequest<T>(request as ProjectBrowserRequest);
Object.assign(window, { savedFiles, causeConflict });
const browserActions: { path: string; action: string }[] = [];
const fixtureHost: BrowserHost = {
  copyPath: async path => { browserActions.push({ path, action: 'copyPath' }); },
  open: async (entry, action) => { browserActions.push({ path: entry.path, action }); },
};
Object.assign(window, { browserActions });
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
document.body.style.minWidth = '0';
localStorage.setItem('codex-switch:language', 'zh');
localStorage.setItem('codex-switch:gui-details-width', '960');

function App() {
  const [connected, setConnected] = useState(true);
  const [project, setProject] = useState(browserRoot);
  if (mode === 'standalone') return <div style={{ height: '100dvh' }}>
    <ProjectBrowser client={client.projectBrowser} cwd={project} connected={connected} t={text => text}
      host={fixtureHost} onClose={() => {}} preferences={{ delay: 0, change: () => {} }} />
  </div>;
  return <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
    <div style={{ height: '100dvh', background: dark ? '#121614' : '#f5f8f6' }}>
      <DetailsWorkspace selected={null} active>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>聊天</span>
          {mode === 'local' && <LocalProjectBrowser cwd={project} active connected={connected} />}
          {mode === 'remote' && <ProjectBrowserButton client={client.projectBrowser} cwd="D:/remote"
            active connected={connected} />}
          {mode === 'mobile' && <ChatTools client={client} cwd={browserRoot} active connected={connected} />}
          <button type="button" onClick={() => setConnected(value => !value)}>切换连接</button>
          <button type="button" onClick={() => setProject(value => value === browserRoot ? 'C:/other' : browserRoot)}>
            切换项目</button>
        </div>
      </DetailsWorkspace>
    </div>
  </ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
