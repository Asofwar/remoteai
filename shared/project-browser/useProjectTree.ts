import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectFile, ProjectFilesResponse } from '../remote-chat/projectFiles';
import type { ProjectBrowserClient } from './protocol';

export interface TreeRow { entry: ProjectFile; depth: number }
export interface DirectoryState { data?: ProjectFilesResponse; error?: string; loading?: boolean }
export const browserError = (error: unknown) =>
  typeof error === 'string' ? error : error instanceof Error ? error.message : '文件暂时无法读取，请重试。';

function flatten(directories: Record<string, DirectoryState>, expanded: Set<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (directory: string, depth: number) => {
    for (const entry of directories[directory]?.data?.entries ?? []) {
      rows.push({ entry, depth });
      if (entry.directory && expanded.has(entry.path)) visit(entry.path, depth + 1);
    }
  };
  visit('', 0);
  return rows;
}

export function useProjectTree(client: ProjectBrowserClient, cwd: string, connected: boolean) {
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [expanded, setExpanded] = useState(new Set<string>());
  const generation = useRef(0);
  const pending = useRef(new Set<string>());
  const load = useCallback(async (directory: string) => {
    if (!connected || pending.current.has(directory)) return;
    const current = generation.current;
    pending.current.add(directory);
    setDirectories(value => ({ ...value, [directory]: { ...value[directory], loading: true, error: undefined } }));
    try {
      const data = await client.list(cwd, directory);
      if (current === generation.current) setDirectories(value => ({ ...value, [directory]: { data } }));
    } catch (error) {
      if (current === generation.current) {
        setDirectories(value => ({ ...value, [directory]: { error: browserError(error) } }));
      }
    } finally { if (current === generation.current) pending.current.delete(directory); }
  }, [client, cwd, connected]);
  const refresh = useCallback(() => {
    generation.current += 1; pending.current.clear(); setExpanded(new Set()); setDirectories({});
    void load('');
  }, [load]);
  useEffect(() => {
    refresh();
    return () => { generation.current += 1; pending.current.clear(); };
  }, [refresh]);
  const toggle = (entry: ProjectFile) => {
    setExpanded(value => {
      const next = new Set(value);
      if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path);
      return next;
    });
    if (!directories[entry.path]?.data) void load(entry.path);
  };
  return { directories, expanded, rows: flatten(directories, expanded), toggle, load, refresh };
}
