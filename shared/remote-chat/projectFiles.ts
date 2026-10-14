export interface ProjectFile {
  name: string;
  path: string;
  directory: boolean;
  relativePath?: string;
}
export interface ProjectFilesRequest {
  threadId?: string;
  cwd?: string;
  directory?: string;
  imagesOnly?: boolean;
  /** Search names and relative paths recursively instead of browsing one directory. */
  query?: string;
}
export interface ProjectFilesResponse {
  directory: string;
  parent: string | null;
  entries: ProjectFile[];
  truncated: boolean;
}
