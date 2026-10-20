import { createProjectBrowserClient } from '../../../../../shared/project-browser/protocol';
import { ProjectBrowserButton } from '../../../../web/src/chat/projectBrowser/ProjectBrowserButton';
import { guiApi } from './api';
import styles from './WorkspacePicker.module.less';

const client = createProjectBrowserClient(request => guiApi.request(request));

export function LocalProjectBrowser(props: { cwd: string; active: boolean; connected: boolean }) {
  return <ProjectBrowserButton {...props} client={client} className={styles.trigger} desktopStyle />;
}
