import { useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import { DetailsWorkspace } from '../src/pages/codexGui/DetailsWorkspace';
import { DetailsContext } from '../src/pages/codexGui/detailsContext';
import { ConversationChangesButton } from '../src/pages/codexGui/ConversationChangesButton';
import { GuiToolbox } from '../src/pages/codexGui/GuiToolbox';
import { filePreviewApi } from '../src/pages/codexGui/filePreview/api';
import { useThemeMode } from '../src/hooks/useThemeMode';
import { ChatDetailsWorkspace } from '../../web/src/chat/ChatDetailsWorkspace';
import { ChatFileContext } from '../../web/src/chat/ChatFileLink';
import type { FilePreviewContext } from '../../web/src/chat/ChatFilePreview';
import { ChatTools } from '../../web/src/chat/ChatTools';
import { ChatTerminal } from '../../web/src/chat/ChatTerminal';
import { ProjectBrowserButton } from '../../web/src/chat/projectBrowser/ProjectBrowserButton';
import { AdaptiveSheet } from '../../web/src/components/AdaptiveSheet';
import { WorkspaceDrawerContext } from '../../../shared/chat/workspaceDrawer';
import { createGuiToolsClient } from '../../../shared/remote-chat/guiTools';
import { createAsyncGitFixture } from '../../../shared/remote-chat/testing/gitFixture';
import { browserRequest, browserRoot } from './project-browser-fixture';
import type { ProjectBrowserRequest } from '../../../shared/project-browser/protocol';
import '../src/styles.css';
import '../../web/src/chat/git/git.css';
import '../../web/src/chat/chat.css';
import 'antd/dist/reset.css';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'local';
const dark = params.has('dark');
const client = createGuiToolsClient(<T,>(request: object) => browserRequest<T>(request as ProjectBrowserRequest));
client.git = createAsyncGitFixture();
let gitReads = 0;
const readChanges = client.git.changes;
client.git.changes = async cwd => { document.body.dataset.gitReads = String(++gitReads); return readChanges(cwd); };
let terminalOpens = 0;
client.terminal.list = async () => [];
client.terminal.open = async () => {
  document.body.dataset.terminalOpens = String(++terminalOpens);
  return { id: 'retained-terminal', cwd: browserRoot, shell: 'bash' };
};
client.terminal.read = async () => ({ found: true, cursor: 0, truncated: false, events: [] });
client.terminal.resize = client.terminal.write = client.terminal.close = async () => {};
filePreviewApi.open = async target => ({ ...target, sessionId: 'preview', name: 'README.md',
  kind: 'markdown', text: '# Retained preview', url: '' });
filePreviewApi.close = async () => { document.body.dataset.previewClosed = 'true'; };
const remoteFiles: FilePreviewContext = {
  ready: true, threadId: 'thread', client: {
    open: async () => { throw new Error('Unexpected download'); },
    read: async () => { throw new Error('Unexpected download'); }, close: async () => {},
  }, load: async (_thread, path) => ({ path, text: '# Retained preview' }),
};
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
document.body.style.minWidth = '0';
localStorage.setItem('codex-switch:language', 'zh');

function Tools() {
  const details = useContext(DetailsContext)!;
  const workspace = useContext(WorkspaceDrawerContext)!;
  const [review, setReview] = useState(false);
  return <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <span>对话</span><ConversationChangesButton />
    <button onClick={() => { void (details.openRemoteFile ?? details.openFile)({
      path: 'C:/project/README.md', threadId: 'thread',
    }); }}>打开预览</button>
    <ProjectBrowserButton client={client.projectBrowser} cwd={browserRoot} connected active desktopStyle />
    {mode === 'web' ? <ChatTools client={client} cwd={browserRoot} connected active />
      : <GuiToolbox git={client.git} cwd={browserRoot} deviceName="测试电脑" connected active trigger="git" />}
    <ChatTerminal client={client.terminal} cwd={browserRoot} active connected />
    <button onClick={() => { setReview(true); workspace.tabs.open('review'); }}>打开任务验收</button>
    {review && <AdaptiveSheet open title="任务验收" tabId="review" presentation="drawer" onClose={() => setReview(false)}>
      <textarea aria-label="验收草稿" defaultValue="" />
    </AdaptiveSheet>}
  </div>;
}
function App() {
  useThemeMode(dark ? 'dark' : 'light');
  const content = mode === 'local' ? <DetailsWorkspace selected="thread" active><Tools /></DetailsWorkspace>
    : <ChatFileContext.Provider value={remoteFiles}>
      <ChatDetailsWorkspace selected="thread" active enabled><Tools /></ChatDetailsWorkspace>
    </ChatFileContext.Provider>;
  return <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}>
    <div style={{ height: '100dvh' }}>{content}</div>
  </ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
