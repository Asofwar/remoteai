import type { ProjectFileTarget } from './protocol';
import type { ProjectFile } from '../remote-chat/projectFiles';

export type EntryAction =
  | { action: 'createFile' | 'createFolder' | 'rename'; name: string }
  | { action: 'copy' | 'move'; directory: string }
  | { action: 'delete' };
export type EntryRequest = ProjectFileTarget & EntryAction;
export interface EntryChange { path: string; directory: boolean }

export interface BrowserHost {
  copyPath: (path: string) => Promise<void>;
  open?: (entry: ProjectFile, application: 'explorer' | 'terminal') => Promise<void>;
  download?: (target: ProjectFileTarget) => Promise<string>;
}

export const normalizedPath = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '');
export const withinPath = (path: string, parent: string) => {
  const value = normalizedPath(path);
  const root = normalizedPath(parent);
  return value === root || value.startsWith(`${root}/`);
};
export const parentPath = (path: string) => {
  const value = normalizedPath(path);
  return value.slice(0, value.lastIndexOf('/')) || '/';
};

export function entryNameError(name: string) {
  if (!name || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(name)
    || /[. ]$/.test(name) || name.length > 255) return '名称无效，请勿使用路径分隔符或特殊字符。';
  return '';
}
