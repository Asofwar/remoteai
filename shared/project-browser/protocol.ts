import type { ProjectFilesResponse } from '../remote-chat/projectFiles';
import type { DownloadClient } from '../remote-chat/downloads';
import type { EntryChange, EntryRequest } from './entryActions';

export const PROJECT_FILE_LIMIT = 2 * 1024 * 1024;

export interface ProjectFileTarget { cwd: string; path: string }
export interface ProjectFileSave extends ProjectFileTarget { text: string; revision: string }
export interface ProjectDocument {
  path: string;
  kind: 'text' | 'image' | 'binary' | 'large';
  size: number;
  text?: string;
  image?: string;
  revision: string;
  readOnly: boolean;
}
export type ProjectBrowserRequest =
  | ({ operation: 'projectFiles'; directory?: string } & Pick<ProjectFileTarget, 'cwd'>)
  | ({ operation: 'projectFileRead' } & ProjectFileTarget)
  | ({ operation: 'projectEntryAction' } & EntryRequest)
  | ({ operation: 'projectFileWrite' } & ProjectFileSave);

export interface ProjectBrowserClient {
  list: (cwd: string, directory?: string) => Promise<ProjectFilesResponse>;
  read: (target: ProjectFileTarget) => Promise<ProjectDocument>;
  save: (target: ProjectFileSave) => Promise<ProjectDocument>;
  mutate: (request: EntryRequest) => Promise<EntryChange>;
  transfer?: DownloadClient;
}

export function createProjectBrowserClient(request: <T>(request: ProjectBrowserRequest) => Promise<T>,
  transfer?: DownloadClient): ProjectBrowserClient {
  return {
    transfer,
    list: (cwd: string, directory?: string) =>
      request<ProjectFilesResponse>({ operation: 'projectFiles', cwd, directory }),
    read: (target: ProjectFileTarget) => request<ProjectDocument>({ operation: 'projectFileRead', ...target }),
    save: (target: ProjectFileSave) => request<ProjectDocument>({ operation: 'projectFileWrite', ...target }),
    mutate: (target: EntryRequest) => request<EntryChange>({ operation: 'projectEntryAction', ...target }),
  };
}
