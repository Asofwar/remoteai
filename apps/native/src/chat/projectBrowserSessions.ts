import type { ProjectBrowserClient } from '../../../../shared/project-browser/protocol';
import type { DocumentsSnapshot } from '../../../../shared/project-browser/documents';

// Keep drafts in memory for this device connection, including after the modal's WebView is disposed.
const sessions = new WeakMap<ProjectBrowserClient, Map<string, DocumentsSnapshot>>();
export function readBrowserSession(client: ProjectBrowserClient, cwd: string) {
  return sessions.get(client)?.get(cwd);
}
export function saveBrowserSession(client: ProjectBrowserClient, cwd: string, snapshot: DocumentsSnapshot) {
  let projects = sessions.get(client);
  if (!projects) { projects = new Map(); sessions.set(client, projects); }
  projects.set(cwd, snapshot);
}
