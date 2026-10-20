import type { ProjectFilesResponse } from '../remote-chat/projectFiles';

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
  | ({ operation: 'projectFileWrite' } & ProjectFileSave);

export function createProjectBrowserClient(request: <T>(request: ProjectBrowserRequest) => Promise<T>) {
  return {
    list: (cwd: string, directory?: string) =>
      request<ProjectFilesResponse>({ operation: 'projectFiles', cwd, directory }),
    read: (target: ProjectFileTarget) => request<ProjectDocument>({ operation: 'projectFileRead', ...target }),
    save: (target: ProjectFileSave) => request<ProjectDocument>({ operation: 'projectFileWrite', ...target }),
  };
}
export type ProjectBrowserClient = ReturnType<typeof createProjectBrowserClient>;
