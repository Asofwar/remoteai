import type { ProjectBrowserClient, ProjectDocument } from './protocol';
import { browserError } from './useProjectTree';
import { normalizedPath, withinPath, type EntryRequest } from './entryActions';

export interface DocumentTab {
  path: string;
  document?: ProjectDocument;
  text: string;
  loading: boolean;
  saving: boolean;
  error: string;
  saved: boolean;
  editorVersion: number;
  editedAt: number;
}

export const isDirty = (tab: DocumentTab) => tab.document?.kind === 'text' && tab.text !== tab.document.text;
export const canSave = (tab: DocumentTab) =>
  isDirty(tab) && !tab.loading && !tab.saving && !tab.document?.readOnly;

export interface DocumentsSnapshot { tabs: DocumentTab[]; activePath?: string; mutationPath?: string }

/** Owns independent drafts and request identities for one project browser. */
export class ProjectDocuments {
  private snapshot: DocumentsSnapshot = { tabs: [] };
  private listeners = new Set<() => void>();
  private reads = new Map<string, symbol>();

  constructor(private client: ProjectBrowserClient, private cwd: string, initial?: DocumentsSnapshot) {
    if (initial) this.snapshot = {
      ...initial, mutationPath: undefined, tabs: initial.tabs.map(tab => ({ ...tab, saving: false })),
    };
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: DocumentsSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }
  private update(path: string, changes: Partial<DocumentTab>) {
    this.publish({ ...this.snapshot,
      tabs: this.snapshot.tabs.map(tab => tab.path === path ? { ...tab, ...changes } : tab) });
  }
  get = (path?: string) => this.snapshot.tabs.find(tab => tab.path === path);
  resumeReads = () => {
    for (const tab of this.snapshot.tabs) {
      const needsRead = tab.loading || (!tab.document && !tab.error);
      if (needsRead && !this.reads.has(tab.path)) void this.reload(tab.path);
    }
  };
  select = (path: string) => {
    if (this.get(path)) this.publish({ ...this.snapshot, activePath: path });
  };
  open = async (path: string) => {
    if (this.snapshot.mutationPath) return;
    const existing = this.get(path);
    if (existing) {
      this.select(path);
      if (!existing.document && !existing.loading) await this.reload(path);
      return;
    }
    const tab: DocumentTab = { path, text: '', loading: true, saving: false, error: '', saved: false,
      editorVersion: 0, editedAt: 0 };
    this.publish({ tabs: [...this.snapshot.tabs, tab], activePath: path });
    await this.reload(path);
  };
  reload = async (path: string) => {
    const tab = this.get(path);
    if (!tab || tab.saving || this.snapshot.mutationPath) return;
    const request = Symbol(path);
    this.reads.set(path, request);
    this.update(path, { loading: true, error: '' });
    try {
      const document = await this.client.read({ cwd: this.cwd, path });
      if (this.reads.get(path) !== request) return;
      this.update(path, { document, text: document.text ?? '', saved: false,
        editorVersion: tab.editorVersion + 1, editedAt: 0 });
    } catch (failure) {
      if (this.reads.get(path) === request) this.update(path, { error: browserError(failure) });
    } finally {
      if (this.reads.get(path) === request) { this.reads.delete(path); this.update(path, { loading: false }); }
    }
  };
  edit = (path: string, text: string) => {
    const tab = this.get(path);
    if (tab && !tab.loading && !tab.document?.readOnly) this.update(path, { text, saved: false, editedAt: Date.now() });
  };
  save = async (path: string): Promise<boolean> => {
    if (this.snapshot.mutationPath) return false;
    const tab = this.get(path);
    if (!tab || !canSave(tab) || !tab.document) return false;
    this.update(path, { saving: true, error: '', saved: false });
    try {
      const document = await this.client.save({
        cwd: this.cwd, path: tab.document.path, text: tab.text, revision: tab.document.revision,
      });
      // Saving updates only the baseline; typing and switching tabs may continue during the request.
      this.update(path, { document, saved: true });
      return true;
    } catch (failure) {
      this.update(path, { error: browserError(failure) });
      return false;
    } finally { this.update(path, { saving: false }); }
  };
  saveAll = async (paths: string[]) => {
    for (const path of paths) {
      const tab = this.get(path);
      if (tab && isDirty(tab) && !await this.save(path)) return false;
    }
    return paths.every(path => { const tab = this.get(path); return !tab || !isDirty(tab); });
  };
  close = (path: string) => {
    if (this.snapshot.mutationPath) return;
    if (this.get(path)?.saving) return;
    this.reads.delete(path);
    const index = this.snapshot.tabs.findIndex(tab => tab.path === path);
    const tabs = this.snapshot.tabs.filter(tab => tab.path !== path);
    const activePath = this.snapshot.activePath === path
      ? tabs[Math.min(index, tabs.length - 1)]?.path : this.snapshot.activePath;
    this.publish({ tabs, activePath });
  };

  /** Pause autosave across a tree mutation and rebase all affected drafts together. */
  mutate = async (request: EntryRequest) => {
    if (this.snapshot.mutationPath || this.snapshot.tabs.some(tab => tab.saving || tab.loading)) {
      throw new Error('文件正在读写，请稍后重试。');
    }
    if (request.action === 'copy'
      && this.snapshot.tabs.some(tab => withinPath(tab.path, request.path) && isDirty(tab))) {
      throw new Error('请先保存此文件或文件夹中的修改，再复制。');
    }
    this.publish({ ...this.snapshot, mutationPath: request.path });
    try {
      const result = await this.client.mutate(request);
      if (request.action === 'rename' || request.action === 'move' || request.action === 'delete') {
        this.applyEntryChange(request, result.path);
      }
      return result;
    } finally { this.publish({ ...this.snapshot, mutationPath: undefined }); }
  };
  private applyEntryChange(request: EntryRequest, destination: string) {
    const affected = (path: string) => withinPath(path, request.path);
    const rebase = (path: string) => affected(path)
      ? normalizedPath(destination) + normalizedPath(path).slice(normalizedPath(request.path).length) : path;
    let tabs = this.snapshot.tabs;
    if (request.action === 'delete') tabs = tabs.filter(tab => !affected(tab.path));
    else tabs = tabs.map(tab => !affected(tab.path) ? tab : {
      ...tab, path: rebase(tab.path),
      document: tab.document ? { ...tab.document, path: rebase(tab.document.path) } : undefined,
    });
    const activePath = this.snapshot.activePath ? rebase(this.snapshot.activePath) : undefined;
    this.publish({ ...this.snapshot, tabs,
      activePath: tabs.some(tab => tab.path === activePath) ? activePath : tabs.at(-1)?.path });
  }
}
