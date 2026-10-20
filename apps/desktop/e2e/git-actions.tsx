import { createRoot } from 'react-dom/client';
import { createAsyncGitFixture } from '../../../shared/remote-chat/testing/gitFixture';
import { useRemoteGit } from '../../../shared/remote-chat/useRemoteGit';
import { GitToolbar } from '../../web/src/chat/git/GitToolbar';
import { GitChanges } from '../../web/src/chat/git/GitChanges';
import { GitFileActionDialog } from '../../web/src/chat/git/GitFileActionDialog';
import { useGitTheme } from '../../web/src/chat/git/gitTheme';
import '../../web/src/chat/git/git.css';

const client = createAsyncGitFixture();
if (new URLSearchParams(location.search).has('longBranch')) {
  const branch = `feature/${'long-branch-name-'.repeat(6)}git-actions`;
  const changes = client.changes;
  const repository = client.repository;
  client.changes = async cwd => ({ ...await changes(cwd), branch });
  client.repository = async cwd => ({ ...await repository(cwd), upstream: `origin/${branch}` });
}

function Fixture() {
  const panel = useRemoteGit({ client, cwd: '/demo/project', connected: true, active: true, refreshInterval: 1000 });
  const theme = useGitTheme();
  return <div className="chat-git" style={{ ...theme, height: '100vh' }}>
    <GitToolbar panel={panel} connected />
    {panel.notice && <p role="status" className="git-notice">{panel.notice}</p>}
    <GitChanges panel={panel} connected />
    {panel.fileAction && <GitFileActionDialog panel={panel} connected />}
  </div>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
